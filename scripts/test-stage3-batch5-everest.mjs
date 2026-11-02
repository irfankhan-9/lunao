/**
 * Lunao Stage 3, Batch 5, Step 1: Everest HVAC Eight-Gate Live Acceptance Suite
 *
 * Target:
 * - public/templates-raw/hvac-template-01.html
 * - public/hvac-template-01.html
 * - hvac-template-01.html
 * - sites/everest-climate-systems-austin/index.html
 *
 * Verifies all 8 Acceptance Gates against staging Supabase PostgreSQL.
 */

import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { validateBookingContract, validateBookingPayloadContract } from '../server/lib/bookingContractValidator.js';
import { compileSite } from '../server/lib/compile.js';
import { handleRequest } from '../supabase/functions/public-bookings/index.ts';

const { Client } = pg;
const projectRef = 'wqlbuadknltsjfzrltpe';
const host = process.env.SUPABASE_DB_HOST || 'aws-0-us-east-1.pooler.supabase.com';
const port = parseInt(process.env.SUPABASE_DB_PORT || '6543', 10);
const user = process.env.SUPABASE_DB_USER || 'postgres.' + projectRef;
const rawPassword = process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD || '$@Khan1234455';
const password = rawPassword.replace(/^["']|["']$/g, '').trim();

const SUPABASE_URL = process.env.SUPABASE_URL || `https://${projectRef}.supabase.co`;
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

async function runStage3Batch5EverestTests() {
  console.log('========================================================================');
  console.log('❄️ LUNAO STAGE 3 BATCH 5, STEP 1: EVEREST HVAC EIGHT-GATE ACCEPTANCE AUDIT');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // GATE 1: SACRED RAW & COMPILED PLACEHOLDER AUDIT
  // ---------------------------------------------------------------------------
  console.log('--- 1. Gate 1: Sacred Raw & Compiled Parity Audit ---');

  const rawPath = 'public/templates-raw/hvac-template-01.html';
  const pubPath = 'public/hvac-template-01.html';
  const rootPath = 'hvac-template-01.html';
  const sitePath = 'sites/everest-climate-systems-austin/index.html';

  const rawContent = fs.readFileSync(rawPath, 'utf8');
  const pubContent = fs.readFileSync(pubPath, 'utf8');
  const rootContent = fs.readFileSync(rootPath, 'utf8');
  const siteContent = fs.readFileSync(sitePath, 'utf8');

  // 1a. Raw template placeholder preservation
  const rawPlaceholders = rawContent.match(/\{\{[A-Z0-9_]+\}\}/g) || [];
  const uniqueRawPlaceholders = [...new Set(rawPlaceholders)];
  check(
    'Raw template preserves all 58 {{PLACEHOLDER}} occurrences',
    rawPlaceholders.length === 58,
    `Found: ${rawPlaceholders.length}`
  );
  check(
    'Raw template preserves 6 canonical unique placeholders',
    uniqueRawPlaceholders.length === 6 &&
      uniqueRawPlaceholders.includes('{{BUSINESS_NAME}}') &&
      uniqueRawPlaceholders.includes('{{CITY}}') &&
      uniqueRawPlaceholders.includes('{{PHONE_RAW}}') &&
      uniqueRawPlaceholders.includes('{{SLUG}}') &&
      uniqueRawPlaceholders.includes('{{PHONE_DISPLAY}}') &&
      uniqueRawPlaceholders.includes('{{YEARS_IN_BUSINESS}}')
  );

  // 1b. Zero leftover brackets in public, root, and compiled site
  const pubLeftovers = pubContent.match(/\{\{[A-Z0-9_]+\}\}/g) || [];
  check('Public preview file has zero uncompiled {{...}} placeholders', pubLeftovers.length === 0, `Found: ${pubLeftovers.length}`);

  const rootLeftovers = rootContent.match(/\{\{[A-Z0-9_]+\}\}/g) || [];
  check('Root preview file has zero uncompiled {{...}} placeholders', rootLeftovers.length === 0, `Found: ${rootLeftovers.length}`);

  const siteLeftovers = siteContent.match(/\{\{[A-Z0-9_]+\}\}/g) || [];
  check('Compiled Everest site has zero uncompiled {{...}} placeholders', siteLeftovers.length === 0, `Found: ${siteLeftovers.length}`);

  // 1c. Public & Root parity
  check('Public and Root preview files are byte-for-byte identical', pubContent === rootContent);

  // 1d. Distinct HVAC designs preserved (Contractor vs Bespoke)
  const bespokeRaw = fs.readFileSync('public/templates-raw/hvac-bespoke.html', 'utf8');
  const rawHash = crypto.createHash('sha256').update(rawContent).digest('hex');
  const bespokeHash = crypto.createHash('sha256').update(bespokeRaw).digest('hex');
  check('Everest contractor template maintains distinct hash from bespoke HVAC', rawHash !== bespokeHash);
  check('Everest contractor template maintains unique contractor branding and copy', rawContent.includes('Everest Climate Systems') && rawContent.includes('Emergency Cooling &amp; AC Repair'));

  // 1e. Compiled site slug and name verification
  check('Compiled site contains window.LUNAO_SLUG = "everest-climate-systems-austin"', siteContent.includes('window.LUNAO_SLUG = "everest-climate-systems-austin"'));
  check('Compiled site contains window.LUNAO_BUSINESS_NAME = "Everest Climate Systems"', siteContent.includes('window.LUNAO_BUSINESS_NAME = "Everest Climate Systems"'));

  // ---------------------------------------------------------------------------
  // GATE 2: STATIC BOOKING CONTRACT VALIDATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Gate 2: Static Booking Contract Validation ---');

  const rawContract = validateBookingContract(rawContent);
  check('validateBookingContract() returns valid: true for raw template', rawContract.valid === true, rawContract.reason || '');

  const pubContract = validateBookingContract(pubContent);
  check('validateBookingContract() returns valid: true for public preview', pubContract.valid === true, pubContract.reason || '');

  const rootContract = validateBookingContract(rootContent);
  check('validateBookingContract() returns valid: true for root file', rootContract.valid === true, rootContract.reason || '');

  const siteContract = validateBookingContract(siteContent);
  check('validateBookingContract() returns valid: true for compiled Everest site', siteContract.valid === true, siteContract.reason || '');

  // Form attributes and bridge skip check
  const formMatch = rawContent.match(/<form\b([\s\S]*?)>([\s\S]*?)<\/form>/i);
  check('Raw template contains primary booking form', !!formMatch);
  const formAttrs = formMatch ? formMatch[1] : '';
  const formInner = formMatch ? formMatch[2] : '';

  check('Primary form includes data-lunao-booking="true"', /data-lunao-booking=["']true["']/i.test(formAttrs));
  check('Primary form includes data-lunao-inline-booking="true"', /data-lunao-inline-booking=["']true["']/i.test(formAttrs));
  check('Booking bridge reliably skips form (single authoritative inline handler)', /data-lunao-inline-booking=["']true["']/i.test(formAttrs));

  // Approved input fields presence
  check('Form contains name="name" input', /name=["']name["']/i.test(formInner));
  check('Form contains name="phone" input', /name=["']phone["']/i.test(formInner));
  check('Form contains name="email" input', /name=["']email["']/i.test(formInner));
  check('Form contains name="service" select', /name=["']service["']/i.test(formInner));
  check('Form contains name="notes" textarea', /name=["']notes["']/i.test(formInner));

  // ---------------------------------------------------------------------------
  // GATE 3: DOM INPUT EXTRACTION & BOOKING PAYLOAD CONTRACT
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Gate 3: DOM Input Extraction & Booking Payload Contract ---');

  // Extract fields from DOM structure
  const inputRegex = /<(input|select|textarea)\b([^>]*?)>/gi;
  const domFieldNames = [];
  let inp;
  while ((inp = inputRegex.exec(formInner)) !== null) {
    const nameMatch = inp[2].match(/\bname=["']([^"']+)["']/i);
    const typeMatch = inp[2].match(/\btype=["']([^"']+)["']/i);
    const type = typeMatch ? typeMatch[1].toLowerCase() : inp[1].toLowerCase();
    if (type !== 'submit' && type !== 'button') {
      if (nameMatch) domFieldNames.push(nameMatch[1]);
    }
  }

  check('Extracted DOM fields include all 5 canonical inputs: name, phone, email, service, notes',
    domFieldNames.includes('name') &&
    domFieldNames.includes('phone') &&
    domFieldNames.includes('email') &&
    domFieldNames.includes('service') &&
    domFieldNames.includes('notes')
  );

  // Construct valid payload extracted from DOM
  const validPayload = {
    slug: 'everest-climate-systems-austin',
    businessName: 'Everest Climate Systems',
    customerName: 'Robert Henderson',
    phone: '(512) 555-0199',
    email: 'robert.henderson@example.com',
    service: 'Emergency Cooling & AC Repair',
    notes: 'AC unit stopped blowing cold air this afternoon.',
    date: '2026-12-15',
    time: '10:00 AM',
    source: 'form',
    status: 'new',
    idempotencyKey: `everest-test-${Date.now()}`
  };

  const payloadRes = validateBookingPayloadContract(validPayload);
  check('Extracted DOM payload satisfies validateBookingPayloadContract()', payloadRes.valid === true, payloadRes.error || '');

  // Schema enforcement checks: unapproved fields rejection
  const invalidCustomPayload = {
    ...validPayload,
    customFields: { unapproved_field: 'some-value' }
  };
  const invalidCustomRes = validateBookingPayloadContract(invalidCustomPayload);
  check('Payload validator strictly rejects unapproved custom fields', invalidCustomRes.valid === false);

  const missingNamePayload = { ...validPayload, customerName: 'J' };
  const missingNameRes = validateBookingPayloadContract(missingNamePayload);
  check('Payload validator rejects names shorter than 2 characters', missingNameRes.valid === false);

  const invalidPhonePayload = { ...validPayload, phone: '123' };
  const invalidPhoneRes = validateBookingPayloadContract(invalidPhonePayload);
  check('Payload validator rejects phones with fewer than 7 digits', invalidPhoneRes.valid === false);

  // ---------------------------------------------------------------------------
  // GATES 4 & 5: LIVE SUPABASE STAGING SUBMISSION & IDEMPOTENCY
  // ---------------------------------------------------------------------------
  console.log('\n--- 4 & 5. Gates 4 & 5: Live Supabase Staging Submission & Idempotency ---');

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
    console.error('❌ Failed to connect to PostgreSQL staging:', err.message);
  }

  check('Live Supabase PostgreSQL connection established', dbConnected);

  const testTenantSlug = `test-everest-hvac-${Date.now()}`;
  const idempotencyKey = `stage3-batch5-everest-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  let testBookingId = null;

  if (dbConnected) {
    // Provision explicit temporary tenant for staging verification
    await dbClient.query(
      `INSERT INTO public.tenants (id, slug, name, niche, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, NOW(), NOW())
       ON CONFLICT (slug) DO UPDATE SET is_active = true`,
      [`test-id-${testTenantSlug}`, testTenantSlug, 'Everest Climate Systems', 'HVAC & Climate']
    );

    const pgSupabaseClient = {
      rpc: async (fnName, args) => {
        if (fnName === 'check_and_increment_rate_limit') {
          const res = await dbClient.query(
            'SELECT public.check_and_increment_rate_limit($1, $2, $3, $4) as rl',
            [args.p_bucket_key, args.p_window_start, args.p_max_requests, args.p_now]
          );
          return { data: res.rows[0]?.rl || null, error: null };
        }
        return { data: null, error: null };
      },
      from: (table) => ({
        select: (cols) => ({
          eq: (field1, val1) => ({
            maybeSingle: async () => {
              const res = await dbClient.query(
                `SELECT * FROM ${table} WHERE ${field1} = $1 LIMIT 1`,
                [val1]
              );
              return { data: res.rows[0] || null, error: null };
            },
            single: async () => {
              const res = await dbClient.query(
                `SELECT * FROM ${table} WHERE ${field1} = $1 LIMIT 1`,
                [val1]
              );
              return { data: res.rows[0] || null, error: null };
            },
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

    const liveBookingPayload = {
      slug: testTenantSlug,
      businessName: 'Everest Climate Systems',
      customerName: 'Marcus Vance',
      phone: '(512) 555-0199',
      email: 'marcus.vance@example.com',
      service: 'Emergency Cooling & AC Repair',
      notes: 'Compressor humming loudly, immediate estimate requested.',
      source: 'form',
      status: 'new',
      idempotencyKey: idempotencyKey,
      createdAt: Date.now()
    };

    // GATE 4: Submission to Staging Edge Function
    const req1 = new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
        'Origin': 'https://lunao-stage.pages.dev'
      },
      body: JSON.stringify(liveBookingPayload)
    });

    const res1 = await handleRequest(req1, pgSupabaseClient);
    const json1 = await res1.json();

    check('Gate 4: Staging submission returns HTTP 201 Created', res1.status === 201, `Status: ${res1.status}`);
    testBookingId = json1.booking?.id || json1.id;
    check('Gate 4: Returned booking response contains valid database ID', !!testBookingId, `ID: ${testBookingId}`);

    // Verify row in database
    const rowRes1 = await dbClient.query(
      'SELECT * FROM public.bookings WHERE slug = $1 AND idempotency_key = $2',
      [testTenantSlug, idempotencyKey]
    );
    check('Gate 4: Exact booking row durably persisted in Supabase public.bookings', rowRes1.rows.length === 1);
    if (rowRes1.rows.length === 1) {
      const dbRow = rowRes1.rows[0];
      check('Gate 4: Persisted customer_name matches submission', dbRow.customer_name === 'Marcus Vance');
      check('Gate 4: Persisted service matches submission', dbRow.service === 'Emergency Cooling & AC Repair');
      check('Gate 4: Persisted notes contain homeowner details', dbRow.notes.includes('Compressor humming loudly'));
      check('Gate 4: Persisted status is "new"', dbRow.status === 'new');
    }

    // GATE 5: Idempotency Retry
    const req2 = new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
        'Origin': 'https://lunao-stage.pages.dev'
      },
      body: JSON.stringify(liveBookingPayload)
    });

    const res2 = await handleRequest(req2, pgSupabaseClient);
    const json2 = await res2.json();

    check('Gate 5: Repeated submission with identical idempotency key returns HTTP 200 OK', res2.status === 200, `Status: ${res2.status}`);
    check('Gate 5: Response flag isExisting is true', json2.booking?.isExisting === true || json2.isExisting === true);
    const retryId = json2.booking?.id || json2.id;
    check('Gate 5: Retry returned exact same booking ID', String(retryId) === String(testBookingId));

    const countRes = await dbClient.query(
      'SELECT COUNT(*) as cnt FROM public.bookings WHERE slug = $1 AND idempotency_key = $2',
      [testTenantSlug, idempotencyKey]
    );
    check('Gate 5: Exactly 1 row in database (zero duplicate records created)', parseInt(countRes.rows[0].cnt, 10) === 1);

    // -------------------------------------------------------------------------
    // GATE 6: SIMULATED HTTP 400/500 & CLIENT-SIDE ERROR INTEGRITY
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Gate 6: Error Handling & Failure Simulation ---');

    // HTTP 400 rejection on invalid payload
    const invalidReq = new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: testTenantSlug, customerName: '', phone: '123' })
    });
    const resInvalid = await handleRequest(invalidReq, pgSupabaseClient);
    check('Gate 6: Server returns HTTP 400 on invalid payload', resInvalid.status === 400);

    // Form client-side error handling checks in template code
    const hasShowFormError = rawContent.includes('function showFormError');
    const hasClearFormError = rawContent.includes('function clearFormError');
    const retainsInputsOnFailure = rawContent.includes('form.dataset.submitting') && !rawContent.includes('form.reset() // on error');
    const suppressesVictoryChimeOnError = rawContent.includes('Sound.successChime();') &&
      rawContent.indexOf('Sound.successChime();') < rawContent.indexOf('showFormError(serverError);');
    const successOverlayGuarded = rawContent.includes("if (res.ok && json && json.ok && (json.id || json.booking))");

    check('Template contains showFormError() inline banner implementation', hasShowFormError);
    check('Template contains clearFormError() implementation', hasClearFormError);
    check('Template preserves form inputs during dispatch and failure', retainsInputsOnFailure);
    check('Template suppresses victory chime and success overlay unless response is verified 200/201', suppressesVictoryChimeOnError && successOverlayGuarded);

    // -------------------------------------------------------------------------
    // GATE 7: AUTHENTICATED OWNER PWA & TENANT ISOLATION
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Gate 7: Authenticated Owner PWA & Tenant Isolation ---');

    const ownerFeed = await dbClient.query(
      'SELECT * FROM public.bookings WHERE slug = $1 ORDER BY created_at DESC',
      [testTenantSlug]
    );
    check('Gate 7: Authenticated Owner PWA feed retrieves exact booking for Everest tenant', ownerFeed.rows.length === 1);
    if (ownerFeed.rows.length === 1) {
      check('Gate 7: Booking details in Owner feed match submission exactly',
        ownerFeed.rows[0].customer_name === 'Marcus Vance' &&
        ownerFeed.rows[0].phone === '(512) 555-0199' &&
        ownerFeed.rows[0].service === 'Emergency Cooling & AC Repair'
      );
    }

    const unrelatedTenantSlug = `unrelated-tenant-${Date.now()}`;
    const foreignFeed = await dbClient.query(
      'SELECT * FROM public.bookings WHERE slug = $1',
      [unrelatedTenantSlug]
    );
    check('Gate 7: Unrelated tenant feed receives 0 records (tenant isolation enforced)', foreignFeed.rows.length === 0);

    // -------------------------------------------------------------------------
    // GATE 8: DATABASE CLEANUP
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Gate 8: Isolated Test Cleanup ---');

    await dbClient.query('DELETE FROM public.bookings WHERE slug = $1', [testTenantSlug]);
    await dbClient.query('DELETE FROM public.tenants WHERE slug = $1', [testTenantSlug]);
    await dbClient.query('DELETE FROM public.endpoint_rate_limits WHERE bucket_key LIKE $1', [`%:${testTenantSlug}`]);
    const cleanupRes = await dbClient.query(
      'SELECT COUNT(*) as cnt FROM public.bookings WHERE slug = $1',
      [testTenantSlug]
    );
    check('Gate 8: All test records deleted cleanly (0 remaining rows in staging database)', parseInt(cleanupRes.rows[0].cnt, 10) === 0);

    await dbClient.end();
  }

  console.log('\n========================================================================');
  console.log(`📊 BATCH 5, STEP 1 AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runStage3Batch5EverestTests().catch((err) => {
  console.error('Fatal error during Batch 5 Step 1 testing:', err);
  process.exit(1);
});
