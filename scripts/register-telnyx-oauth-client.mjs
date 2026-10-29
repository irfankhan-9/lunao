// One-time Telnyx OAuth client registration.
//
// Telnyx supports RFC 7591 dynamic client registration via
// POST https://api.telnyx.com/v2/oauth/register. We use a Telnyx API key
// (TELNYX_API_KEY in .env) to mint a new confidential OAuth client, and
// print the client_id + client_secret so you can paste them into .env.
//
// Usage:
//   TELNYX_API_KEY=KEY01... node scripts/register-telnyx-oauth-client.mjs
//   or
//   node scripts/register-telnyx-oauth-client.mjs --name "Lunao" \
//        --redirect http://localhost:8787/api/telnyx/callback

import { parseArgs } from 'node:util';

const REGISTRATION_URL = 'https://api.telnyx.com/v2/oauth/register';

function parseCli() {
  const { values } = parseArgs({
    options: {
      name:     { type: 'string', default: 'Lunao' },
      redirect: { type: 'string' },
      'no-pkce': { type: 'boolean', default: false },
      help:     { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });
  if (values.help) {
    console.log(`Usage: node scripts/register-telnyx-oauth-client.mjs [options]

Options:
  --name <name>          Client name shown to users on Telnyx's consent screen (default: "Lunao")
  --redirect <url>       OAuth callback URL (overrides OAUTH_REDIRECT_BASE default)
  --no-pkce              Skip PKCE requirement (not recommended — confidential clients should use PKCE)
  -h, --help             Show this message`);
    process.exit(0);
  }
  return values;
}

const apiKey = process.env.TELNYX_API_KEY;
if (!apiKey) {
  console.error('Error: TELNYX_API_KEY environment variable is required.');
  console.error('  PowerShell: $env:TELNYX_API_KEY="KEY01..."; node scripts/register-telnyx-oauth-client.mjs');
  console.error('  bash:        TELNYX_API_KEY=KEY01... node scripts/register-telnyx-oauth-client.mjs');
  process.exit(1);
}

const opts = parseCli();
const redirectUri =
  opts.redirect ||
  (process.env.OAUTH_REDIRECT_BASE
    ? `${process.env.OAUTH_REDIRECT_BASE.replace(/\/+$/, '')}/api/telnyx/callback`
    : 'http://localhost:8787/api/telnyx/callback');

const body = {
  client_name: opts.name,
  client_type: 'confidential',
  allowed_scopes: ['admin'],
  allowed_grant_types: ['authorization_code', 'refresh_token'],
  redirect_uris: [redirectUri],
  require_pkce: !opts['no-pkce'],
};

console.log('Registering Telnyx OAuth client...');
console.log('  Name:              ', body.client_name);
console.log('  Redirect URI:      ', redirectUri);
console.log('  Scopes:            ', body.allowed_scopes.join(', '));
console.log('  Grant types:       ', body.allowed_grant_types.join(', '));
console.log('  Require PKCE:      ', body.require_pkce);
console.log('');

let res;
try {
  res = await fetch(REGISTRATION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
} catch (err) {
  console.error('Network error during registration:', err.message);
  process.exit(1);
}

const text = await res.text();
let payload;
try {
  payload = JSON.parse(text);
} catch {
  payload = { raw: text };
}

if (!res.ok) {
  console.error(`Registration failed: HTTP ${res.status}`);
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

const clientId = payload?.client_id;
const clientSecret = payload?.client_secret;
const redirectUris = Array.isArray(payload?.redirect_uris) ? payload.redirect_uris : [];
const requirePkce = Boolean(payload?.require_pkce);

if (!clientId || !clientSecret) {
  console.error('Registration response missing client_id / client_secret:');
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

console.log('OAuth client registered successfully.');
console.log('');
console.log('  client_id:      ', clientId);
console.log('  client_secret:  ', clientSecret);
console.log('  redirect_uris:  ', redirectUris.join(', '));
console.log('  require_pkce:   ', requirePkce);
console.log('  scopes:         ', payload.scope || '(unspecified)');
console.log('');
console.log('Add these to your .env / .env.local:');
console.log('');
console.log(`TELNYX_CLIENT_ID="${clientId}"`);
console.log(`TELNYX_CLIENT_SECRET="${clientSecret}"`);
console.log('');
console.log('Then restart the server so it picks up the new env vars.');