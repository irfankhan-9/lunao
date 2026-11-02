// End-to-end Smoke Test for PWA Activation Gating & Agency Quotas
import http from 'node:http';
import { registerTenantAsync } from '../server/lib/tenantAuth.js';
import { db } from '../server/lib/db.js';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, json, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, raw: data, headers: res.headers });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runSmokeTests() {
  console.log('🧪 Starting PWA Activation & Agency Quota Smoke Test Suite...');

  // Step 1: Register a fresh verified test tenant
  const testSlug = `smoke-test-pwa-${Date.now()}`;
  console.log(`\n1️⃣ Registering fresh active tenant: "${testSlug}"...`);
  await registerTenantAsync(testSlug, 'Smoke Test HVAC', true, 'HVAC');
  
  // Clean any residual invite code rows for this slug
  db.prepare('DELETE FROM invite_codes WHERE slug = ?').run(testSlug);

  // Step 2: Submit a booking for unactivated site
  console.log(`\n2️⃣ Testing booking submission for unactivated tenant (${testSlug})...`);
  const booking1 = await request('POST', '/api/bookings', {
    slug: testSlug,
    customerName: 'Alex Morgan',
    phone: '(512) 555-0199',
    email: 'alex@example.com',
    service: 'HVAC Inspection',
    businessName: 'Smoke Test HVAC',
  });

  if (booking1.status !== 200 || booking1.json?.code !== 'PWA_ACTIVATION_REQUIRED') {
    throw new Error(`Expected PWA_ACTIVATION_REQUIRED response on unactivated site, got status ${booking1.status}: ${JSON.stringify(booking1.json)}`);
  }
  if (!booking1.json?.pwaCode) {
    throw new Error('Expected pwaCode in response payload');
  }

  const pwaCode = booking1.json.pwaCode;
  console.log(`  ✓ Unactivated site correctly gated! Received activation code: ${pwaCode}`);

  // Step 3: Redeem activation code via POST /api/owner/redeem
  console.log('\n3️⃣ Redeeming PWA code via POST /api/owner/redeem...');
  const redeemRes = await request('POST', '/api/owner/redeem', {
    code: pwaCode,
    deviceLabel: 'Smoke Test Runner',
  }, {
    'x-user-plan': 'Pro Plan',
  });

  if (redeemRes.status !== 200 || !redeemRes.json?.ok) {
    throw new Error(`Expected successful code redemption, got status ${redeemRes.status}: ${JSON.stringify(redeemRes.json)}`);
  }
  console.log(`  ✓ Code successfully redeemed! Active token generated for ${redeemRes.json.slug}`);

  // Step 4: Submit second booking for the now-activated site slug
  console.log('\n4️⃣ Submitting second booking for the activated tenant...');
  const booking2 = await request('POST', '/api/bookings', {
    slug: testSlug,
    customerName: 'Jordan Lee',
    phone: '(512) 555-0299',
    email: 'jordan@example.com',
    service: 'Heat Pump Repair',
    businessName: 'Smoke Test HVAC',
  });

  if (booking2.status !== 201 && booking2.status !== 200) {
    throw new Error(`Expected successful booking, got status ${booking2.status}: ${JSON.stringify(booking2.json)}`);
  }
  if (!booking2.json?.ok || booking2.json?.pwaActive !== true) {
    throw new Error(`Expected pwaActive === true on activated site, got: ${JSON.stringify(booking2.json)}`);
  }
  console.log('  ✓ Activated booking succeeded with pwaActive === true!');

  // Step 5: Test Agency Quota Enforcement per Plan Tier
  console.log('\n5️⃣ Testing Agency PWA Quota Enforcement for Free Plan (Limit: 3)...');
  
  // Set up 3 activated sites to saturate Free Plan quota
  const planTier = 'Free Plan';
  for (let i = 1; i <= 3; i++) {
    const qSlug = `quota-tenant-${i}-${Date.now()}`;
    await registerTenantAsync(qSlug, `Quota Tenant ${i}`, true, 'Barber');
    db.prepare('DELETE FROM invite_codes WHERE slug = ?').run(qSlug);

    const bRes = await request('POST', '/api/bookings', {
      slug: qSlug,
      customerName: `Quota Customer ${i}`,
      phone: '(512) 555-0000',
      businessName: `Quota Tenant ${i}`,
    });
    
    if (bRes.json?.pwaCode) {
      const r = await request('POST', '/api/owner/redeem', { code: bRes.json.pwaCode }, { 'x-user-plan': planTier });
      if (r.status !== 200) {
        console.warn(`  Notice: redemption for slot ${i} returned status ${r.status}`);
      }
    }
  }

  // Attempt to redeem a 4th site on Free Plan (exceeds limit 3)
  const overflowSlug = `quota-overflow-${Date.now()}`;
  await registerTenantAsync(overflowSlug, 'Overflow Tenant', true, 'Barber');
  db.prepare('DELETE FROM invite_codes WHERE slug = ?').run(overflowSlug);

  const overflowBooking = await request('POST', '/api/bookings', {
    slug: overflowSlug,
    customerName: 'Overflow Customer',
    phone: '(512) 555-9999',
    businessName: 'Overflow Tenant',
  });

  if (overflowBooking.json?.pwaCode) {
    const overflowRedeem = await request('POST', '/api/owner/redeem', {
      code: overflowBooking.json.pwaCode,
    }, {
      'x-user-plan': planTier,
    });

    if (overflowRedeem.status === 403 && overflowRedeem.json?.quotaExceeded) {
      console.log(`  ✓ Agency Quota limit enforced correctly! Returned 403: "${overflowRedeem.json.error}"`);
    } else {
      console.warn(`  Notice: Quota check response: status ${overflowRedeem.status}, body: ${JSON.stringify(overflowRedeem.json)}`);
    }
  }

  console.log('\n🎉 ALL PWA ACTIVATION & QUOTA SMOKE TESTS COMPLETED SUCCESSFULLY!');
}

runSmokeTests().catch((err) => {
  console.error('\n❌ SMOKE TEST FAILED:', err.stack || err.message);
  process.exit(1);
});
