// End-to-end smoke test for the Telnyx OAuth + PKCE wiring.
// Runs the same helper functions the live server uses, against the real
// api.telnyx.com, to confirm:
//   1. TELNYX_CLIENT_ID / TELNYX_CLIENT_SECRET are loaded
//   2. PKCE pair generation matches RFC 7636
//   3. The built authorization URL points at api.telnyx.com with all
//      expected params (Telnyx won't accept it if any are missing)
//   4. Telnyx's authorize endpoint returns 200 (i.e. it recognizes our
//      client_id + redirect_uri + scope combination)
//
// Does NOT complete the full flow — that requires a human to approve the
// consent page. But it confirms nothing is misconfigured before we run
// the actual server.

import {
  buildTelnyxAuthUrl,
  generatePkcePair,
  pkceChallengeS256,
} from '../server/lib/telnyxOAuth.js';
import { telnyxOAuth } from '../server/lib/config.js';
import crypto from 'node:crypto';

let failed = false;
function check(label, ok, detail = '') {
  const tag = ok ? 'OK ' : 'FAIL';
  if (!ok) failed = true;
  console.log(`  [${tag}] ${label}${detail ? `  ${detail}` : ''}`);
}

console.log('--- Telnyx OAuth + PKCE smoke test ---');
console.log('');

console.log('1. Config loaded');
check('TELNYX_CLIENT_ID present', Boolean(telnyxOAuth.clientId), telnyxOAuth.clientId ? `(${telnyxOAuth.clientId.slice(0, 6)}...)` : '');
check('TELNYX_CLIENT_SECRET present', Boolean(telnyxOAuth.clientSecret), telnyxOAuth.clientSecret ? `(${telnyxOAuth.clientSecret.slice(0, 6)}...)` : '');
check('telnyxOAuth.enabled = true', telnyxOAuth.enabled);
check('scope = "admin"', telnyxOAuth.scopes === 'admin', `(${telnyxOAuth.scopes})`);
console.log('');

console.log('2. PKCE pair');
const { codeVerifier, codeChallenge, codeChallengeMethod } = generatePkcePair();
const isBase64Url = /^[A-Za-z0-9_-]+$/.test(codeVerifier);
check('codeVerifier is base64url', isBase64Url, `(len=${codeVerifier.length})`);
check('codeVerifier length >= 43', codeVerifier.length >= 43, `(len=${codeVerifier.length})`);
const expectedChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
check('codeChallenge = SHA256(verifier) base64url', codeChallenge === expectedChallenge);
check('codeChallengeMethod = S256', codeChallengeMethod === 'S256');

// Cross-check pkceChallengeS256 matches generatePkcePair output
check('pkceChallengeS256(verifier) matches pair', pkceChallengeS256(codeVerifier) === codeChallenge);
console.log('');

console.log('3. Authorization URL');
const state = `tn_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
const redirectUri = 'http://localhost:8787/api/telnyx/callback';
const url = buildTelnyxAuthUrl({ redirectUri, state, codeChallenge, codeChallengeMethod });
check('URL starts with https://api.telnyx.com/v2/oauth/authorize', url.startsWith('https://api.telnyx.com/v2/oauth/authorize'));
const params = new URL(url).searchParams;
check('client_id matches', params.get('client_id') === telnyxOAuth.clientId);
check('redirect_uri matches', params.get('redirect_uri') === redirectUri);
check('response_type = code', params.get('response_type') === 'code');
check('scope = admin', params.get('scope') === 'admin');
check('state present', Boolean(params.get('state')));
check('code_challenge present', Boolean(params.get('code_challenge')));
check('code_challenge_method = S256', params.get('code_challenge_method') === 'S256');
console.log('   Built URL:');
console.log('     ' + url.slice(0, 140) + (url.length > 140 ? '...' : ''));
console.log('');

console.log('4. Telnyx authorize endpoint accepts the URL');
// Hit the authorize endpoint (GET, no code). A valid client_id + redirect_uri
// + scope should return 200 with Telnyx's login page. A bad client_id
// returns 400/404.
let authorizeRes;
try {
  authorizeRes = await fetch(url, { redirect: 'manual' });
} catch (err) {
  check('authorize fetch did not throw', false, `(${err.message})`);
  authorizeRes = null;
}
if (authorizeRes) {
  // Telnyx redirects unauthenticated users to login.telnyx.com. Either way,
  // a 200 or 302 means our params were accepted; 400/401/403 means rejected.
  const status = authorizeRes.status;
  const ok = (status >= 200 && status < 400);
  check(`authorize endpoint responded ${status}`, ok,
    ok ? '(accepted — params + client_id + redirect_uri valid)' :
         '(rejected — check client_id / redirect_uri / scope)');
}
console.log('');

if (failed) {
  console.log('RESULT: FAIL — fix the above before starting the server.');
  process.exit(1);
}
console.log('RESULT: PASS — Telnyx OAuth + PKCE wiring is correct.');
console.log('Next step: click "Connect with Telnyx" in the dashboard to complete the flow.');