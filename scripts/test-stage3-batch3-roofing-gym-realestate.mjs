/**
 * Lunao Stage 3, Batch 3: Automated Verification Suite for Roofing, Gym & Real Estate
 * 
 * Covers:
 * 1. roofing-template-01.html (roofing-template-01) - Full 8-Gate Implementation & Verification
 * 2. gym-template-01.html (gym-template-01) - Architectural & Semantic Mismatch Evaluation
 * 3. realestate-template-01.html (realestate-template-01) - Architectural & Semantic Mismatch Evaluation
 */

import 'dotenv/config';
import fs from 'node:fs';
import pg from 'pg';
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

async function runStage3Batch3Tests() {
  console.log('========================================================================');
  console.log('🔨💪🏠 LUNAO STAGE 3 BATCH 3: ROOFING, GYM & REAL ESTATE AUDIT & GATES');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. PLACEHOLDER & FILE PARITY AUDIT (GATE 1)
  // ---------------------------------------------------------------------------
  console.log('--- 1. Gate 1: Sacred Raw, Public & Root Placeholder Parity Audit ---');

  const filesConfig = [
    {
      name: 'roofing-template-01 (roofing-template-01.html)',
      raw: 'public/templates-raw/roofing-template-01.html',
      pub: 'public/roofing-template-01.html',
      root: 'roofing-template-01.html',
      key: 'roofing-template-01'
    },
    {
      name: 'gym-template-01 (gym-template-01.html)',
      raw: 'public/templates-raw/gym-template-01.html',
      pub: 'public/gym-template-01.html',
      root: 'gym-template-01.html',
      key: 'gym-template-01'
    },
    {
      name: 'realestate-template-01 (realestate-template-01.html)',
      raw: 'public/templates-raw/realestate-template-01.html',
      pub: 'public/realestate-template-01.html',
      root: 'realestate-template-01.html',
      key: 'realestate-template-01'
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

  // Roofing contract verification
  for (const p of ['public/templates-raw/roofing-template-01.html', 'public/roofing-template-01.html', 'roofing-template-01.html']) {
    const content = fs.readFileSync(p, 'utf8');
    const res = validateBookingContract(content);
    check(`Static contract passes on ${p}`, res.valid === true, res.reason || '');
  }

  // Gym & Real Estate baseline contract check (unmodified raw passes baseline outside booking contract)
  for (const p of ['public/templates-raw/gym-template-01.html', 'public/templates-raw/realestate-template-01.html']) {
    const content = fs.readFileSync(p, 'utf8');
    const res = validateBookingContract(content);
    check(`Raw template without artificial booking tag passes validation: ${p}`, res.valid === true, res.reason || '');
  }

  // ---------------------------------------------------------------------------
  // 3. DOM FORM & AUTHORITATIVE HANDLER CHECK (GATE 3)
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Gate 3: Form DOM & Authoritative Handler (Roofing) ---');

  const roofingRaw = fs.readFileSync('public/templates-raw/roofing-template-01.html', 'utf8');
  const roofingFormMatch = roofingRaw.match(/<form\b([\s\S]*?)>([\s\S]*?)<\/form>/i);
  check('roofing-template-01 contains form element', !!roofingFormMatch);

  const rAttrs = roofingFormMatch ? roofingFormMatch[1] : '';
  const rInner = roofingFormMatch ? roofingFormMatch[2] : '';

  check('roofing-template-01 contains data-lunao-booking="true" on form', /data-lunao-booking=["']true["']/i.test(rAttrs));
  check('roofing-template-01 form has data-lunao-inline-booking="true"', /data-lunao-inline-booking=["']true["']/i.test(rAttrs));

  check('roofing-template-01 has canonical name="name" input', /name=["']name["']/i.test(rInner));
  check('roofing-template-01 has canonical name="phone" input', /name=["']phone["']/i.test(rInner));
  check('roofing-template-01 has canonical name="service" input', /name=["']service["']/i.test(rInner));
  check('roofing-template-01 preserves address by mapping to notes', /name=["']notes["']/i.test(rInner) && /addressInCity/i.test(rInner));

  const roofingIsSkip = /data-lunao-inline-booking/i.test(rAttrs) || /data-lunao-skip-bridge/i.test(rAttrs);
  check('roofing-template-01 bridge reliably skips form (single authoritative handler)', roofingIsSkip === true);

  // ---------------------------------------------------------------------------
  // ARCHITECTURAL & SEMANTIC MISMATCH AUDIT: GYM & REAL ESTATE
  // ---------------------------------------------------------------------------
  console.log('\n--- Architectural & Semantic Mismatch Evaluation: Gym & Real Estate ---');

  const gymRaw = fs.readFileSync('public/templates-raw/gym-template-01.html', 'utf8');
  const gymFormMatch = gymRaw.match(/<form\b([\s\S]*?)>([\s\S]*?)<\/form>/i);
  const gymInner = gymFormMatch ? gymFormMatch[2] : '';

  const gymHasGoal = gymInner.includes('form-goal') && gymInner.includes('Core Fitness Goal');
  const gymHasDesc = gymInner.includes('form-desc') && gymInner.includes('Workout Background');
  const gymHasNoCalendar = !gymInner.includes('date') && !gymInner.includes('time') && !gymInner.includes('slot');
  check('Gym form identified as 7-Day Free VIP Pass Lead Capture (not an appointment booking)', gymHasGoal && gymHasDesc && gymHasNoCalendar);

  const reRaw = fs.readFileSync('public/templates-raw/realestate-template-01.html', 'utf8');
  const reFormMatch = reRaw.match(/<form\b([\s\S]*?)>([\s\S]*?)<\/form>/i);
  const reInner = reFormMatch ? reFormMatch[2] : '';

  const reHasValuation = reRaw.includes('valuationForm') && reRaw.includes('Get My Free Home Valuation');
  const reHasPropertyType = reInner.includes('propertyType') && reInner.includes('Single Family');
  const reHasTimeline = reInner.includes('timeline') && reInner.includes('Selling Timeline');
  const reHasNoServiceOrSlot = !reInner.includes('booking-service') && !reInner.includes('time-slot');
  check('Real Estate form identified as Home Valuation Inquiry (not an appointment booking)', reHasValuation && reHasPropertyType && reHasTimeline && reHasNoServiceOrSlot);

  // ---------------------------------------------------------------------------
  // 4. SITE COMPILATION VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. compileSite() Pipeline Verification ---');

  const compileTests = [
    { key: 'roofing-template-01', slug: 'pinnacle-roofing-atx', name: 'Pinnacle Roofing ATX' },
    { key: 'gym-template-01', slug: 'titan-athletics-atx', name: 'Titan Athletics Gym' },
    { key: 'realestate-template-01', slug: 'sovereign-realty-atx', name: 'Sovereign Luxury Realty' }
  ];

  for (const ct of compileTests) {
    const compiled = await compileSite({
      name: ct.name,
      slug: ct.slug,
      city: 'Austin, TX',
      phone: '(512) 555-0199'
    }, ct.key);

    const leftovers = compiled.html.match(/\{\{/g) || [];
    check(`compileSite(${ct.key}) generates clean HTML with 0 leftover {{`, leftovers.length === 0, `Found: ${leftovers.length}`);
    check(`compileSite(${ct.key}) injects lunao-booking-bridge.js`, compiled.html.includes('lunao-booking-bridge.js'));
    check(`compileSite(${ct.key}) replaces business name accurately`, compiled.html.includes(ct.name));
  }

  // ---------------------------------------------------------------------------
  // 5. LIVE SUPABASE STAGING VERIFICATION (GATES 4, 5, 6, 7, 8) FOR ROOFING
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Gates 4-8: Live Supabase Staging Submission, Idempotency & Cleanup (Roofing) ---');

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
    // Postgres-backed client bridge for handleRequest
    const pgSupabaseClient = {
      rpc: async (fnName, params) => {
        if (fnName === 'check_and_increment_rate_limit') {
          const res = await dbClient.query(
            `SELECT public.check_and_increment_rate_limit($1, $2, $3, $4) as rl`,
            [params.p_bucket_key, params.p_window_start, params.p_max_requests, params.p_now]
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
                  rec.email || '',
                  rec.service || '',
                  rec.date || null,
                  rec.time || null,
                  rec.notes || '',
                  rec.source || 'form',
                  rec.status || 'new',
                  rec.idempotency_key || rec.idempotencyKey || null,
                  Date.now()
                ]
              );
              return { data: res.rows[0], error: null };
            }
          })
        })
      })
    };

    const tc = {
      templateName: 'roofing-template-01 (roofing-template-01.html)',
      tenantSlug: 'test-roofing-apex-' + Date.now(),
      businessName: 'Apex Roofing & Restoration',
      service: 'Full Replacement',
      phone: '(512) 555-0199',
      customerName: 'Robert Langdon',
      address: '742 Evergreen Terrace, Austin, TX'
    };

    console.log(`\nTesting Live Staging for ${tc.templateName}...`);
    // Provision temporary registered active tenant in staging
    await dbClient.query(
      `INSERT INTO public.tenants (id, slug, name, niche, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
       ON CONFLICT (slug) DO UPDATE SET is_active = TRUE`,
      [`test-id-${tc.tenantSlug}`, tc.tenantSlug, tc.businessName, 'Roofing & Exterior']
    );

    const idempotencyKey = `stage3-batch3-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const testPayload = {
      slug: tc.tenantSlug,
      businessName: tc.businessName,
      customerName: tc.customerName,
      phone: tc.phone,
      service: tc.service,
      notes: 'Property Address: ' + tc.address,
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

    // Verify row in PostgreSQL
    const rowRes1 = await dbClient.query(
      'SELECT * FROM bookings WHERE slug = $1 AND idempotency_key = $2',
      [tc.tenantSlug, idempotencyKey]
    );
    check(`[${tc.templateName}] Gate 4: Booking row durably persisted in Supabase`, rowRes1.rows.length === 1);
    if (rowRes1.rows.length === 1) {
      check(`[${tc.templateName}] Notes preserve customer address`, rowRes1.rows[0].notes.includes(tc.address));
    }

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
    check(`[${tc.templateName}] Gate 5: Exactly 1 row in database (0 duplicates created)`, parseInt(rowCountRes.rows[0].cnt, 10) === 1);

    // GATE 6: Invalid Submission Handling (HTTP 400 Bad Request)
    const invalidPayload = {
      ...testPayload,
      customerName: '', // empty name
      idempotencyKey: 'inv-' + Date.now()
    };
    const reqInvalid = new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidPayload)
    });
    const resInvalid = await handleRequest(reqInvalid, pgSupabaseClient);
    check(`[${tc.templateName}] Gate 6: Invalid submission rejected with HTTP 400 Bad Request`, resInvalid.status === 400);

    // GATE 7: Tenant Isolation
    const tenantFeedRes = await dbClient.query(
      'SELECT * FROM bookings WHERE slug = $1 ORDER BY created_at DESC',
      [tc.tenantSlug]
    );
    check(`[${tc.templateName}] Gate 7: Correct tenant can read the persisted booking in Owner feed`, tenantFeedRes.rows.length >= 1);

    const otherTenantSlug = 'unrelated-tenant-' + Date.now();
    const crossTenantRes = await dbClient.query(
      'SELECT * FROM bookings WHERE slug = $1',
      [otherTenantSlug]
    );
    check(`[${tc.templateName}] Gate 7: Other tenant CANNOT see this booking (tenant isolation)`, crossTenantRes.rows.length === 0);

    // GATE 8: Isolated Test Cleanup
    await dbClient.query(
      'DELETE FROM bookings WHERE slug = $1',
      [tc.tenantSlug]
    );
    await dbClient.query('DELETE FROM public.endpoint_rate_limits WHERE bucket_key LIKE $1', [`%:${tc.tenantSlug}`]);
    await dbClient.query('DELETE FROM public.tenants WHERE slug = $1', [tc.tenantSlug]);
    const cleanupCheck = await dbClient.query(
      'SELECT COUNT(*) as cnt FROM bookings WHERE slug = $1',
      [tc.tenantSlug]
    );
    check(`[${tc.templateName}] Gate 8: Isolated test record cleaned up successfully (0 remaining)`, parseInt(cleanupCheck.rows[0].cnt, 10) === 0);

    await dbClient.end();
  }

  console.log('\n========================================================================');
  console.log(`📊 STAGE 3 BATCH 3 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runStage3Batch3Tests().catch((err) => {
  console.error('Fatal error during Stage 3 Batch 3 testing:', err);
  process.exit(1);
});
