// Bearer-token auth middleware for the Lunao Owner PWA.
//
// Token format: lunao.<base64url(code)>.<timestamp>
//   - The code segment resolves the slug via the invite_codes table.
//   - If the code is missing, malformed, revoked, or doesn't match a row,
//     the request is rejected with 401.
//
// After successful auth, the middleware attaches:
//   req.tenantSlug  - the slug the token is bound to
//   req.code        - the redeemed invite code
//   req.authedAt    - timestamp (ms) the token was minted
//
// To prevent write-storms against invite_codes, last_active_at is
// throttled to once per 60s per slug using an in-memory map.
import { findByCode, touchCode } from './inviteCodes.js';

const TOKEN_RE = /^lunao\.([A-Za-z0-9_-]+)\.(\d+)$/;

const lastActiveWrites = new Map(); // slug -> ms
const ACTIVE_THROTTLE_MS = 60_000;

function decodeToken(token) {
  const m = String(token).match(TOKEN_RE);
  if (!m) return null;
  let code;
  try {
    const decoded = Buffer.from(m[1], 'base64url').toString('utf8');
    code = decoded.trim().toUpperCase();
  } catch {
    return null;
  }
  if (!/^LUNAO-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(code)) return null;
  const mintedAt = Number(m[2]);
  return { code, mintedAt: Number.isFinite(mintedAt) ? mintedAt : 0 };
}

export function pwaAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res
      .status(401)
      .json({ ok: false, error: 'Missing bearer token. Authorization: Bearer <token>.' });
  }
  const token = auth.slice(7).trim();
  const decoded = decodeToken(token);
  if (!decoded) {
    return res
      .status(401)
      .json({ ok: false, error: 'Malformed token.' });
  }
  const row = findByCode(decoded.code);
  if (!row) {
    return res
      .status(401)
      .json({ ok: false, error: 'Invalid or revoked invite code.' });
  }
  if (row.revokedAt) {
    return res
      .status(401)
      .json({ ok: false, error: 'This invite code has been revoked.' });
  }
  req.tenantSlug = row.slug;
  req.code = row.code;
  req.authedAt = decoded.mintedAt;

  // Throttled activity tracking.
  const prev = lastActiveWrites.get(row.slug) || 0;
  if (Date.now() - prev > ACTIVE_THROTTLE_MS) {
    lastActiveWrites.set(row.slug, Date.now());
    try {
      touchCode(decoded.code, req.headers['user-agent']?.slice(0, 64));
    } catch {
      /* non-fatal */
    }
  }

  next();
}

// Helper for routes mounted at /api/pwa/:slug/... — enforces that the
// slug in the URL matches the slug resolved from the bearer token.
export function assertSameSlug(req, res, next) {
  const urlSlug = String(req.params.slug || '').toLowerCase();
  const tokenSlug = String(req.tenantSlug || '').toLowerCase();
  if (!urlSlug || urlSlug !== tokenSlug) {
    return res
      .status(403)
      .json({ ok: false, error: 'Token does not have access to this business.' });
  }
  next();
}

// Pure helper exported for tests / dev tooling.
export function decodePwaToken(token) {
  return decodeToken(token);
}
