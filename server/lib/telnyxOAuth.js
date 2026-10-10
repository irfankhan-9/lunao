// Telnyx OAuth + Telnyx API helpers.
// Flow:
//   1. Frontend → /api/telnyx/oauth/url                  (builds auth URL)
//   2. Telnyx redirects user → /api/telnyx/callback?code=…&state=…
//   3. We exchange code → access_token + refresh_token, fetch the user profile,
//      encrypt both tokens, and persist them in telnyx_connections
//   4. On SMS send: fetch row → decrypt access_token → if expired, refresh via
//      refresh_token → POST to https://api.telnyx.com/v2/messages
//
// Telnyx's OAuth surface only exposes one scope today ("admin"), which is full
// account access. The redirect endpoint, token endpoint, and PKCE behaviour
// match the standard RFC 6749 authorization code flow.
import crypto from 'node:crypto';
import { telnyxOAuth } from './config.js';
import { encryptToken, decryptToken } from './emailCrypto.js';

const TELNYX_AUTH_URL = telnyxOAuth.authorizationUrl || 'https://api.telnyx.com/v2/oauth/authorize';
const TELNYX_TOKEN_URL = telnyxOAuth.tokenUrl || 'https://api.telnyx.com/v2/oauth/token';
// Telnyx has no public "whoami" endpoint for OAuth access tokens yet — the
// canonical way to confirm a token works is to list phone numbers. We use the
// lightest call available.
const TELNYX_PHONE_NUMBERS_URL = 'https://api.telnyx.com/v2/phone_numbers?page[size]=1';

const FETCH_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ----- PKCE helpers (RFC 7636) -----
// We register Telnyx OAuth clients with `require_pkce: true`, so the token
// endpoint will reject any authorization_code exchange that doesn't include
// the matching code_verifier. The state -> codeVerifier mapping lives in
// server/index.js's `oauthStateStore` Map so it survives the round-trip to
// Telnyx and back.
export function generatePkceVerifier() {
  // 32 random bytes → base64url → 43 chars. RFC 7636 §4.1 allows 43–128.
  return crypto.randomBytes(32).toString('base64url');
}

export function pkceChallengeS256(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function generatePkcePair() {
  const verifier = generatePkceVerifier();
  const challenge = pkceChallengeS256(verifier);
  return { codeVerifier: verifier, codeChallenge: challenge, codeChallengeMethod: 'S256' };
}

// ----- Build authorization URL -----
// The user clicks "Connect with Telnyx" → frontend opens this URL → Telnyx
// shows their hosted consent screen → on Approve they bounce back to our
// /api/telnyx/callback with a one-time `code`.
//
// Pass `codeChallenge` + `codeChallengeMethod: 'S256'` to satisfy PKCE on
// confidential clients registered with `require_pkce: true`.
export function buildTelnyxAuthUrl({ redirectUri, state, codeChallenge, codeChallengeMethod = 'S256' }) {
  if (!telnyxOAuth.enabled) {
    throw new Error('Telnyx OAuth not configured — set TELNYX_CLIENT_ID and TELNYX_CLIENT_SECRET');
  }
  const params = new URLSearchParams({
    client_id: telnyxOAuth.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: telnyxOAuth.scopes,
    state,
  });
  if (codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', codeChallengeMethod);
  }
  return `${TELNYX_AUTH_URL}?${params.toString()}`;
}

// ----- Exchange authorization code → tokens -----
// Standard RFC 6749 §4.1.3 token request. `codeVerifier` is the PKCE
// verifier we generated in /api/telnyx/oauth/url and stashed against the
// `state` token. Telnyx will reject the exchange if it's missing or wrong.
export async function exchangeTelnyxCode({ code, redirectUri, codeVerifier }) {
  if (!telnyxOAuth.enabled) {
    throw new Error('Telnyx OAuth not configured');
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: telnyxOAuth.clientId,
    redirect_uri: redirectUri,
  });
  // Only attach client_secret when the registered client is confidential.
  // Public clients authenticate via PKCE alone (RFC 6749 §4.1.3); sending
  // an empty `client_secret` would cause some OAuth providers to reject
  // the request.
  if (telnyxOAuth.clientSecret) {
    body.set('client_secret', telnyxOAuth.clientSecret);
  }
  if (codeVerifier) {
    body.set('code_verifier', codeVerifier);
  }
  const res = await fetchWithTimeout(TELNYX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telnyx token exchange failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data; // { access_token, refresh_token?, expires_in?, scope?, token_type }
}

// ----- Mint a fresh access_token using the stored refresh_token -----
// Called at SMS-send time when the cached access_token is expired or missing.
export async function refreshTelnyxAccessToken(refreshToken) {
  if (!telnyxOAuth.enabled) {
    throw new Error('Telnyx OAuth not configured');
  }
  if (!refreshToken) {
    const err = new Error('Telnyx refresh failed: no refresh_token on file');
    err.code = 'TOKEN_REVOKED';
    throw err;
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: telnyxOAuth.clientId,
  });
  if (telnyxOAuth.clientSecret) {
    body.set('client_secret', telnyxOAuth.clientSecret);
  }
  const res = await fetchWithTimeout(TELNYX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Telnyx refresh failed (${res.status}): ${text}`);
    err.code = res.status === 400 || res.status === 401 ? 'TOKEN_REVOKED' : 'REFRESH_FAILED';
    throw err;
  }
  return res.json(); // { access_token, expires_in, scope, token_type, refresh_token? }
}

// ----- Validate a freshly-minted access_token by listing phone numbers -----
// Returns the email/account identifier associated with the token if we can
// find one. Telnyx does not currently expose a userinfo endpoint, so we use
// the first page of phone numbers as both a liveness check and a way to
// surface the account.
export async function getTelnyxProfile(accessToken) {
  if (!accessToken) throw new Error('getTelnyxProfile called without an access token');
  const res = await fetchWithTimeout(TELNYX_PHONE_NUMBERS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Telnyx profile lookup failed (${res.status}): ${text || res.statusText}`);
  }
  const data = await res.json().catch(() => ({}));
  const meta = data?.meta || {};
  // Telnyx returns a meta block with total_results when listing. We use that
  // as a "how many numbers does this account own?" signal so the UI can show
  // "3 numbers connected" right after the user finishes OAuth.
  const totalNumbers = typeof meta.total_results === 'number' ? meta.total_results : null;
  return { totalNumbers };
}

// ----- Helper used by server endpoints: store/retrieve tokens -----
export function encryptTelnyxTokenForStorage(token) {
  return encryptToken(token);
}

export function decryptTelnyxTokenForUse(encrypted) {
  return decryptToken(encrypted);
}