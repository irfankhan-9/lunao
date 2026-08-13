// Central runtime configuration + integration "mode" detection.
// The whole pipeline works in two modes:
//   - LIVE  : real keys present -> real Cloudflare Pages deploy + real Telnyx SMS
//   - DRYRUN: keys missing      -> sites hosted locally + SMS simulated/logged
// This lets you test the full flow today (CSV only, no Google Maps) and flip to
// fully live the moment you paste real keys into .env.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

// Load .env then .env.local (local overrides committed defaults).
dotenv.config({ path: path.join(ROOT_DIR, '.env') });
dotenv.config({ path: path.join(ROOT_DIR, '.env.local'), override: true });

const env = process.env;

export const PORT = parseInt(env.PORT || '8787', 10);

// On Railway we mount a persistent volume at /data (set DATA_DIR to override).
// Falls back to the repo-local server/.sites folder for local dev.
const DATA_ROOT = env.DATA_DIR || ROOT_DIR;

// Where compiled, personalized sites are written before/instead of CDN upload.
export const SITES_DIR = path.join(DATA_ROOT, 'sites');
export const TEMPLATES_RAW_DIR = path.join(ROOT_DIR, 'public', 'templates-raw');

export const telnyx = {
  apiKey: env.TELNYX_API_KEY || '',
  from: env.TELNYX_PHONE_NUMBER || '',
  messagingProfileId: env.TELNYX_MESSAGING_PROFILE_ID || '',
  // Master switch: SMS stays "Coming Soon" until SMS_ENABLED=true (set tomorrow
  // once Telnyx is funded). Keys can be present but sending stays off.
  enabled: String(env.SMS_ENABLED || 'false').toLowerCase() === 'true',
  get live() {
    return Boolean(this.enabled && this.apiKey && this.from);
  },
};

export const cloudflare = {
  apiToken: env.CLOUDFLARE_API_TOKEN || '',
  accountId: env.CLOUDFLARE_ACCOUNT_ID || '',
  project: env.CLOUDFLARE_PAGES_PROJECT || '',
  branch: env.CLOUDFLARE_PAGES_BRANCH || 'main',
  get live() {
    return Boolean(this.apiToken && this.accountId && this.project);
  },
};

export const google = {
  mapsApiKey: env.GOOGLE_MAPS_API_KEY || '',
  get live() {
    return Boolean(this.mapsApiKey);
  },
};

// Claude powers the Site Editor's AI code chat. Key stays server-side.
export const anthropic = {
  apiKey: env.ANTHROPIC_API_KEY || '',
  model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
  get live() {
    return Boolean(this.apiKey);
  },
};

// Gemini powers the small booking chatbot. With no key we fall back to a
// fully functional rule-based booking agent, so the bot always works.
export const gemini = {
  apiKey: env.GEMINI_API_KEY || '',
  model: env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
  get live() {
    return Boolean(this.apiKey);
  },
};

export const auth = {
  jwtSecret: env.JWT_SECRET || env.SESSION_SECRET || 'change-me-in-production-use-a-long-random-string',
  jwtExpiresIn: '7d',
  cookieName: 'lunao_session',
  cookieMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  cookieSecure: env.NODE_ENV === 'production',
  cookieSameSite: 'lax',
};

export const googleOAuth = {
  clientId: env.GOOGLE_CLIENT_ID || '',
  clientSecret: env.GOOGLE_CLIENT_SECRET || '',
  // Gmail send + profile lookup. We include `openid email profile` so we can
  // fetch the user's email address from Google's OpenID userinfo endpoint.
  // Without an OpenID scope, the Gmail API itself rejects our access token
  // for the /profile call with "401 missing credentials" because Gmail
  // requires the audience to include openid if you want user identity.
  scopes: [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
  ].join(' '),
  get enabled() {
    return Boolean(this.clientId && this.clientSecret);
  },
};

// AES-256-GCM encryption key for refresh tokens. Falls back to a derived key
// from JWT secret in dev so we never silently store tokens in plaintext.
export const emailCrypto = {
  key: env.EMAIL_TOKEN_ENCRYPTION_KEY || env.JWT_SECRET || env.SESSION_SECRET || 'change-me-use-32-byte-hex',
  get enabled() {
    return Boolean(this.key);
  },
};

// Public base URL the injected widget calls for bookings/chat. Locally this is
// the dev API; later point it at the deployed Railway API via PUBLIC_API_BASE_URL.
export const PUBLIC_API_BASE_URL = (env.PUBLIC_API_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');

// Public base used to build the clickable site link inside the SMS.
// Priority: explicit SITE_BASE_URL -> Cloudflare project pages.dev -> local server.
export function siteBaseUrl() {
  if (env.SITE_BASE_URL) return env.SITE_BASE_URL.replace(/\/+$/, '');
  if (cloudflare.live) return `https://${cloudflare.project}.pages.dev`;
  return `http://localhost:${PORT}/sites`;
}

export function modeSummary() {
  return {
    telnyx: telnyx.live ? 'LIVE' : telnyx.enabled ? 'DRY-RUN (simulated)' : 'COMING SOON (disabled)',
    cloudflare: cloudflare.live ? 'LIVE' : 'DRY-RUN (served locally)',
    googleMaps: google.live ? 'LIVE' : 'COMING SOON (CSV mode)',
    aiEditor: anthropic.live ? 'LIVE' : 'disabled (no ANTHROPIC_API_KEY)',
    chatbot: gemini.live ? 'LIVE (Gemini)' : 'rule-based (no GEMINI_API_KEY)',
    siteBaseUrl: siteBaseUrl(),
    apiBaseUrl: PUBLIC_API_BASE_URL,
  };
}
