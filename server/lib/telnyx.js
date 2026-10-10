// Telnyx SMS delivery.
//
// Two ways to authenticate against Telnyx:
//   1. Single-tenant API key (TELNYX_API_KEY + TELNYX_PHONE_NUMBER in .env) —
//      used when SMS is enabled at the server level. Owner-agnostic.
//   2. Per-owner OAuth token stored in telnyx_connections — used when the
//      caller passes { accountId } to sendSms. The token is decrypted and
//      refreshed if expired before each send.
//
// LIVE mode (TELNYX_API_KEY + TELNYX_PHONE_NUMBER set): real outbound SMS.
// DRY-RUN mode: the message is logged and returned as "simulated" so the full
// pipeline can be tested without spending money or needing carrier approval.
import { telnyx } from './config.js';

// Normalize a US-style display phone into E.164 (+1XXXXXXXXXX).
export function toE164(phone) {
  const raw = String(phone || '').replace(/[^\d+]/g, '');
  if (raw.startsWith('+')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits ? `+${digits}` : '';
}

// Replace the SMS template tokens with real values.
export function renderSms(template, { businessName, city, siteUrl }) {
  return String(template || '')
    .replace(/\{\{\s*business_name\s*\}\}/gi, businessName || '')
    .replace(/\{\{\s*city\s*\}\}/gi, city || '')
    .replace(/\{\{\s*site_url\s*\}\}/gi, siteUrl || '');
}

// Approximate the GSM-7 segment count Telnyx will bill us for.
export function countSegments(text) {
  const len = String(text || '').length;
  if (len <= 160) return 1;
  if (len <= 306) return 2;
  if (len <= 459) return 3;
  return Math.ceil(len / 153);
}

// Telnyx error codes that are NOT worth retrying — invalid number, blocked,
// opted-out, etc. Everything else (5xx, network, 429) gets a retry.
const PERMANENT_ERROR_CODES = new Set([
  '10001', // Authentication error
  '10002', // Wrong number
  '10003', // Blocked as spam
  '10004', // Destination is not a valid mobile number
  '10005', // Destination opted out
  '10006', // Number on do-not-disturb list
  '40002', // Invalid phone number
  '40003', // Phone number not provisioned
  '40004', // Phone number is not SMS-capable
  '40010', // Destination is on the opt-out list
]);

function isPermanentError(code) {
  return code && PERMANENT_ERROR_CODES.has(String(code));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Single attempt (no retry). Used internally and by the retry wrapper below.
//
// authMode:
//   "apiKey" (default) — uses TELNYX_API_KEY from .env, sends from TELNYX_PHONE_NUMBER
//   "oauth"            — uses the access token resolved from telnyx_connections
//                        row identified by `accountId`; sends from `from`
async function attemptSend({ to, text, accountId, from, authMode = 'apiKey', accessToken }) {
  const dest = toE164(to);
  if (!dest) {
    return { status: 'failed', simulated: !telnyx.live, error: 'Invalid destination phone', errorCode: 'E_INVALID_PHONE' };
  }

  // DRY-RUN gate. The OAuth path follows the same "if SMS master switch is
  // off, simulate" rule — we never send real SMS in DRY-RUN, regardless of
  // which auth path the caller chose.
  if (!telnyx.enabled) {
    return {
      status: 'simulated',
      simulated: true,
      to: dest,
      text,
      segmentCount: countSegments(text),
    };
  }

  let bearerToken;
  let senderNumber;
  let messagingProfileId = null;

  if (authMode === 'oauth') {
    if (!accessToken) {
      return {
        status: 'failed',
        simulated: false,
        to: dest,
        error: 'No OAuth access token available — Telnyx account not connected or token expired.',
        errorCode: 'E_NO_TOKEN',
      };
    }
    bearerToken = accessToken;
    senderNumber = from;
    // OAuth connections don't expose a messaging_profile_id by default.
  } else {
    bearerToken = telnyx.apiKey;
    senderNumber = from || telnyx.from;
    messagingProfileId = telnyx.messagingProfileId || null;
  }

  if (!senderNumber) {
    return {
      status: 'failed',
      simulated: false,
      to: dest,
      error: authMode === 'oauth'
        ? 'Sender number not selected for this Telnyx account.'
        : 'No sender number configured. Set TELNYX_PHONE_NUMBER.',
      errorCode: 'E_NO_FROM',
    };
  }

  const body = {
    from: senderNumber,
    to: dest,
    text,
  };
  if (messagingProfileId) body.messaging_profile_id = messagingProfileId;

  let res;
  try {
    res = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { status: 'failed', simulated: false, to: dest, error: `Network error: ${err.message}`, errorCode: 'E_NETWORK' };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errObj = data?.errors?.[0] || {};
    const detail = errObj.detail || `HTTP ${res.status}`;
    const code = errObj.code ? String(errObj.code) : `HTTP_${res.status}`;
    return { status: 'failed', simulated: false, to: dest, error: detail, errorCode: code };
  }

  const id = data?.data?.id || null;
  const segments = data?.data?.parts ?? countSegments(text);
  return {
    status: 'sent',
    simulated: false,
    to: dest,
    id,
    segmentCount: segments,
  };
}

// sendSms: public send with exponential-backoff retry (1s, 2s) on transient
// errors. Permanent Telnyx codes fail fast without retry.
//
// When `accountId` is supplied, the OAuth path is used: the row's stored
// access token is decrypted (and refreshed if expired) before each attempt.
// Otherwise we fall back to the single-tenant TELNYX_API_KEY auth.
//
// `from` is required when accountId is supplied (the chosen sender number).
export async function sendSms({ to, text, maxAttempts = 3, accountId, from } = {}) {
  // Resolve OAuth access token up-front (lazily importing the OAuth module
  // so this file keeps working in environments without emailCrypto).
  let accessToken = null;
  let authMode = 'apiKey';
  if (accountId) {
    authMode = 'oauth';
    try {
      // Dynamic import keeps the OAuth module out of the boot path of
      // contexts that don't use it (e.g. the SMS dry-run unit tests).
      const { resolveTelnyxAccessToken: resolver, getTelnyxConnection: getter } =
        await import('./telnyxConnections.js');
      const { refreshTelnyxAccessToken: refresher, decryptTelnyxTokenForUse: decrypter } =
        await import('./telnyxOAuth.js');
      const { encryptTelnyxTokenForStorage: encrypter } = await import('./telnyxOAuth.js');

      const conn = getter(accountId);
      if (!conn) {
        return {
          status: 'failed',
          simulated: false,
          to: toE164(to),
          error: `Telnyx account ${accountId} not found.`,
          errorCode: 'E_NO_ACCOUNT',
        };
      }

      accessToken = decrypter(conn.encrypted_access_token);
      if (!accessToken) {
        return {
          status: 'failed',
          simulated: false,
          to: toE164(to),
          error: 'Stored Telnyx access token could not be decrypted.',
          errorCode: 'E_TOKEN_DECRYPT',
        };
      }

      // Refresh if expired (30s safety window).
      const now = Math.floor(Date.now() / 1000);
      const expired = conn.expires_at ? conn.expires_at - now < 30 : false;
      if (expired && conn.encrypted_refresh_token) {
        const refreshToken = decrypter(conn.encrypted_refresh_token);
        if (refreshToken) {
          try {
            const data = await refresher(refreshToken);
            accessToken = data.access_token;
            const { updateTelnyxConnectionTokens: updater } = await import('./telnyxConnections.js');
            updater(conn.id, {
              encryptedAccessToken: encrypter(data.access_token),
              encryptedRefreshToken: data.refresh_token ? encrypter(data.refresh_token) : undefined,
              expiresAt: data.expires_in ? Math.floor(Date.now() / 1000) + Number(data.expires_in) : null,
            });
          } catch (refreshErr) {
            // Refresh failed — try the stale token once, then bail.
            console.warn('[telnyx] token refresh failed:', refreshErr.message);
          }
        }
      }
    } catch (importErr) {
      return {
        status: 'failed',
        simulated: false,
        to: toE164(to),
        error: `Telnyx OAuth module unavailable: ${importErr.message}`,
        errorCode: 'E_OAUTH_MODULE',
      };
    }
  }

  let lastResult = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await attemptSend({ to, text, accountId, from, authMode, accessToken });
    if (result.status === 'sent' || result.status === 'simulated') return result;
    if (isPermanentError(result.errorCode)) return result;
    lastResult = result;
    if (attempt < maxAttempts) await sleep(500 * Math.pow(2, attempt - 1));
  }
  return lastResult;
}

// fetchMessage: poll Telnyx for the current status of a sent message. Used by
// the pipeline right after sending to upgrade "sent" -> "delivered" if the
// webhook hasn't arrived yet. Optional — never throws.
//
// `accountId` is optional. When supplied we use the OAuth access token from
// that connection; otherwise we fall back to the server-level TELNYX_API_KEY.
export async function fetchMessageStatus(telnyxId, { accountId, accessToken: callerToken } = {}) {
  if (!telnyxId) return null;
  if (!telnyx.enabled && !accountId) return null;

  let bearerToken = null;
  if (accountId) {
    if (callerToken) {
      bearerToken = callerToken;
    } else {
      try {
        const { getTelnyxConnection: getter } = await import('./telnyxConnections.js');
        const { decryptTelnyxTokenForUse: decrypter } = await import('./telnyxOAuth.js');
        const conn = getter(accountId);
        if (conn) bearerToken = decrypter(conn.encrypted_access_token);
      } catch {
        return null;
      }
    }
  } else {
    bearerToken = telnyx.apiKey;
  }
  if (!bearerToken) return null;

  try {
    const res = await fetch(`https://api.telnyx.com/v2/messages/${telnyxId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const msg = data?.data || {};
    // Telnyx "to" responses use completed_at + errors. Best-effort mapping.
    if (msg.errors && msg.errors.length) {
      return { status: 'failed', errorCode: String(msg.errors[0].code || 'UNKNOWN'), errorMessage: msg.errors[0].detail };
    }
    return { status: msg.completed_at ? 'delivered' : 'sent' };
  } catch {
    return null;
  }
}
