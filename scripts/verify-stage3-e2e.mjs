import 'dotenv/config';
import fetch from 'node-fetch';
import pg from 'pg';
const { Client } = pg;

const projectRef = 'wqlbuadknltsjfzrltpe';
const host = 'aws-0-us-east-1.pooler.supabase.com';
const port = 6543;
const user = 'postgres.' + projectRef;
const rawPassword = process.env.SUPABASE_DB_PASSWORD || '';
const password = rawPassword.replace(/^["']|["']$/g, '');

const API_BASE = 'http://localhost:3000';
const TEST_SLUG = 'everest-climate-austin';

async function runStage3E2E() {
  console.log('=== Starting Lunao Stage 3: End-to-End Booking Integration Verification ===');

  // 1. Database Direct Connection Check
  console.log('\n1. Connecting to Supabase PostgreSQL database...');
  const dbClient = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  await dbClient.connect();
  console.log('✓ Connected to Supabase PostgreSQL successfully.');

  // 2. Verify idempotency_key column & indexes
  console.log('\n2. Verifying idempotency_key column and indexes in live DB...');
  const colRes = await dbClient.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'idempotency_key';
  `);
  if (colRes.rows.length === 0) {
    throw new Error('Verification failed: idempotency_key column missing in live DB!');
  }
  console.log('✓ idempotency_key column verified.');

  const idxRes = await dbClient.query(`
    SELECT indexname FROM pg_indexes 
    WHERE schemaname = 'public' AND tablename = 'bookings' AND indexname = 'idx_bookings_slug_idempotency';
  `);
  if (idxRes.rows.length === 0) {
    throw new Error('Verification failed: idx_bookings_slug_idempotency index missing!');
  }
  console.log('✓ idx_bookings_slug_idempotency index verified.');

  // 3. Test End-to-End Booking Submission via Widget Endpoint
  console.log('\n3. Submitting test booking via endpoint (simulating website UI widget action)...');
  const idempotencyKey = 'stage3-e2e-' + Date.now();
  const testPayload = {
    slug: TEST_SLUG,
    businessName: 'Everest Climate Systems',
    customerName: 'Stage 3 E2E Test User',
    phone: '(512) 555-8888',
    email: 'stage3.test@lunao.app',
    service: 'Emergency Repair',
    date: '2026-11-15',
    time: '10:00 AM',
    notes: 'Stage 3 automated test booking - safe to clean up',
    idempotencyKey: idempotencyKey
  };

  const submitRes = await fetch(`${API_BASE}/functions/v1/public-bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey,
      'Origin': 'https://everest-climate.lunao.app'
    },
    body: JSON.stringify(testPayload)
  });

  const submitBody = await submitRes.json();
  console.log('Submission Status:', submitRes.status);
  console.log('Submission Response:', submitBody);

  if (submitRes.status !== 201) {
    throw new Error(`Expected 201 Created, got ${submitRes.status}: ${JSON.stringify(submitBody)}`);
  }
  const bookingId = submitBody.booking?.id || submitBody.id;
  console.log('✓ Successfully created booking with ID:', bookingId);

  // 4. Test Idempotent Retry (Same Slug + Idempotency Key)
  console.log('\n4. Testing Idempotent Retry with same key...');
  const retryRes = await fetch(`${API_BASE}/functions/v1/public-bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey,
      'Origin': 'https://everest-climate.lunao.app'
    },
    body: JSON.stringify(testPayload)
  });
  const retryBody = await retryRes.json();
  console.log('Retry Status:', retryRes.status);
  console.log('Retry Response:', retryBody);

  if (retryRes.status !== 200) {
    throw new Error(`Expected 200 OK on retry, got ${retryRes.status}`);
  }
  const retryBookingId = retryBody.booking?.id || retryBody.id;
  if (retryBookingId !== bookingId) {
    throw new Error(`Idempotency violation: retry ID ${retryBookingId} != original ID ${bookingId}`);
  }
  console.log('✓ Idempotency verified: duplicate submission returned existing record without new row.');

  // 5. Verify row count in Supabase for this idempotency key
  console.log('\n5. Verifying exact single row count in database...');
  const countRes = await dbClient.query(
    'SELECT COUNT(*) as cnt FROM bookings WHERE slug = $1 AND idempotency_key = $2',
    [TEST_SLUG, idempotencyKey]
  );
  const rowCount = parseInt(countRes.rows[0].cnt, 10);
  console.log('Database row count for idempotency key:', rowCount);
  if (rowCount !== 1) {
    throw new Error(`Expected exactly 1 database row, found ${rowCount}`);
  }
  console.log('✓ Database uniqueness constraint and idempotency verified.');

  // Register owner business access for test token
  await dbClient.query(`
    CREATE TABLE IF NOT EXISTS owner_businesses (
      owner_key TEXT NOT NULL,
      slug TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (owner_key, slug)
    );
  `);
  await dbClient.query(`
    INSERT INTO owner_businesses (owner_key, slug, created_at)
    VALUES ($1, $2, $3)
    ON CONFLICT (owner_key, slug) DO NOTHING;
  `, ['mock-test-token', TEST_SLUG, Date.now()]);

  // 6. Verify Owner PWA Read Isolation & Booking Retrieval
  console.log('\n6. Verifying Owner PWA booking read API for tenant slug...');
  const pwaRes = await fetch(`${API_BASE}/api/bookings?slug=${TEST_SLUG}`, {
    headers: {
      'Authorization': 'Bearer mock-test-token'
    }
  });
  const pwaBody = await pwaRes.json();
  console.log('Owner PWA Bookings API Status:', pwaRes.status);
  console.log('Fetched Bookings Count for tenant:', pwaBody.bookings?.length);

  const foundInPwa = pwaBody.bookings?.find(b => b.id === bookingId || b.id === Number(bookingId));
  if (!foundInPwa) {
    throw new Error(`Test booking ID ${bookingId} not found in tenant PWA booking list!`);
  }
  console.log('✓ Test booking successfully retrieved under correct business in Owner PWA feed.');

  // 7. Clean up test record from database
  console.log('\n7. Cleaning up test record from Supabase...');
  await dbClient.query('DELETE FROM bookings WHERE id = $1', [bookingId]);
  console.log('✓ Test record cleaned up successfully.');

  await dbClient.end();
  console.log('\n=== Stage 3 End-to-End Verification Passed 100% Successfully! ===');
}

runStage3E2E().catch(err => {
  console.error('Stage 3 E2E Verification failed:', err);
  process.exit(1);
});
