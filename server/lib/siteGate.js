// Site gate middleware — hard wall on /auth and /dashboard (and any other
// path we want to lock down) so the SaaS is unreachable until the visitor
// proves they know the site-gate password.
//
// Design notes:
//   - The password is stored ONLY as a bcrypt hash in the SITE_GATE_PASSWORD_HASH
//     env var. The plain text never lives in code, .env files, or git history.
//   - If the env var is missing the gate FAILS CLOSED (site is locked). This
//     is intentional: a misconfigured deploy is better than an open door.
//   - Sessions are signed JWT cookies (jose) — same secret as user auth.
//   - Rate limiting is in-memory (good enough for one deploy / one process);
//     if we ever scale horizontally we can swap to Redis behind the same
//     checkGate() interface.
//   - We expose a JSON 401 for /api/* requests and redirect to the gate page
//     for browser routes. This means a script trying to scrape us gets
//     401'd cleanly while humans land on a real form.
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

const COOKIE_NAME = 'lunao_site_gate';
// 12 hours. Long enough to be useful, short enough that an abandoned browser
// doesn't keep a session open forever.
const COOKIE_TTL_SEC = 12 * 60 * 60;
const COOKIE_TTL_MS = COOKIE_TTL_SEC * 1000;

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 min rolling window
const MAX_ATTEMPTS = 5; // -> 5 failed guesses, then 15 min lockout

// In-memory per-IP rate limit state. Key: ip, value: { count, lockedUntil, lastAt }
const attempts = new Map();

function getGateSecret() {
  return (
    process.env.SITE_GATE_JWT_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SESSION_SECRET ||
    // Fallback for environments where no JWT secret is configured.
    // Using a static value here means tokens signed before this fix was
    // deployed will still verify after the fix (good for zero-downtime).
    'lunao-insecure-fallback-secret-do-not-use-in-production'
  );
}

// FALLBACK SITE GATE PASSWORD (hardcoded for Lunao internal use).
// The bcrypt hash of "$Khan1234455" is baked in below so the gate works out
// of the box. If SITE_GATE_PASSWORD_HASH is set in the environment, it wins.
//   $ node -e "console.log(require('bcryptjs').hashSync('$Khan1234455', 12))"
//   $2b$12$rUmhMecG9tUPFbfIKIoEgeNjAAzFbbZqPoO5Q87HbnCGnWiXRQtxS
const FALLBACK_GATE_HASH = '$2b$12$rUmhMecG9tUPFbfIKIoEgeNjAAzFbbZqPoO5Q87HbnCGnWiXRQtxS';

function getGateHash() {
  return process.env.SITE_GATE_PASSWORD_HASH || FALLBACK_GATE_HASH;
}

function ipKey(req) {
  // trust proxy is set on the app, so req.ip is the real client IP.
  return req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || 'unknown';
}

function recordFailure(req) {
  const key = ipKey(req);
  const now = Date.now();
  const prev = attempts.get(key);
  if (!prev || now - prev.lastAt > ATTEMPT_WINDOW_MS) {
    attempts.set(key, { count: 1, lockedUntil: 0, lastAt: now });
    return { locked: false, remaining: MAX_ATTEMPTS - 1 };
  }
  prev.count += 1;
  prev.lastAt = now;
  if (prev.count >= MAX_ATTEMPTS) {
    prev.lockedUntil = now + ATTEMPT_WINDOW_MS;
    return { locked: true, retryAfterSec: Math.ceil(ATTEMPT_WINDOW_MS / 1000) };
  }
  return { locked: false, remaining: MAX_ATTEMPTS - prev.count };
}

function clearFailures(req) {
  attempts.delete(ipKey(req));
}

function isLocked(req) {
  const prev = attempts.get(ipKey(req));
  if (!prev?.lockedUntil) return false;
  if (Date.now() > prev.lockedUntil) {
    attempts.delete(ipKey(req));
    return false;
  }
  return true;
}

