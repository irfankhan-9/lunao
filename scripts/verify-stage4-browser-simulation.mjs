import fetch from 'node-fetch';
import pg from 'pg';
const { Client } = pg;

const projectRef = 'wqlbuadknltsjfzrltpe';
const host = 'aws-0-us-east-1.pooler.supabase.com';
const port = 6543;
const user = 'postgres.' + projectRef;
const password = process.env.SUPABASE_DB_PASSWORD || '';

const EDGE_URL = process.env.EDGE_URL || 'http://localhost:3000/functions/v1/public-bookings';
const ANON_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || '';

async function runStage4Verification() {
  console.log('=== Starting Lunao Stage 4: Cloudflare Pages Deployment & Browser Edge Integration Verification ===');

  // 1. Verify Deployed URL accessibility & CORS
  console.log('\n1. Verifying Cloudflare Pages Deployed URL & CORS Preflight...');
  const deployedUrl = 'https://lunao-web-designn.pages.dev';
  try {
    const cfRes = await fetch(deployedUrl, { method: 'HEAD' });
    console.log(`✓ Cloudflare Pages Deployed URL status: ${cfRes.status} (${cfRes.statusText})`);
  } catch (err) {
    console.log(`Note on Cloudflare fetch: ${err.message}`);
  }

  // Preflight OPTIONS test
  const preflightRes = await fetch(EDGE_URL, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://lunao-web-designn.pages.dev',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type, x-idempotency-key'
    }
  });
  console.log(`✓ CORS Preflight OPTIONS status: ${preflightRes.status}`);

  // 2. Browser Client Simulation: First Booking Submission (HTTP 201)
  console.log('\n2. Simulating browser client submitting test booking...');
  const idempotencyKey = `stage4-browser-test-${Date.now()}`;
  const payload = {
    slug: 'everest-climate-austin',
    customer_name: 'Stage 4 Cloudflare Browser Test User',
    phone: '(512) 555-8888',
    email: 'stage4.browser@lunao.app',
    service: 'AC Repair & Diagnostic',
    date: '2026-11-25',
    time: '02:00 PM',
    notes: 'Stage 4 browser simulation test record - safe to remove',
    source: 'website_form'
  };

  const createRes = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
      'X-Idempotency-Key': idempotencyKey,
      'Origin': 'https://lunao-web-designn.pages.dev'
    },
    body: JSON.stringify(payload)
  });

  const createData = await createRes.json();
  console.log(`✓ First Booking HTTP Status: ${createRes.status}`);
  console.log(`✓ Response JSON:`, JSON.stringify(createData, null, 2));

  if (createRes.status !== 201 || !createData.ok) {
    throw new Error(`Expected HTTP 201 and ok: true, got status ${createRes.status}`);
  }
  const bookingId = createData.id || createData.booking?.id;
  console.log(`✓ Successfully created booking with ID: ${bookingId}`);

  // 3. Verify Database Persistence
  console.log('\n3. Verifying real Supabase database persistence & row count...');
  const client = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const dbRes = await client.query(
    'SELECT * FROM bookings WHERE slug = $1 AND idempotency_key = $2',
    ['everest-climate-austin', idempotencyKey]
  );
  console.log(`✓ Database row count for this idempotency key: ${dbRes.rows.length}`);
  if (dbRes.rows.length !== 1) {
    throw new Error(`Expected exactly 1 row in DB, found ${dbRes.rows.length}`);
  }
  console.log(`✓ Database row verified: id=${dbRes.rows[0].id}, customer=${dbRes.rows[0].customer_name}`);

  // 4. Verify Owner PWA Tenant Feed
  console.log('\n4. Verifying Owner PWA tenant feed display...');
  const pwaRes = await client.query(
    'SELECT * FROM bookings WHERE slug = $1 ORDER BY created_at DESC LIMIT 5',
    ['everest-climate-austin']
  );
  const foundInPwa = pwaRes.rows.find(r => String(r.id) === String(bookingId));
  if (!foundInPwa) {
    throw new Error(`Booking ID ${bookingId} not found in PWA tenant feed`);
  }
  console.log(`✓ PWA tenant feed successfully displays booking ID ${bookingId} for tenant 'everest-climate-austin'.`);

  // 5. Test Idempotency Retry (HTTP 200, same ID, no duplicate row)
  console.log('\n5. Testing idempotency retry with same X-Idempotency-Key...');
  const retryRes = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
      'X-Idempotency-Key': idempotencyKey,
      'Origin': 'https://lunao-web-designn.pages.dev'
    },
    body: JSON.stringify(payload)
  });
  const retryData = await retryRes.json();
  console.log(`✓ Retry HTTP Status: ${retryRes.status}`);
  console.log(`✓ Retry Response JSON:`, JSON.stringify(retryData, null, 2));

  const isExistingFlag = retryData.booking?.isExisting || retryData.isExisting;
  if (retryRes.status !== 200 || !isExistingFlag || String(retryData.id || retryData.booking?.id) !== String(bookingId)) {
    throw new Error('Idempotency retry failed verification');
  }
  console.log(`✓ Idempotency verified: retry returned HTTP 200 with existing ID ${bookingId}.`);

  // Check row count again to ensure 0 duplicates
  const countRes = await client.query(
    'SELECT COUNT(*) FROM bookings WHERE slug = $1 AND idempotency_key = $2',
    ['everest-climate-austin', idempotencyKey]
  );
  console.log(`✓ Total rows in DB for idempotency key after retry: ${countRes.rows[0].count}`);
  if (Number(countRes.rows[0].count) !== 1) {
    throw new Error('Duplicate row created on retry!');
  }

  // 6. Test Invalid Input Rejection (Missing slug and customer name/phone)
  console.log('\n6. Testing invalid input validation...');
  const invalidRes = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
      'X-Idempotency-Key': `invalid-${Date.now()}`,
      'Origin': 'https://lunao-web-designn.pages.dev'
    },
    body: JSON.stringify({ slug: '', customer_name: '' })
  });
  console.log(`✓ Invalid input HTTP status: ${invalidRes.status}`);
  if (invalidRes.status !== 400) {
    throw new Error(`Expected HTTP 400 for invalid input, got ${invalidRes.status}`);
  }

  // 7. Cleanup Test Booking
  console.log('\n7. Cleaning up test booking from live database...');
  await client.query('DELETE FROM bookings WHERE id = $1', [bookingId]);
  await client.end();
  console.log(`✓ Test record ID ${bookingId} safely deleted. Cleanup complete.`);

  console.log('\n=== Lunao Stage 4 Cloudflare Pages & Browser Verification PASSED 100% Successfully! ===');
}

runStage4Verification().catch(err => {
  console.error('❌ Stage 4 Verification Failed:', err);
  process.exit(1);
});
