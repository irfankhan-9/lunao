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
  get apiKey() {
    return env.TELNYX_API_KEY || env.LUNAO_TELNYX_API_KEY || '';
  },
  get from() {
    return env.TELNYX_PHONE_NUMBER || env.LUNAO_TELNYX_PHONE_NUMBER || '+16049539651';
  },
  get messagingProfileId() {
    return env.TELNYX_MESSAGING_PROFILE_ID || '40019ed1-f7a4-4e7b-a4bc-ffc748846765';
  },
  get PUBLIC_API_BASE_URL() {
    return env.PUBLIC_API_BASE_URL || env.LUNAO_API_BASE_URL || 'https://ais-dev-6d5czs7vzolfky6pa4cqvz-570409437174.asia-southeast1.run.app';
  },
  get enabled() {
    if (env.SMS_ENABLED !== undefined) {
      return String(env.SMS_ENABLED).toLowerCase() === 'true';
    }
    return Boolean(this.apiKey);
  },
  get live() {
    return Boolean(this.enabled && this.apiKey && this.from);
  },
};

export const cloudflare = {
  get apiToken() {
    return process.env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_API_TOKEN || '';
  },
  get accountId() {
    return process.env.CLOUDFLARE_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID || '';
  },
  get project() {
    return process.env.CLOUDFLARE_PAGES_PROJECT || env.CLOUDFLARE_PAGES_PROJECT || 'lunao-web-designn';
  },
  get branch() {
    return process.env.CLOUDFLARE_PAGES_BRANCH || env.CLOUDFLARE_PAGES_BRANCH || 'main';
  },
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
  model: env.GEMINI_MODEL || 'gemini-flash-latest',
  get live() {
    return Boolean(this.apiKey);
  },
};

export const auth = {
  jwtSecret: env.JWT_SECRET || env.SESSION_SECRET || '',
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

// Telnyx OAuth — "Connect with Telnyx" button in the Messaging section.
// Telnyx only exposes a single scope today ("admin"), which grants full
// account access. Users must trust Lunao the same way they'd trust a SaaS
// billing integration.
export const telnyxOAuth = {
  clientId: env.TELNYX_CLIENT_ID || '',
  // Public OAuth clients (the recommended Lunao mode) have no client_secret —
  // PKCE alone authenticates the token exchange. We still accept a secret
  // for backward compatibility with confidential clients.
  clientSecret: env.TELNYX_CLIENT_SECRET || '',
  scopes: 'admin',
  authorizationUrl: 'https://api.telnyx.com/v2/oauth/authorize',
  tokenUrl: 'https://api.telnyx.com/v2/oauth/token',
  get enabled() {
    // Enabled whenever we have a client_id. PKCE substitutes for the secret
    // when the registered Telnyx OAuth client is `client_type: "public"`.
    return Boolean(this.clientId);
  },
};

// AES-256-GCM encryption key for refresh tokens. Falls back to a derived key
// from JWT secret in dev so we never silently store tokens in plaintext.
export const emailCrypto = {
  key: env.EMAIL_TOKEN_ENCRYPTION_KEY || env.JWT_SECRET || env.SESSION_SECRET || '',
  get enabled() {
    return Boolean(this.key);
  },
};

// Public base URL the injected widget calls for bookings/chat. Locally this is
// the dev API; later point it at the deployed Railway API via PUBLIC_API_BASE_URL.
export const PUBLIC_API_BASE_URL = (env.PUBLIC_API_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');

// Public base used to build the clickable site link inside email and SMS outreach.
// Always defaults to Cloudflare Pages (https://lunao-web-designn.pages.dev).
export function siteBaseUrl() {
  if (process.env.SITE_BASE_URL || env.SITE_BASE_URL) {
    return (process.env.SITE_BASE_URL || env.SITE_BASE_URL).replace(/\/+$/, '');
  }
  const proj = cloudflare.project || process.env.CLOUDFLARE_PAGES_PROJECT || 'lunao-web-designn';
  return `https://${proj}.pages.dev`;
}

export const supabase = {
  url: env.SUPABASE_URL || '',
  secretKey: env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '',
  get live() {
    return Boolean(env.DATABASE_URL || (this.url && this.secretKey));
  },
};

export const resend = {
  apiKey: env.RESEND_API_KEY || '',
  from: env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
  testRecipient: env.RESEND_TEST_RECIPIENT || '',
  get live() {
    return Boolean(this.apiKey && this.apiKey.startsWith('re_'));
  },
};

export function modeSummary() {
  return {
    telnyx: telnyx.live ? 'LIVE' : telnyx.enabled ? 'DRY-RUN (simulated)' : 'COMING SOON (disabled)',
    cloudflare: cloudflare.live ? 'LIVE' : 'DRY-RUN (served locally)',
    googleMaps: google.live ? 'LIVE' : 'COMING SOON (CSV mode)',
    supabase: supabase.live ? 'LIVE (Supabase Relational)' : 'LOCAL (SQLite fallback)',
    resend: resend.live ? `LIVE (${resend.from})` : 'MOCK / DISABLED (no RESEND_API_KEY)',
    aiEditor: (gemini.live || anthropic.live) ? 'LIVE (Gemini 2.5 Flash)' : 'disabled',
    chatbot: gemini.live ? 'LIVE (Gemini)' : 'rule-based (no GEMINI_API_KEY)',
    siteBaseUrl: siteBaseUrl(),
    apiBaseUrl: PUBLIC_API_BASE_URL,
  };
}