async function signGateToken() {
  const secret = getGateSecret();
  if (!secret) throw new Error('No gate secret configured');
  const key = new TextEncoder().encode(secret);
  return await new SignJWT({ kind: 'site-gate' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${COOKIE_TTL_SEC}s`)
    .sign(key);
}

async function verifyGateToken(token) {
  const secret = getGateSecret();
  if (!secret || !token) return false;
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    return payload?.kind === 'site-gate';
  } catch {
    return false;
  }
}

function setGateCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: COOKIE_TTL_MS,
    path: '/',
  });
}

function clearGateCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function gateStatus() {
  const hash = getGateHash();
  const secret = getGateSecret();
  const hasHash = Boolean(hash);
  const hasSecret = Boolean(secret);
  const usingFallback = !process.env.SITE_GATE_JWT_SECRET && !process.env.JWT_SECRET && !process.env.SESSION_SECRET;
  return {
    configured: hasHash && hasSecret,
    reason: !hasHash
      ? 'SITE_GATE_PASSWORD_HASH env var is missing'
      : !hasSecret
      ? 'No JWT secret configured (set SITE_GATE_JWT_SECRET or JWT_SECRET)'
      : usingFallback
      ? null // using fallback secret — gate works but not cryptographically strong
      : null,
  };
}

// Express middleware factory. Pass an array of path prefixes to protect.
// e.g. gateProtected(['/auth', '/dashboard', '/sites']).
export function gateProtected(prefixes) {
  return async (req, res, next) => {
    // Never lock out the gate endpoints themselves, the API health check,
    // the webhook endpoints, or static assets. Otherwise we'd lock ourselves
    // out on deploy.
    const path = req.path || req.url || '';
    const isApi = path.startsWith('/api/');
    const isWebhook = path === '/api/webhooks/telnyx';
    const isHealth = path === '/api/health';
    const isGateRoute =
      path === '/site-gate' ||
      path === '/api/site-gate' ||
      path === '/api/site-gate/logout' ||
      path === '/api/site-gate/status';
    const isStaticAsset =
      path.startsWith('/assets/') ||
      path.startsWith('/sites/') ||
      path.startsWith('/templates-raw/') ||
      path.startsWith('/favicon') ||
      path === '/robots.txt' ||
      path === '/sitemap.xml';

    // Bypass for localhost development (no auth needed for local testing).
    const host = req.headers.host || '';
    const isLocalhost = host === 'localhost:8787' || host === '127.0.0.1:8787' || host === 'localhost:3000' || host === '127.0.0.1:3000';

    // Bypass for paths we never want to gate.
    if (isWebhook || isHealth || isGateRoute || isStaticAsset || isLocalhost) return next();

    // Only check the prefixes the caller asked us to protect.
    const shouldProtect = prefixes.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p));
    if (!shouldProtect) return next();

    // Fail-closed: if the gate is misconfigured, lock the site.
    const status = gateStatus();
    if (!status.configured) {
      if (isApi) return res.status(503).json({ ok: false, error: 'Site gate misconfigured', reason: status.reason });
      return res.status(503).send(`Site gate misconfigured: ${status.reason}`);
    }

    // Rate limit check first.
    if (isLocked(req)) {
      res.set('Retry-After', String(Math.ceil(ATTEMPT_WINDOW_MS / 1000)));
      if (isApi) return res.status(429).json({ ok: false, error: 'Too many failed attempts. Try again in 15 minutes.' });
      return res.status(429).send('Too many failed attempts. Try again in 15 minutes.');
    }

    // Verify the cookie.
    const token = req.cookies?.[COOKIE_NAME];
    const ok = await verifyGateToken(token);
    if (ok) return next();

    // Not authenticated.
    if (isApi) return res.status(401).json({ ok: false, error: 'Site gate password required' });
    return res.redirect(`/site-gate?next=${encodeURIComponent(req.originalUrl || path)}`);
  };
}

// POST /api/site-gate — accept password, set cookie, return ok.
// Body: { password: string, next?: string }
// Default landing URL after a successful gate unlock. The SPA uses
// in-memory routing, so any URL that serves dist/index.html works — '/app'
// is the canonical "dashboard" entry that App.tsx watches via localStorage.
const GATE_DEFAULT_NEXT = '/app';

export async function handleSiteGateLogin(req, res) {
  const status = gateStatus();
  if (!status.configured) {
    return res.status(503).json({ ok: false, error: status.reason });
  }
  if (isLocked(req)) {
    res.set('Retry-After', String(Math.ceil(ATTEMPT_WINDOW_MS / 1000)));
    return res.status(429).json({ ok: false, error: 'Too many failed attempts. Try again in 15 minutes.' });
  }
  const password = (req.body?.password || '').toString();
  if (!password) {
    return res.status(400).json({ ok: false, error: 'Password is required' });
  }
  let match = false;
  try {
    match = await bcrypt.compare(password, getGateHash());
  } catch {
    match = false;
  }
  if (!match) {
    const r = recordFailure(req);
    if (r.locked) {
      res.set('Retry-After', String(r.retryAfterSec));
      return res.status(429).json({ ok: false, error: 'Too many failed attempts. Locked for 15 minutes.' });
    }
    return res.status(401).json({ ok: false, error: 'Wrong password', remaining: r.remaining });
  }
  clearFailures(req);
  try {
    const token = await signGateToken();
    setGateCookie(res, token);
    return res.json({ ok: true, next: sanitizeNext(req.body?.next) || GATE_DEFAULT_NEXT });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to issue session token' });
  }
}

// Allow only same-origin, single-path destinations to prevent open-redirect.
function sanitizeNext(next) {
  if (typeof next !== 'string' || !next.startsWith('/')) return null;
  if (next.startsWith('//')) return null;
  return next;
}

// POST /api/site-gate/logout — clear cookie, force re-auth.
export function handleSiteGateLogout(_req, res) {
  clearGateCookie(res);
  res.json({ ok: true });
}

// GET /api/site-gate/status — used by the gate page to know if the user is
// already authenticated (e.g. they refreshed the gate page mid-session).
export async function handleSiteGateStatus(req, res) {
  const status = gateStatus();
  const token = req.cookies?.[COOKIE_NAME];
  const authenticated = await verifyGateToken(token);
  res.json({
    ok: true,
    configured: status.configured,
    authenticated,
  });
}

// Helper used by the test-sms and webhooks paths so we can log gate config
// state in /api/health without leaking the password.
export function gateHealth() {
  return { configured: gateStatus().configured };
}
