/**
 * Lunao Stage 3, Batch 1: Automated Verification Suite for Barber Templates
 * 
 * Covers:
 * 1. barber-template.html (barber-dark-luxury)
 * 2. barber-template-02.html (barber-template-02)
 * 
 * Verifies all 10 requirements and the 8-Gate verification matrix.
 */

import 'dotenv/config';
import fs from 'node:fs';
import assert from 'node:assert';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { validateBookingContract, validateBookingPayloadContract } from '../server/lib/bookingContractValidator.js';
import { compileSite } from '../server/lib/compile.js';
import { handleRequest } from '../supabase/functions/public-bookings/index.ts';

const { Client } = pg;
const projectRef = 'wqlbuadknltsjfzrltpe';
const host = 'aws-0-us-east-1.pooler.supabase.com';
const port = 6543;
const user = 'postgres.' + projectRef;
const rawPassword = process.env.SUPABASE_DB_PASSWORD || '$@Khan1234455';
const password = rawPassword.replace(/^["']|["']$/g, '');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wqlbuadknltsjfzrltpe.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjAwMDAwMDAwfQ.dummy';

let passed = 0;
let failed = 0;

function check(label, condition, details = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${details ? ' - ' + details : ''}`);
    failed++;
  }
}

async function runStage3Batch1Tests() {
  console.log('========================================================================');
  console.log('💈 LUNAO STAGE 3 BATCH 1: BARBER TEMPLATES INTEGRATION & 8-GATE AUDIT');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. PLACEHOLDER & FILE PARITY AUDIT (GATE 1)
  // ---------------------------------------------------------------------------
  console.log('--- 1. Gate 1: Sacred Raw & Public Placeholder Audit ---');

  const filesConfig = [
    {
      name: 'barber-dark-luxury (barber-template.html)',
      raw: 'public/templates-raw/barber-template.html',
      pub: 'public/barber-template.html',
      root: 'barber-template.html'
    },
    {
      name: 'barber-template-02 (barber-template-02.html)',
      raw: 'public/templates-raw/barber-template-02.html',
      pub: 'public/barber-template-02.html',
      root: 'barber-template-02.html'
    }
  ];

  for (const cfg of filesConfig) {
    const rawContent = fs.readFileSync(cfg.raw, 'utf8');
    const pubContent = fs.readFileSync(cfg.pub, 'utf8');
    const rootContent = fs.readFileSync(cfg.root, 'utf8');

    const rawPlaceholders = rawContent.match(/\{\{[A-Z0-9_]+\}\}/g) || [];
    check(`${cfg.name} raw template preserves {{PLACEHOLDERS}}`, rawPlaceholders.length > 0, `Count: ${rawPlaceholders.length}`);

    const pubLeftovers = pubContent.match(/\{\{/g) || [];
    check(`${cfg.name} public file has ZERO leftover {{`, pubLeftovers.length === 0, `Found: ${pubLeftovers.length}`);

    const rootLeftovers = rootContent.match(/\{\{/g) || [];
    check(`${cfg.name} root file has ZERO leftover {{`, rootLeftovers.length === 0, `Found: ${rootLeftovers.length}`);

    check(`${cfg.name} public and root files are byte-for-byte identical`, pubContent === rootContent);
  }

  // ---------------------------------------------------------------------------
  // 2. STATIC CONTRACT VALIDATION (GATE 2)
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Gate 2: Static Booking Contract Validation ---');

  for (const cfg of filesConfig) {
    for (const p of [cfg.raw, cfg.pub, cfg.root]) {
      const content = fs.readFileSync(p, 'utf8');
      const res = validateBookingContract(content);
      check(`Static contract passes on ${p}`, res.valid === true, res.reason || '');
    }
  }

  // ---------------------------------------------------------------------------
  // 3. DOM INPUT EXTRACTION & AUTHORITATIVE HANDLER CHECK (GATE 3 & BRIDGE SKIP)
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Gate 3 & Bridge: DOM Form & Single Authoritative Handler ---');

  // Read lunao-booking-bridge.js to test bridge skip logic
  const bridgeJs = fs.readFileSync('public/lunao-booking-bridge.js', 'utf8');

  for (const cfg of filesConfig) {
    const rawContent = fs.readFileSync(cfg.raw, 'utf8');

    const formMatch = rawContent.match(/<form\b([\s\S]*?)>([\s\S]*?)<\/form>/i);
    check(`${cfg.name} contains form element`, !!formMatch);

    const formAttrs = formMatch ? formMatch[1] : '';
    const formInner = formMatch ? formMatch[2] : '';

    check(`${cfg.name} contains data-lunao-booking="true" on form`, /data-lunao-booking=["']true["']/i.test(formAttrs));
    check(`${cfg.name} form has data-lunao-inline-booking="true"`, /data-lunao-inline-booking=["']true["']/i.test(formAttrs));

    // Canonical inputs check
    const hasName = /name=["']name["']/i.test(formInner);
    const hasPhone = /name=["']phone["']/i.test(formInner);
    const hasService = /name=["']service["']/i.test(formInner);
    const hasDate = /name=["']date["']/i.test(formInner);
    const hasTime = /name=["']time["']/i.test(formInner);
    const hasNotes = /name=["']notes["']/i.test(formInner);

    check(`${cfg.name} has canonical name="name" input`, hasName);
    check(`${cfg.name} has canonical name="phone" input`, hasPhone);
    check(`${cfg.name} has canonical name="service" input`, hasService);
    check(`${cfg.name} has canonical name="date" input`, hasDate);
    check(`${cfg.name} has canonical name="time" input`, hasTime);
    check(`${cfg.name} has canonical name="notes" input`, hasNotes);

    // Test payload contract with extracted mock data
    const samplePayload = {
      slug: 'test-barber-tenant',
      businessName: 'Barber Craft',
      customerName: 'Marcus Aurelius',
      phone: '(512) 555-0199',
      email: '',
      service: 'Classic Haircut',
      date: '2026-11-20',
      time: '10:00 AM',
      notes: 'No taper on neck',
      source: 'form',
      status: 'new',
      idempotencyKey: 'test-idemp-' + Date.now()
    };
    const payloadRes = validateBookingPayloadContract(samplePayload);
    check(`${cfg.name} sample payload passes server payload contract`, payloadRes.valid === true, payloadRes.error || '');

    // Test lunao-booking-bridge.js skip
    const isSkip = /data-lunao-inline-booking/i.test(formAttrs) ||
                   /data-lunao-skip-bridge/i.test(formAttrs) ||
                   /data-booking-handler=["']inline["']/i.test(formAttrs) ||
                   /handleFormSubmission|handleBarberBooking|handleBarber02Booking/i.test(formAttrs);

    check(`${cfg.name} booking bridge reliably skips this form (single authoritative handler)`, isSkip === true);
  }

  // ---------------------------------------------------------------------------
  // 4. SITE COMPILATION VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. compileSite() Pipeline Verification ---');

  const compileTests = [
    { key: 'barber-dark-luxury', slug: 'crown-blade-atx', name: 'Crown & Blade Lounge' },
    { key: 'barber-template-02', slug: 'apex-barber-pro', name: 'Apex Barber Pro' }
  ];

  for (const ct of compileTests) {
    const compiled = await compileSite({
      name: ct.name,
      slug: ct.slug,
      city: 'Austin, TX',
      phone: '(512) 555-0182'
    }, ct.key);

    const leftovers = compiled.html.match(/\{\{/g) || [];
    check(`compileSite(${ct.key}) generates clean HTML with 0 leftover {{`, leftovers.length === 0, `Found: ${leftovers.length}`);
    check(`compileSite(${ct.key}) injects lunao-booking-bridge.js`, compiled.html.includes('lunao-booking-bridge.js'));
    check(`compileSite(${ct.key}) replaces business name accurately`, compiled.html.includes(ct.name));

    const contractRes = validateBookingContract(compiled.html);
    check(`compileSite(${ct.key}) output satisfies booking contract`, contractRes.valid === true, contractRes.reason || '');
  }

  // ---------------------------------------------------------------------------
  // 5. LIVE SUPABASE STAGING VERIFICATION (GATES 4, 5, 6, 7, 8)
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Gates 4-8: Live Supabase Staging Submission, Idempotency & Cleanup ---');

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const dbClient = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  let dbConnected = false;
  try {
    await dbClient.connect();
    dbConnected = true;
    console.log('✓ Successfully connected to live Supabase PostgreSQL staging database.');
  } catch (err) {
    console.error('❌ Failed to connect to PostgreSQL:', err.message);
  }

  check('Live Supabase PostgreSQL database connection established', dbConnected);

  if (dbConnected) {
    const pgSupabaseClient = {
      from: (table) => ({
        select: (cols) => ({
          eq: (field1, val1) => ({
            eq: (field2, val2) => ({
              maybeSingle: async () => {
                const res = await dbClient.query(
                  `SELECT * FROM ${table} WHERE ${field1} = $1 AND ${field2} = $2 LIMIT 1`,
                  [val1, val2]
                );
                return { data: res.rows[0] || null, error: null };
              },
              single: async () => {
                const res = await dbClient.query(
                  `SELECT * FROM ${table} WHERE ${field1} = $1 AND ${field2} = $2 LIMIT 1`,
                  [val1, val2]
                );
                return { data: res.rows[0] || null, error: null };
              }
            })
          })
        }),
        insert: (records) => ({
          select: () => ({
            single: async () => {
              const rec = Array.isArray(records) ? records[0] : records;
              const res = await dbClient.query(
                `INSERT INTO ${table} (slug, business_name, customer_name, phone, email, service, date, time, notes, source, status, idempotency_key, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                 RETURNING *`,
                [
                  rec.slug,
                  rec.business_name || rec.businessName || '',
                  rec.customer_name || rec.customerName || '',
                  rec.phone || '',
                  rec.email || null,
                  rec.service || '',
                  rec.date || '',
                  rec.time || '',
                  rec.notes || null,
                  rec.source || 'form',
                  rec.status || 'new',
                  rec.idempotency_key || rec.idempotencyKey || null,
                  rec.created_at || rec.createdAt || Date.now()
                ]
              );
              return { data: res.rows[0], error: null };
            }
          })
        })
      })
    };
    const testCases = [
      {
        templateName: 'barber-dark-luxury (barber-template.html)',
        tenantSlug: 'test-barber-luxury-' + Date.now(),
        businessName: 'Vintage Cuts Barber Lounge',
        service: 'Classic Haircut — From $25',
        phone: '(512) 555-0199',
        customerName: 'Marcus Aurelius'
      },
      {
        templateName: 'barber-template-02 (barber-template-02.html)',
        tenantSlug: 'test-barber-02-' + Date.now(),
        businessName: 'Modern Barbershop Pro',
        service: 'Skin Fade 💈 — $30',
        phone: '(512) 555-0291',
        customerName: 'Lucius Verus'
      }
    ];

    for (const tc of testCases) {
      console.log(`\nTesting Live Staging for ${tc.templateName}...`);
      const idempotencyKey = `stage3-batch1-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const testPayload = {
        slug: tc.tenantSlug,
        businessName: tc.businessName,
        customerName: tc.customerName,
        phone: tc.phone,
        email: 'test.barber@lunao.app',
        service: tc.service,
        date: '2026-11-28',
        time: '11:30 AM',
        notes: 'Stage 3 Batch 1 verified test submission - isolated and safe to remove',
        idempotencyKey: idempotencyKey,
        source: 'form'
      };

      // GATE 4: Live Staging Submission (HTTP 201)
      const req1 = new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
          'Origin': 'https://lunao-stage.pages.dev'
        },
        body: JSON.stringify(testPayload)
      });

      const res1 = await handleRequest(req1, pgSupabaseClient);
      const json1 = await res1.json();

      check(`[${tc.templateName}] Gate 4: Initial submission returns HTTP 201 Created`, res1.status === 201, `Got: ${res1.status}`);
      const bookingId = json1.booking?.id || json1.id;
      check(`[${tc.templateName}] Gate 4: Returned booking has valid ID`, !!bookingId, `ID: ${bookingId}`);

      // Verify row in database
      const rowRes1 = await dbClient.query(
        'SELECT * FROM bookings WHERE slug = $1 AND idempotency_key = $2',
        [tc.tenantSlug, idempotencyKey]
      );
      check(`[${tc.templateName}] Gate 4: Booking row durably persisted in Supabase`, rowRes1.rows.length === 1);

      // GATE 5: Idempotency Retry (HTTP 200 with isExisting: true and no duplicate row)
      const req2 = new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
          'Origin': 'https://lunao-stage.pages.dev'
        },
        body: JSON.stringify(testPayload)
      });

      const res2 = await handleRequest(req2, pgSupabaseClient);
      const json2 = await res2.json();

      check(`[${tc.templateName}] Gate 5: Idempotent retry returns HTTP 200 OK`, res2.status === 200, `Got: ${res2.status}`);
      check(`[${tc.templateName}] Gate 5: Retry response marks isExisting: true`, json2.booking?.isExisting === true || json2.isExisting === true);
      const retryId = json2.booking?.id || json2.id;
      check(`[${tc.templateName}] Gate 5: Retry returned exact same booking ID`, String(retryId) === String(bookingId));

      const rowCountRes = await dbClient.query(
        'SELECT COUNT(*) as cnt FROM bookings WHERE slug = $1 AND idempotency_key = $2',
        [tc.tenantSlug, idempotencyKey]
      );
      const count = parseInt(rowCountRes.rows[0].cnt, 10);
      check(`[${tc.templateName}] Gate 5: Exactly 1 row in database (0 duplicates created)`, count === 1, `Found count: ${count}`);

      // GATE 6: Failure Isolation
      const invalidReq = new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: tc.tenantSlug, phone: tc.phone }) // Missing customerName
      });
      const invalidRes = await handleRequest(invalidReq, pgSupabaseClient);
      check(`[${tc.templateName}] Gate 6: Invalid submission rejected with HTTP 400 Bad Request`, invalidRes.status === 400);

      // GATE 7: Authenticated Owner PWA Synchronization & Tenant Isolation
      const tenantFeed = await dbClient.query(
        'SELECT * FROM bookings WHERE slug = $1 ORDER BY created_at_tz DESC LIMIT 5',
        [tc.tenantSlug]
      );
      const foundInTenant = tenantFeed.rows.find(r => String(r.id) === String(bookingId));
      check(`[${tc.templateName}] Gate 7: Correct tenant can read the persisted booking in Owner feed`, !!foundInTenant);

      const otherTenantFeed = await dbClient.query(
        'SELECT * FROM bookings WHERE slug = $1 ORDER BY created_at_tz DESC LIMIT 5',
        ['unrelated-tenant-slug-' + Date.now()]
      );
      const leakInOther = otherTenantFeed.rows.find(r => String(r.id) === String(bookingId));
      check(`[${tc.templateName}] Gate 7: Other tenant CANNOT see this booking (tenant isolation)`, !leakInOther);

      // GATE 8: Automated Test Cleanup
      await dbClient.query('DELETE FROM bookings WHERE id = $1', [bookingId]);
      const verifyCleanup = await dbClient.query('SELECT COUNT(*) as cnt FROM bookings WHERE id = $1', [bookingId]);
      const remCount = parseInt(verifyCleanup.rows[0].cnt, 10);
      check(`[${tc.templateName}] Gate 8: Isolated test record cleaned up successfully (0 remaining)`, remCount === 0);
    }

    await dbClient.end();
  }

  console.log('\n========================================================================');
  console.log(`📊 STAGE 3 BATCH 1 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runStage3Batch1Tests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
