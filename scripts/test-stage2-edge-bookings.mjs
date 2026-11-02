// ==============================================================================
// Lunao Stage 2 Verification Test Suite
// Verifies:
// 1. Supabase Edge Function CORS preflight (OPTIONS -> 204 without redirect)
// 2. Strict Input Validation (slug, name, phone)
// 3. Durable DB Persistence & Status Gate (No 200 before DB commit)
// 4. Idempotency Key deduplication on retries
// 5. Schema resilience when idempotency_key column is not yet migrated
// 6. Template compliance (no dev URLs, 0 placeholders in preview, no exposed secrets)
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { handleRequest } from '../supabase/functions/public-bookings/index.ts';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

// Mock Supabase Database Client for deterministic unit testing
function createMockSupabase(options = {}) {
  const store = new Map();
  let nextId = 100;

  return {
    from: (table) => {
      if (table !== 'bookings') throw new Error(`Unknown table: ${table}`);

      return {
        select: (cols) => ({
          eq: (field1, val1) => ({
            eq: (field2, val2) => ({
              maybeSingle: async () => {
                if (options.failQuery) throw new Error('Query error');
                for (const row of store.values()) {
                  if (row[field1] === val1 && row[field2] === val2) {
                    return { data: row, error: null };
                  }
                }
                return { data: null, error: null };
              },
            }),
          }),
        }),
        insert: (payload) => {
          if (options.failInsert) {
            return {
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { message: 'Database connection failed' },
                }),
              }),
            };
          }

          if (options.missingColumn && payload.idempotency_key) {
            return {
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { message: 'column "idempotency_key" of relation "bookings" does not exist' },
                }),
              }),
            };
          }

          const id = nextId++;
          const record = { id, ...payload };
          store.set(id, record);

          return {
            select: () => ({
              single: async () => ({ data: record, error: null }),
            }),
          };
        },
      };
    },
  };
}

