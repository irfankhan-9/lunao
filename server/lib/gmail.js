// Gmail OAuth + Gmail API send helpers.
// Flow:
//   1. Frontend → /api/email-accounts/oauth/url?provider=gmail  (builds auth URL)
//   2. Provider redirects user → /api/email-accounts/callback?code=…&state=…
//   3. We exchange code → refresh_token, fetch user info, store encrypted refresh_token
//   4. On send: refresh_token → fresh access_token → POST to gmail.googleapis.com
import { googleOAuth, emailCrypto } from './config.js';
import { encryptToken, decryptToken } from './emailCrypto.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
// OpenID userinfo endpoint — requires `openid email profile` in the scope.
// Gmail's own /profile endpoint also requires the audience to include openid
// before Google will accept the bearer token for an identity lookup.
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
// Fallback: Gmail API's own profile endpoint.
const GMAIL_PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';

// ----- fetch with a hard timeout -----
// Node's built-in `fetch` has no default timeout, so a hung Google API call
// can park a worker indefinitely (the entire pipeline stalls on the queued
// `enqueueOnAccount` slot). We wrap every outbound call with AbortController
// so a single hung request surfaces as a clear error after ~12s, letting
// the per-account queue move on and report the failure cleanly.
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

// ----- Build authorization URL -----
export function buildGmailAuthUrl({ redirectUri, state }) {
  if (!googleOAuth.enabled) {
    throw new Error('Gmail OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
  }
  const params = new URLSearchParams({
    client_id: googleOAuth.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: googleOAuth.scopes,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'select_account consent', // allow choosing another account and fresh refresh_token
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

// ----- Exchange authorization code → tokens -----
export async function exchangeGmailCode({ code, redirectUri, allowAccessTokenFallback = false }) {
  if (!googleOAuth.enabled) {
    throw new Error('Gmail OAuth not configured');
  }
  const body = new URLSearchParams({
    code,
    client_id: googleOAuth.clientId,
    client_secret: googleOAuth.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  if (!data.refresh_token && !allowAccessTokenFallback) {
    // Means user already authorized this app and Google didn't re-issue one.
    // We must rotate the connection (prompt=consent forces this on first connect).
    throw new Error('No refresh_token returned. Reconnect with prompt=consent to grant offline access.');
  }
  return data; // { access_token, refresh_token?, expires_in, scope, token_type, id_token? }
}

export async function inspectGoogleAccessToken(accessToken) {
  if (!accessToken) return { valid: false, hasSendScope: false, error: 'Missing access token' };
  try {
    const res = await fetchWithTimeout(`${GOOGLE_TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { valid: false, hasSendScope: false, error: `Google token expired or invalid (${res.status}): ${txt.slice(0, 120)}` };
    }
    const d = await res.json();
    const scopes = String(d?.scope || '');
    const hasSendScope = scopes.includes('https://www.googleapis.com/auth/gmail.send') || scopes.includes('https://mail.google.com/');
    return {
      valid: true,
      hasSendScope,
      email: d?.email || null,
      expiresIn: Number(d?.expires_in) || 0,
      scope: scopes,
    };
  } catch (err) {
    return { valid: false, hasSendScope: false, error: err.message };
  }
}

// ----- Use refresh_token to mint fresh access_token (called at send time) -----
export async function refreshGmailAccessToken(refreshToken) {
  if (!googleOAuth.enabled) {
    throw new Error('Gmail OAuth not configured');
  }
  const body = new URLSearchParams({
    client_id: googleOAuth.clientId,
    client_secret: googleOAuth.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Google refresh failed (${res.status}): ${text}`);
    err.code = res.status === 400 || res.status === 401 ? 'TOKEN_REVOKED' : 'REFRESH_FAILED';
    throw err;
  }
  return res.json(); // { access_token, expires_in, scope, token_type }
}

// ----- Get user profile (email + name) using access_token -----
// Strategy: try Gmail API `/users/me/profile` FIRST (we have `gmail.send`
// in scope, so this token is guaranteed valid for it). Only fall back to
// OpenID userinfo if Gmail returns no useful address. This avoids the 401
// `invalid_token` errors that Google's OpenID endpoint throws when the
// token isn't shaped exactly right (Google's OAuth verification quirks).
export async function getGmailUserProfile(accessToken) {
  if (!accessToken) throw new Error('getGmailUserProfile called without an access token');
  
  // 1. Google TokenInfo endpoint — zero extra permissions required, directly validates token and extracts email
  try {
    const r0 = await fetchWithTimeout(`${GOOGLE_TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`);
    if (r0.ok) {
      const d = await r0.json();
      if (d && d.email) {
        return { email: d.email, displayName: d.email };
      }
    }
  } catch (err) {
    lastProfileErr = err;
  }

  // 2. OpenID userinfo v1 endpoint
  try {
    const r2 = await fetchWithTimeout(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (r2.ok) {
      const d = await r2.json();
      if (d && d.email) return { email: d.email, displayName: d.name || d.email };
    }
  } catch (err) {
    lastProfileErr = err;
  }

  // 3. Gmail's own profile endpoint
  try {
    const r1 = await fetchWithTimeout(GMAIL_PROFILE_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (r1.ok) {
      const d = await r1.json();
      if (d && d.emailAddress) {
        return { email: d.emailAddress, displayName: d.emailAddress };
      }
    }
  } catch (err) {
    lastProfileErr = err;
  }
  
  throw new Error(
    `Could not fetch Google profile: ${lastProfileErr?.message || 'unknown'}`
  );
}

let lastProfileErr = null;

// ----- Encode and send a raw email via Gmail API -----
// Gmail expects a base64url-encoded RFC 5322 message under `raw`.
export async function sendGmailEmail({ refreshToken, to, from, subject, body, fromName }) {
  if (!refreshToken) {
    throw new Error('No Google authorization token available for this account. Please reconnect via Google OAuth.');
  }
  if (refreshToken === 'seed_encrypted_token_ready' || refreshToken.startsWith('mock_')) {
    throw new Error('This account requires active Google authorization. Please click "Connect Account" to grant Gmail send permissions.');
  }

  let accessToken;
  // If the stored token is a direct Google OAuth access token (starts with ya29.):
  if (typeof refreshToken === 'string' && refreshToken.startsWith('ya29.')) {
    accessToken = refreshToken;
  } else {
    try {
      const tokenData = await refreshGmailAccessToken(refreshToken);
      accessToken = tokenData.access_token;
    } catch (refreshErr) {
      throw new Error(`Google token refresh failed: ${refreshErr.message}. Please reconnect your Gmail account.`);
    }
  }

  // Build the From header. If fromName is provided we use "Name <email>".
  const cleanName = fromName ? String(fromName).replace(/[\r\n"]/g, '').trim() : '';
  const fromHeader = cleanName ? `"${encodeSubject(cleanName)}" <${from}>` : from;

  // Simple RFC 5322. We keep it minimal but valid (no attachments).
  const normalizedBody = String(body || '').replace(/\r?\n/g, '\r\n');
  const headers = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
  ];
  const message = `${headers.join('\r\n')}\r\n\r\n${normalizedBody}`;
  const raw = Buffer.from(message, 'utf8').toString('base64url');

  const res = await fetchWithTimeout(GMAIL_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail send failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  if (!data || !data.id) {
    throw new Error(`Gmail API returned status ${res.status} but no message ID was provided.`);
  }
  return { messageId: data.id, threadId: data.threadId };
}

function encodeSubject(s) {
  // RFC 2047 base64 encoding for non-ASCII, fall back to plain.
  if (!s) return '';
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}

// ----- Helper used by server endpoints: store a new account row -----
export function encryptRefreshTokenForStorage(refreshToken) {
  return encryptToken(refreshToken);
}

export function decryptRefreshTokenForUse(encryptedRefreshToken) {
  return decryptToken(encryptedRefreshToken);
}
