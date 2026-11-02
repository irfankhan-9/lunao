import { validateCloudflareToken } from '../server/lib/cloudflare.js';

async function testToken() {
  console.log('Testing Cloudflare API token validation...');
  const res = await validateCloudflareToken();
  console.log('Cloudflare Token Validation Result:', JSON.stringify(res, null, 2));
  if (res.ok) {
    console.log('✅ Cloudflare Token & Pages Project active and ready for live deployments!');
  } else {
    console.error('❌ Validation failed:', res.reason);
  }
}

testToken();