async function runTests() {
  console.log('\n--- 1. Testing CORS Preflight (OPTIONS) ---');
  {
    const req = new Request('https://edge.lunao.app/functions/v1/public-bookings', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://lunao-web-designn.pages.dev',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, X-Idempotency-Key',
      },
    });

    const res = await handleRequest(req, createMockSupabase());
    assert(res.status === 204, 'Preflight returns HTTP 204 No Content');
    assert(res.headers.get('Access-Control-Allow-Origin') === '*', 'Allows cross-origin requests');
    assert(res.headers.get('Access-Control-Allow-Methods')?.includes('POST'), 'Allows POST method');
    assert(res.headers.get('Access-Control-Allow-Headers')?.includes('X-Idempotency-Key'), 'Allows X-Idempotency-Key header');
    assert(!res.headers.get('Location'), 'Never issues HTTP redirect on preflight');
  }

  console.log('\n--- 2. Testing HTTP Methods & Input Validation ---');
  {
    const getReq = new Request('https://edge.lunao.app/functions/v1/public-bookings', { method: 'GET' });
    const getRes = await handleRequest(getReq, createMockSupabase());
    assert(getRes.status === 405, 'Disallows GET method with 405 Method Not Allowed');

    const noSlugReq = new Request('https://edge.lunao.app/functions/v1/public-bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName: 'Alice', phone: '5125550199' }),
    });
    const noSlugRes = await handleRequest(noSlugReq, createMockSupabase());
    assert(noSlugRes.status === 400, 'Rejects missing slug with 400');

    const badPhoneReq = new Request('https://edge.lunao.app/functions/v1/public-bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'everest-hvac', customerName: 'Alice', phone: '123' }),
    });
    const badPhoneRes = await handleRequest(badPhoneReq, createMockSupabase());
    assert(badPhoneRes.status === 400, 'Rejects short/invalid phone with 400');
  }

  console.log('\n--- 3. Testing Verified Database Persistence ---');
  {
    const mockDb = createMockSupabase();
    const req = new Request('https://edge.lunao.app/functions/v1/public-bookings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': 'bk_test_12345',
      },
      body: JSON.stringify({
        slug: 'everest-hvac',
        customerName: 'Robert Vance',
        phone: '(512) 555-0199',
        service: 'Emergency AC Repair',
        notes: 'AC blowing warm air',
      }),
    });

    const res = await handleRequest(req, mockDb);
    const json = await res.json();
    assert(res.status === 201, 'Returns 201 Created on verified commit');
    assert(json.ok === true, 'Response body has ok: true');
    assert(json.id !== undefined, 'Response body includes assigned booking id');
    assert(json.isExisting === false, 'Indicates fresh record creation');
  }

  console.log('\n--- 4. Testing Idempotency & Safe Retries ---');
  {
    const mockDb = createMockSupabase();
    const payload = {
      slug: 'everest-hvac',
      customerName: 'Robert Vance',
      phone: '(512) 555-0199',
      service: 'Emergency AC Repair',
      idempotencyKey: 'bk_unique_idemp_key',
    };

    // First attempt
    const req1 = new Request('https://edge.lunao.app/functions/v1/public-bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const res1 = await handleRequest(req1, mockDb);
    const json1 = await res1.json();
    assert(res1.status === 201 && json1.isExisting === false, 'First submission creates record');

    // Second attempt (retry with identical idempotencyKey)
    const req2 = new Request('https://edge.lunao.app/functions/v1/public-bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const res2 = await handleRequest(req2, mockDb);
    const json2 = await res2.json();
    assert(res2.status === 200, 'Duplicate submission returns HTTP 200');
    assert(json2.isExisting === true, 'Returns isExisting: true on duplicate');
    assert(json2.id === json1.id, 'Returns exact same booking ID without duplicate insert');
  }

  console.log('\n--- 5. Testing Database Outage Handling (No False Confirmations) ---');
  {
    const failingDb = createMockSupabase({ failInsert: true });
    const req = new Request('https://edge.lunao.app/functions/v1/public-bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'everest-hvac',
        customerName: 'Sarah Connor',
        phone: '(512) 555-0988',
      }),
    });

    const res = await handleRequest(req, failingDb);
    const json = await res.json();
    assert(res.status === 500, 'Returns HTTP 500 on database failure');
    assert(json.ok === false, 'Never reports ok: true when persistence fails');
  }

  console.log('\n--- 6. Testing Missing Idempotency Column Gate (No Silent Bypass) ---');
  {
    const unmigratedDb = createMockSupabase({ missingColumn: true });
    const req = new Request('https://edge.lunao.app/functions/v1/public-bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': 'bk_test_col' },
      body: JSON.stringify({
        slug: 'everest-hvac',
        customerName: 'John Doe',
        phone: '(512) 555-9999',
      }),
    });

    const res = await handleRequest(req, unmigratedDb);
    const json = await res.json();
    assert(res.status === 500, 'Returns HTTP 500 when idempotency column is missing');
    assert(json.ok === false, 'Refuses to report success when idempotency cannot be guaranteed');
    assert(!json.details, 'Does not expose raw database/SQL details in response');
  }

  console.log('\n--- 7. Testing Concurrent Conflict Handling (Postgres 23505 Unique Violation) ---');
  {
    const mockDb = createMockSupabase();
    // Pre-seed an existing row with key
    mockDb.from('bookings').insert({
      slug: 'everest-hvac',
      customer_name: 'Concurrent User',
      phone: '5125550199',
      idempotency_key: 'bk_concurrent_123',
    });

    // Mock an insert that throws a unique violation code 23505
    const conflictDb = {
      from: (table) => {
        const base = mockDb.from(table);
        return {
          select: base.select,
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: null,
                error: { code: '23505', message: 'duplicate key value violates unique constraint' },
              }),
            }),
          }),
        };
      },
    };

    const req = new Request('https://edge.lunao.app/functions/v1/public-bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': 'bk_concurrent_123' },
      body: JSON.stringify({
        slug: 'everest-hvac',
        customerName: 'Concurrent User',
        phone: '5125550199',
      }),
    });

    const res = await handleRequest(req, conflictDb);
    const json = await res.json();
    assert(res.status === 200, 'Recovers from concurrent 23505 race condition with HTTP 200');
    assert(json.isExisting === true, 'Identifies existing committed booking');
  }

  console.log('\n--- 8. Testing Template Integrity & Secrets Protection ---');
  {
    const rawHtml = fs.readFileSync('public/templates-raw/hvac-template-01.html', 'utf8');
    assert(!rawHtml.includes('ais-dev'), 'Raw template has no hardcoded ais-dev dev URL');
    assert(rawHtml.includes('getBookingSubmissionUrl'), 'Raw template includes dynamic endpoint resolver');
    assert(rawHtml.includes('getOrCreateFormIdempotencyKey'), 'Raw template generates and preserves idempotency key');
    assert(rawHtml.includes('showFormError'), 'Raw template displays clear error on booking failure');
    assert(!rawHtml.includes('sb_secret') && !rawHtml.includes('SUPABASE_SECRET_KEY'), 'Raw template exposes 0 Supabase secret keys');

    const previewHtml = fs.readFileSync('public/hvac-template-01.html', 'utf8');
    const placeholders = previewHtml.match(/\{\{[^}]+\}\}/g);
    assert(placeholders === null || placeholders.length === 0, 'Live preview has zero uncompiled {{...}} placeholders');
    assert(previewHtml.includes('Everest Climate Systems'), 'Live preview contains high-fidelity Everest dummy data');
  }

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
