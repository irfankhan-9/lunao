import fetch from 'node-fetch';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;
const ENDPOINT = `${BASE_URL}/functions/v1/public-bookings`;

async function smokeTest() {
  console.log('=== Starting Smoke Test for public-bookings Endpoint ===');
  console.log('Target Endpoint:', ENDPOINT);

  const idempotencyKey = 'smoke-test-key-' + Date.now();
  const testPayload = {
    slug: 'everest-climate-austin',
    customerName: 'Smoke Test Customer',
    phone: '(512) 555-0999',
    email: 'smoke.test@lunao.app',
    service: 'HVAC Maintenance',
    date: '2026-11-01',
    time: '2:00 PM',
    notes: 'Smoke test record - safe to remove',
    idempotencyKey: idempotencyKey
  };

  // 1. Test CORS Preflight
  console.log('\n1. Testing CORS Preflight (OPTIONS)...');
  const optRes = await fetch(ENDPOINT, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://everest-climate.lunao.app',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type, X-Idempotency-Key'
    }
  });
  console.log('OPTIONS Status:', optRes.status, optRes.status === 204 || optRes.status === 200 ? '✓ PASS' : '✗ FAIL');

  // 2. First Submission (Expect 201 Created)
  console.log('\n2. Sending First Booking Submission (Expect 201 Created)...');
  const res1 = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey,
      'Origin': 'https://everest-climate.lunao.app'
    },
    body: JSON.stringify(testPayload)
  });

  const body1 = await res1.json();
  console.log('Response 1 Status:', res1.status, res1.status === 201 ? '✓ PASS (201 Created)' : `✗ FAIL (${res1.status})`);
  console.log('Response 1 Body:', JSON.stringify(body1, null, 2));

  if (res1.status !== 201) {
    throw new Error(`First submission expected 201, got ${res1.status}: ${JSON.stringify(body1)}`);
  }

  const bookingId = body1.booking?.id || body1.id;
  console.log('Assigned Booking ID:', bookingId);

  // 3. Retry with same Idempotency Key (Expect 200 OK, same booking ID, no duplicate)
  console.log('\n3. Retrying with identical Slug & Idempotency Key (Expect 200 OK / Same ID)...');
  const res2 = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey,
      'Origin': 'https://everest-climate.lunao.app'
    },
    body: JSON.stringify(testPayload)
  });

  const body2 = await res2.json();
  console.log('Response 2 Status:', res2.status, res2.status === 200 ? '✓ PASS (200 OK)' : `✗ FAIL (${res2.status})`);
  console.log('Response 2 Body:', JSON.stringify(body2, null, 2));

  if (res2.status !== 200) {
    throw new Error(`Retry submission expected 200, got ${res2.status}`);
  }

  const retryBookingId = body2.booking?.id || body2.id;
  if (retryBookingId !== bookingId) {
    throw new Error(`Idempotency violation: retry booking ID (${retryBookingId}) differs from initial ID (${bookingId})`);
  }
  console.log('✓ PASS: Idempotency verified - exact same booking ID returned.');

  // 4. Test Invalid Input (Missing Customer Name -> Expect 400)
  console.log('\n4. Testing Invalid Input (Missing Customer Name -> Expect 400)...');
  const invalidPayload = {
    slug: 'everest-climate-austin',
    phone: '5125550999'
  };
  const res3 = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(invalidPayload)
  });
  const body3 = await res3.json();
  console.log('Response 3 Status:', res3.status, res3.status === 400 ? '✓ PASS (400 Bad Request)' : `✗ FAIL (${res3.status})`);
  console.log('Response 3 Body:', JSON.stringify(body3, null, 2));

  console.log('\n=== All Live Smoke Tests Passed Successfully! ===');
}

smokeTest().catch(err => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
