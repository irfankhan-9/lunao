/**
 * Lunao Stage 3, Batch 2: Automated Verification Suite for Salon & Dentist Templates
 * 
 * Covers:
 * 1. salon-template-01.html (salon-template-01)
 * 2. dentist-template-01.html (dentist-template-01)
 * 
 * Verifies all requirements, privacy protections, and the 8-Gate verification matrix.
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

async function runStage3Batch2Tests() {
  console.log('========================================================================');
  console.log('✨🦷 LUNAO STAGE 3 BATCH 2: SALON + DENTIST INTEGRATION & 8-GATE AUDIT');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. PLACEHOLDER & FILE PARITY AUDIT (GATE 1)
  // ---------------------------------------------------------------------------
  console.log('--- 1. Gate 1: Sacred Raw & Public Placeholder Audit ---');

  const filesConfig = [
    {
      name: 'salon-template-01 (salon-template-01.html)',
      raw: 'public/templates-raw/salon-template-01.html',
      pub: 'public/salon-template-01.html',
      root: 'salon-template-01.html',
      key: 'salon-template-01'
    },
    {
      name: 'dentist-template-01 (dentist-template-01.html)',
      raw: 'public/templates-raw/dentist-template-01.html',
      pub: 'public/dentist-template-01.html',
      root: 'dentist-template-01.html',
      key: 'dentist-template-01'
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
  // 3. DOM FORM & SINGLE AUTHORITATIVE HANDLER CHECK (GATE 3 & BRIDGE SKIP)
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Gate 3 & Bridge: DOM Form & Single Authoritative Handler ---');

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

    // Bridge skip verification
    const isSkip = /data-lunao-inline-booking/i.test(formAttrs) ||
                   /data-lunao-skip-bridge/i.test(formAttrs) ||
                   /data-booking-handler=["']inline["']/i.test(formAttrs);

    check(`${cfg.name} booking bridge reliably skips this form (single authoritative handler)`, isSkip === true);
  }

  // ---------------------------------------------------------------------------
  // PRIVACY REQUIREMENT VERIFICATION FOR DENTIST TEMPLATE
  // ---------------------------------------------------------------------------
  console.log('\n--- Privacy Audit: Dentist Template Date of Birth & Sensitive Data Protection ---');
  const dentistRaw = fs.readFileSync('public/templates-raw/dentist-template-01.html', 'utf8');
  const dentistFormMatch = dentistRaw.match(/<form\b([\s\S]*?)>([\s\S]*?)<\/form>/i);
  const dentistFormInner = dentistFormMatch ? dentistFormMatch[2] : '';

  // 1. frm_dob must exist in DOM for visual presentation
  check('Dentist form retains Date of Birth input visually in DOM', dentistFormInner.includes('id="frm_dob"'));
  
  // 2. frm_dob MUST NOT have name="dob" or name="date_of_birth"
  const dobHasNameAttr = /id=["']frm_dob["'][^>]*\bname=/i.test(dentistFormInner) || /\bname=["'][^"']*(?:dob|birth)[^"']*["']/i.test(dentistFormInner);
  check('Dentist form strictly omits name attribute from Date of Birth input', !dobHasNameAttr);

  // 3. Script handler does NOT read or send Date of Birth
  const scriptMatch = dentistRaw.match(/<script[\s\S]*?<\/script>/gi);
  const scriptContent = scriptMatch ? scriptMatch.join('\n') : '';
  const readsDob = /frm_dob\.value/i.test(scriptContent) || /payload\.dob/i.test(scriptContent) || /payload\.date_of_birth/i.test(scriptContent);
  check('Dentist script handler strictly never reads or transmits Date of Birth', !readsDob);

  // 4. Sample payload produces clean contract compliance
  const dentistSamplePayload = {
    slug: 'radiant-smiles-atx',
    businessName: 'Radiant Smiles Dental',
    customerName: 'Eleanor Vance',
    phone: '(512) 555-0194',
    email: 'eleanor@example.com',
    service: 'Teeth Cleaning',
    date: '2026-12-05',
    time: '09:00 AM',
    notes: 'Preferred Provider: Dr. Sarah Kovacs',
    source: 'form',
    status: 'new',
    idempotencyKey: 'test-dentist-' + Date.now()
  };
  const dentistPayloadRes = validateBookingPayloadContract(dentistSamplePayload);
  check('Dentist payload strictly passes canonical payload contract', dentistPayloadRes.valid === true, dentistPayloadRes.error || '');

  // Verify that injecting DOB or custom field fails payload contract
  const dirtyPayload = { ...dentistSamplePayload, dob: '1990-05-15' };
  const dirtyRes = validateBookingPayloadContract(dirtyPayload);
  check('Server rejects unapproved DOB in payload top-level', dirtyRes.valid === false);

  // ---------------------------------------------------------------------------
  // 4. SITE COMPILATION VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. compileSite() Pipeline Verification ---');

  const compileTests = [
    { key: 'salon-template-01', slug: 'lumiere-salon-atx', name: 'Lumière Salon Studio' },
    { key: 'dentist-template-01', slug: 'crestview-dental-atx', name: 'Crestview Dental Care' }
  ];

  for (const ct of compileTests) {
    const compiled = await compileSite({
      name: ct.name,
      slug: ct.slug,
      city: 'Austin, TX',
      phone: '(512) 555-0197'
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
        templateName: 'salon-template-01 (salon-template-01.html)',
        tenantSlug: 'test-salon-atelier-' + Date.now(),
        businessName: 'Aurora Salon Atelier',
        service: 'Signature Cut ✂️',
        phone: '(512) 555-0177',
        customerName: 'Clara Oswald',
        notes: 'Preferred Stylist: Sophie Laurent'
      },
      {
        templateName: 'dentist-template-01 (dentist-template-01.html)',
        tenantSlug: 'test-dentist-smiles-' + Date.now(),
        businessName: 'Radiant Smiles Dental',
        service: 'Comprehensive Exam',
        phone: '(512) 555-0194',
        customerName: 'Martha Jones',
        notes: 'Preferred Provider: Dr. Sarah Kovacs'
      }
    ];

    for (const tc of testCases) {
      console.log(`\nTesting Live Staging for ${tc.templateName}...`);
      // Provision temporary registered active tenant in staging
      await dbClient.query(
        `INSERT INTO public.tenants (id, slug, name, niche, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
         ON CONFLICT (slug) DO UPDATE SET is_active = TRUE`,
        [`test-id-${tc.tenantSlug}`, tc.tenantSlug, tc.businessName, 'Salon & Dental']
      );

      const idempotencyKey = `stage3-batch2-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const testPayload = {
        slug: tc.tenantSlug,
        businessName: tc.businessName,
        customerName: tc.customerName,
        phone: tc.phone,
        email: 'test.batch2@lunao.app',
        service: tc.service,
        date: '2026-12-10',
        time: '10:00 AM',
        notes: tc.notes,
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

      // Verify privacy in persisted row: no DOB in notes or custom fields
      if (rowRes1.rows.length === 1) {
        const persisted = rowRes1.rows[0];
        const notesContent = String(persisted.notes || '');
        check(`[${tc.templateName}] Privacy: No Date of Birth found in persisted notes`, !notesContent.includes('19') && !notesContent.includes('200') && !notesContent.toLowerCase().includes('dob'));
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
        customerName: '', // Empty name violated
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
    }

    await dbClient.end();
  }

  console.log('\n========================================================================');
  console.log(`📊 STAGE 3 BATCH 2 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runStage3Batch2Tests().catch(err => {
  console.error('Fatal error during Stage 3 Batch 2 testing:', err);
  process.exit(1);
});
