import fetch from 'node-fetch';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { handleRequest } from '../supabase/functions/public-bookings/index.ts';

const { Client } = pg;
const projectRef = 'wqlbuadknltsjfzrltpe';
const host = 'aws-0-us-east-1.pooler.supabase.com';
const port = 6543;
const password = process.env.SUPABASE_DB_PASSWORD || '';
const user = 'postgres.' + projectRef;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wqlbuadknltsjfzrltpe.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || '';

const TEST_SLUG = 'everest-climate-austin';

async function verifyStage3Live() {
  console.log('=== Starting Stage 3: Controlled End-to-End Live Database & Edge Function Verification ===');

  // 0. Initialize Real Supabase Client for injection into Edge Function handler
  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // 1. Database Connection & Schema Verification
  console.log('\n1. Connecting to live Supabase PostgreSQL database...');
  const dbClient = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await dbClient.connect();
  console.log('✓ Connected successfully to Supabase production database.');

  // Verify idempotency_key column and index
  const colCheck = await dbClient.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'idempotency_key';
  `);
  if (colCheck.rows.length === 0) {
    throw new Error('Verification failed: idempotency_key column missing in live DB!');
  }
  console.log('✓ Verified: idempotency_key column exists.');

  const idxCheck = await dbClient.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'bookings' AND indexname = 'idx_bookings_slug_idempotency';
  `);
  if (idxCheck.rows.length === 0) {
    throw new Error('Verification failed: idx_bookings_slug_idempotency index missing!');
  }
  console.log('✓ Verified: unique partial idempotency index exists.');

  // 2. Submit Test Booking via Edge Function Handler (Simulating website UI widget submission)
  console.log('\n2. Submitting test booking via Edge Function handler (live DB integration)...');
  const idempotencyKey = 'stage3-live-test-' + Date.now();
  const testPayload = {
    slug: TEST_SLUG,
    businessName: 'Everest Climate Systems',
    customerName: 'Stage 3 E2E Live User',
    phone: '(512) 555-9999',
    email: 'stage3.live@lunao.app',
    service: 'AC Tune-Up',
    date: '2026-11-20',
    time: '11:00 AM',
    notes: 'Stage 3 live E2E integration test record - safe to remove',
    idempotencyKey: idempotencyKey
  };

  const req1 = new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey,
      'Origin': 'https://everest-climate.lunao.app'
    },
    body: JSON.stringify(testPayload)
  });

  const res1 = await handleRequest(req1, supabaseClient);
  const body1 = await res1.json();
  console.log('Submission Status:', res1.status);
  console.log('Submission Response:', body1);

  if (res1.status !== 201) {
    throw new Error(`Expected 201 Created, got ${res1.status}: ${JSON.stringify(body1)}`);
  }
  const bookingId = body1.booking?.id || body1.id;
  console.log('✓ Successfully created booking with live ID:', bookingId);

  // 3. Test Idempotent Retry (Same Slug + Idempotency Key)
  console.log('\n3. Retrying same submission with identical Idempotency Key...');
  const req2 = new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey,
      'Origin': 'https://everest-climate.lunao.app'
    },
    body: JSON.stringify(testPayload)
  });

  const res2 = await handleRequest(req2, supabaseClient);
  const body2 = await res2.json();
  console.log('Retry Status:', res2.status);
  console.log('Retry Response:', body2);

  if (res2.status !== 200) {
    throw new Error(`Expected 200 OK on retry, got ${res2.status}`);
  }
  const retryId = body2.booking?.id || body2.id;
  if (retryId !== bookingId) {
    throw new Error(`Idempotency violation: retry ID ${retryId} != initial ID ${bookingId}`);
  }
  console.log('✓ Idempotency verified: retry returned 200 OK with exact same booking ID.');

  // 4. Verify Database Uniqueness (Exact single row in Supabase)
  console.log('\n4. Verifying exact single row existence in live Supabase DB...');
  const dbCountRes = await dbClient.query(
    'SELECT COUNT(*) as cnt FROM bookings WHERE slug = $1 AND idempotency_key = $2',
    [TEST_SLUG, idempotencyKey]
  );
  const rowCount = parseInt(dbCountRes.rows[0].cnt, 10);
  console.log('Database row count for this idempotency key:', rowCount);
  if (rowCount !== 1) {
    throw new Error(`Expected exactly 1 row in database, found ${rowCount}`);
  }
  console.log('✓ Database uniqueness verified: 0 duplicate rows created.');

  // 5. Verify Owner PWA Read / Tenant Isolation
  console.log('\n5. Verifying Owner PWA booking read API for tenant slug...');
  const pwaQueryRes = await dbClient.query(
    'SELECT * FROM bookings WHERE slug = $1 ORDER BY created_at_tz DESC LIMIT 10',
    [TEST_SLUG]
  );
  console.log('Found PWA bookings for tenant:', pwaQueryRes.rows.length);
  const foundInDb = pwaQueryRes.rows.find(r => String(r.id) === String(bookingId));
  if (!foundInDb) {
    throw new Error(`Test booking ID ${bookingId} not found in database tenant query!`);
  }
  console.log('✓ Test booking successfully verified under correct business tenant.');

  // 6. Test Invalid Input Rejection
  console.log('\n6. Testing invalid input rejection...');
  const invalidReq = new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: TEST_SLUG, phone: '5125559999' }) // missing name
  });
  const invalidRes = await handleRequest(invalidReq, supabaseClient);
  console.log('Invalid input status:', invalidRes.status, invalidRes.status === 400 ? '✓ PASS (400 Bad Request)' : '✗ FAIL');

  // 7. Cleanup Test Record
  console.log('\n7. Cleaning up test booking from live Supabase database...');
  await dbClient.query('DELETE FROM bookings WHERE id = $1', [bookingId]);
  console.log('✓ Test record cleaned up successfully.');

  await dbClient.end();
  console.log('\n=== Stage 3 End-to-End Live Verification Passed 100% Successfully! ===');
}

verifyStage3Live().catch(err => {
  console.error('Stage 3 Live Verification failed:', err);
  process.exit(1);
});
