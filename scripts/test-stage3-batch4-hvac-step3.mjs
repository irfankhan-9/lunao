// scripts/test-stage3-batch4-hvac-step3.mjs
// Comprehensive Stage 3 Batch 4 Step 3 Verification Suite

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { resolveTemplate, BUILTIN_TEMPLATES } from '../server/lib/templates.js';
import { compileSite } from '../server/lib/compile.js';
import { validateBookingPayloadContract } from '../server/lib/bookingContractValidator.js';
import { SAMPLE_HVAC_BIZ, APEX_CLIMATE_BIZ } from './compile-hvac-templates.mjs';

dotenv.config();
dotenv.config({ path: '.env.local' });

let passed = 0;
let failed = 0;

function check(label, condition, extra = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}${extra ? ' -> ' + extra : ''}`);
    failed++;
  }
}

async function runStep3Verification() {
  console.log('========================================================================');
  console.log('❄️ LUNAO STAGE 3 BATCH 4, STEP 3: HVAC SYNCHRONIZATION & COMPILATION AUDIT');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. Environment & Git Check
  // ---------------------------------------------------------------------------
  console.log('--- 1. Environment & Baseline Integrity ---');
  const gitExists = fs.existsSync('.git');
  check('.git directory is absent (workspace adheres to no-git-claims rule)', !gitExists);

  const backupDir = 'backups/stage3-batch4-step3';
  check('Rollback backup directory exists', fs.existsSync(backupDir));
  const backupFiles = fs.readdirSync(backupDir);
  check(`Rollback copies preserved (found ${backupFiles.length} files)`, backupFiles.length >= 10);

  // ---------------------------------------------------------------------------
  // 2. Raw Template Parity & Sacred Placeholder Preservation
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Raw Template Parity & Sacred Placeholder Preservation ---');
  const rawBespoke = fs.readFileSync('public/templates-raw/hvac-bespoke.html');
  const rawHvac = fs.readFileSync('public/templates-raw/hvac-template.html');
  const rawHvac02 = fs.readFileSync('public/templates-raw/hvac-template-02.html');
  const rawHvac01 = fs.readFileSync('public/templates-raw/hvac-template-01.html');

  const hashBespoke = crypto.createHash('sha256').update(rawBespoke).digest('hex');
  const hashHvac = crypto.createHash('sha256').update(rawHvac).digest('hex');
  const hashHvac02 = crypto.createHash('sha256').update(rawHvac02).digest('hex');
  const hashHvac01 = crypto.createHash('sha256').update(rawHvac01).digest('hex');

  check('Raw hvac-template.html is byte-for-byte identical to hvac-bespoke.html', hashHvac === hashBespoke, `hvac: ${hashHvac}, bespoke: ${hashBespoke}`);
  check('Raw hvac-template-02.html is byte-for-byte identical to hvac-bespoke.html', hashHvac02 === hashBespoke, `hvac02: ${hashHvac02}, bespoke: ${hashBespoke}`);
  check('All three raw bespoke files share exact byte size', rawBespoke.length === rawHvac.length && rawHvac.length === rawHvac02.length);

  // Unrelated template protection: hvac-template-01.html must NOT match bespoke
  check('hvac-template-01.html (Everest Climate) was NOT altered to bespoke hash', hashHvac01 !== hashBespoke);
  check('hvac-template-01.html maintains separate original content', rawHvac01.toString('utf8').includes('Everest Climate Systems'));

  // Sacred Placeholders check in all three raw files
  const rawList = [
    { name: 'hvac-bespoke.html', content: rawBespoke.toString('utf8') },
    { name: 'hvac-template.html', content: rawHvac.toString('utf8') },
    { name: 'hvac-template-02.html', content: rawHvac02.toString('utf8') }
  ];

  for (const r of rawList) {
    check(`${r.name} preserves {{BUSINESS_NAME}}`, r.content.includes('{{BUSINESS_NAME}}'));
    check(`${r.name} preserves {{CITY_NAME}}`, r.content.includes('{{CITY_NAME}}'));
    check(`${r.name} preserves {{PHONE_NUMBER}}`, r.content.includes('{{PHONE_NUMBER}}'));
    check(`${r.name} preserves {{BOOKING_URL}}`, r.content.includes('{{BOOKING_URL}}'));
    check(`${r.name} preserves {{SLUG}} dynamic injection`, r.content.includes('window.LUNAO_SLUG = "{{SLUG}}"'));
  }

  // ---------------------------------------------------------------------------
  // 3. Six Preview & Root Files Parity & Placeholder Verification
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Six Preview & Root Files Parity & Placeholder Verification ---');
  const previewPaths = [
    'public/hvac-bespoke.html',
    'public/hvac-template.html',
    'public/hvac-template-02.html',
    'hvac-bespoke.html',
    'hvac-template.html',
    'hvac-template-02.html'
  ];

  const previewBuffers = previewPaths.map(p => ({
    path: p,
    buf: fs.readFileSync(p),
    content: fs.readFileSync(p, 'utf8'),
    hash: crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
  }));

  const referencePreviewHash = previewBuffers[0].hash;
  for (const pb of previewBuffers) {
    check(`${pb.path} matches canonical preview hash`, pb.hash === referencePreviewHash);
    const leftovers = pb.content.match(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g);
    check(`${pb.path} has 0 unresolved {{...}} placeholders`, !leftovers || leftovers.length === 0);
    check(`${pb.path} contains injected lunao-booking-bridge.js`, pb.content.includes('lunao-booking-bridge.js'));
    check(`${pb.path} includes real booking modal handler`, pb.content.includes('submitBooking'));
    check(`${pb.path} includes all six lead handlers`, 
      pb.content.includes('submitFeasibilityInquiry') &&
      pb.content.includes('submitNewsletter') &&
      pb.content.includes('submitWarrantyRequest') &&
      pb.content.includes('submitSpecimenOrder') &&
      pb.content.includes('submitWorkshopInquiry') &&
      pb.content.includes('submitContactInquiry')
    );
  }

  // ---------------------------------------------------------------------------
  // 4. Apex Compiled Site Verification
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Apex Compiled Site Verification (sites/apex-climate-care-austin/index.html) ---');
  const apexPath = 'sites/apex-climate-care-austin/index.html';
  check('Apex compiled site exists', fs.existsSync(apexPath));

  const apexContent = fs.readFileSync(apexPath, 'utf8');
  const apexLeftovers = apexContent.match(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g);
  check('Apex site has 0 unresolved {{...}} placeholders', !apexLeftovers || apexLeftovers.length === 0);
  check('Apex site contains correct business name "Apex Climate Care"', apexContent.includes('Apex Climate Care'));
  check('Apex site contains correct location "Austin, TX"', apexContent.includes('Austin, TX'));
  check('Apex site contains correct contact email "contact@apexclimatecare.com"', apexContent.includes('contact@apexclimatecare.com'));
  check('Apex site contains correct phone link "href=\\"tel:+15125550199\\"" or "15125550199"', /href=["']tel:\+?1?5125550199["']/.test(apexContent));
  check('Apex site contains dynamic window.LUNAO_SLUG = "apex-climate-care-austin"', apexContent.includes('window.LUNAO_SLUG = "apex-climate-care-austin"'));
  check('Apex site contains injected lunao-booking-bridge.js', apexContent.includes('lunao-booking-bridge.js'));
  check('Apex site contains real submitBooking handler', apexContent.includes('submitBooking'));
  check('Apex site contains inline error element #bookingModalError', apexContent.includes('id="bookingModalError"'));
  check('Apex site contains Step 5 celebration UI', apexContent.includes('id="bookingStep5"') && apexContent.includes('celebration-card-wrap'));
  check('Apex site contains all 6 lead form handlers',
    apexContent.includes('submitFeasibilityInquiry') &&
    apexContent.includes('submitNewsletter') &&
    apexContent.includes('submitWarrantyRequest') &&
    apexContent.includes('submitSpecimenOrder') &&
    apexContent.includes('submitWorkshopInquiry') &&
    apexContent.includes('submitContactInquiry')
  );

  // ---------------------------------------------------------------------------
  // 5. JavaScript Template Literal & Syntax Integrity
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. JavaScript Template Literal & Syntax Integrity ---');
  check('JavaScript template literals preserved without corruption (e.g. "${business.name}")', apexContent.includes('${business.name}'));
  check('Valid JS article slug interpolation preserved ("${art.slug}")', apexContent.includes('${art.slug}'));
  check('Review submission remains client-side in Apex site', apexContent.includes('reviewSubmitForm') && apexContent.includes('REVIEWS_DATA'));
  check('Concierge AI typewriter remains client-side in Apex site', apexContent.includes('generateAiResponse') && apexContent.includes('typewriterAnimateHtml'));

  // ---------------------------------------------------------------------------
  // 6. Template Aliasing & Compiler Pipeline Tests
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. Template Aliasing & Compiler Pipeline Tests ---');
  const resBespoke = await compileSite(SAMPLE_HVAC_BIZ, 'hvac-bespoke');
  const resHvac = await compileSite(SAMPLE_HVAC_BIZ, 'hvac-template');
  const resHvac02 = await compileSite(SAMPLE_HVAC_BIZ, 'hvac-template-02');

  const cHash1 = crypto.createHash('sha256').update(resBespoke.html).digest('hex');
  const cHash2 = crypto.createHash('sha256').update(resHvac.html).digest('hex');
  const cHash3 = crypto.createHash('sha256').update(resHvac02.html).digest('hex');

  check('compileSite(hvac-bespoke) succeeds', resBespoke.resolved.key === 'hvac-bespoke');
  check('compileSite(hvac-template) resolves to canonical template', resHvac.resolved.key === 'hvac-bespoke');
  check('compileSite(hvac-template-02) resolves to canonical template', resHvac02.resolved.key === 'hvac-bespoke');
  check('compileSite outputs are identical across aliases', cHash1 === cHash2 && cHash2 === cHash3);

  // Non-hardcoded tenant test: verify arbitrary business produces its own slug
  const customBiz = {
    name: 'Glacier Peak Thermal Works',
    city: 'Seattle, WA',
    phone: '(206) 555-0144'
  };
  const customRes = await compileSite(customBiz, 'hvac-bespoke');
  check('Arbitrary business compilation has zero leftover {{', !customRes.html.match(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g));
  check('Arbitrary business gets dynamic slug in window.LUNAO_SLUG', customRes.html.includes('window.LUNAO_SLUG = "glacier-peak-thermal-works-seattle"'));
  check('Arbitrary business does NOT hardcode apex-climate-care-austin in window.LUNAO_SLUG', !customRes.html.includes('window.LUNAO_SLUG = "apex-climate-care-austin"'));

  // ---------------------------------------------------------------------------
  // 7. Unrelated Sites Protection Audit
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. Unrelated Sites Protection Audit ---');
  const unrelatedSitesToCheck = [
    'sites/acme-barber-austin/index.html',
    'sites/acme-salon-dallas/index.html',
    'sites/bright-smiles-dental-boston/index.html',
    'sites/elite-roofing-pro-austin-roofing/index.html',
    'sites/iron-grit-fitness-brooklyn/index.html',
    'sites/everest-climate-systems-austin/index.html'
  ];

  for (const s of unrelatedSitesToCheck) {
    if (fs.existsSync(s)) {
      const content = fs.readFileSync(s, 'utf8');
      check(`Unrelated site ${s} exists and does not contain bespoke HVAC markers`, !content.includes('Aeris & Therma'));
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Live Supabase PostgreSQL Staging Verification (Apex Tenant)
  // ---------------------------------------------------------------------------
  console.log('\n--- 8. Live Supabase PostgreSQL Staging Verification (Apex Tenant) ---');
  let dbClient = null;
  let dbConnected = false;

  try {
    const rawPassword = process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD || '$@Khan1234455';
    const password = rawPassword.replace(/^["']|["']$/g, '').trim();
    const host = process.env.SUPABASE_DB_HOST || 'aws-0-us-east-1.pooler.supabase.com';
    const port = parseInt(process.env.SUPABASE_DB_PORT || '6543', 10);
    const user = process.env.SUPABASE_DB_USER || 'postgres.wqlbuadknltsjfzrltpe';
    const database = process.env.SUPABASE_DB_NAME || 'postgres';

    dbClient = new pg.Client({
      host,
      port,
      user,
      password,
      database,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });

    await dbClient.connect();
    dbConnected = true;
    console.log('✓ Successfully connected to live Supabase PostgreSQL staging database.');
  } catch (err) {
    console.error('❌ Failed to connect to PostgreSQL staging:', err.message);
  }

  check('Live Supabase PostgreSQL database connection established', dbConnected);

  if (dbConnected) {
    const liveCreatedIds = { bookings: [], leads: [] };

    try {
      // 8a. Live Booking Test for Apex Tenant
      const liveBookingKey = `stage3-batch4-step3-apex-${Date.now()}`;
      const insertBookingQuery = `
        INSERT INTO public.bookings (slug, customer_name, phone, email, service, date, time, notes, status, idempotency_key, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, slug, customer_name, service, idempotency_key;
      `;
      const liveBookingRes = await dbClient.query(insertBookingQuery, [
        'apex-climate-care-austin',
        'Eleanor Vance Step 3 Verification',
        '+1 (512) 555-0144',
        'eleanor.vance@example.com',
        'Hospital-Grade Cleanroom Air Purification',
        '2026-10-15',
        '02:00 PM',
        'Bespoke HVAC Step 3 Verification',
        'new',
        liveBookingKey,
        Date.now(),
      ]);

      const liveBookingId = liveBookingRes.rows[0]?.id;
      liveCreatedIds.bookings.push(liveBookingId);

      check('Apex live booking persists to public.bookings table', !!liveBookingId);
      check('Apex live booking stored under correct tenant slug', liveBookingRes.rows[0]?.slug === 'apex-climate-care-austin');

      // Test duplicate prevention under same idempotency key
      let dupCaught = false;
      try {
        await dbClient.query(insertBookingQuery, [
          'apex-climate-care-austin',
          'Eleanor Vance Duplicate Attempt',
          '+1 (512) 555-0144',
          'eleanor.vance@example.com',
          'Hospital-Grade Cleanroom Air Purification',
          '2026-10-15',
          '02:00 PM',
          'Duplicate',
          'new',
          liveBookingKey,
          Date.now(),
        ]);
      } catch (dupErr) {
        dupCaught = dupErr.code === '23505' || dupErr.message.includes('unique');
      }
      check('Database unique constraint blocks duplicate booking for Apex tenant', dupCaught);

      // 8b. Live Lead Test for Apex Tenant
      const liveLeadKey = `stage3-batch4-step3-apex-lead-${Date.now()}`;
      const insertLeadQuery = `
        INSERT INTO public.leads (slug, lead_type, customer_name, phone, email, notes, details, source, status, idempotency_key, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, slug, lead_type, customer_name, idempotency_key;
      `;
      const liveLeadRes = await dbClient.query(insertLeadQuery, [
        'apex-climate-care-austin',
        'consultation',
        'Harrison Frost Architectural Review',
        '+1 (512) 555-0177',
        'harrison.frost@example.com',
        'Architectural feasibility review for luxury residence',
        JSON.stringify({ property_address: '1200 Barton Springs Rd', inquiry_type: 'architectural_feasibility' }),
        'website_form',
        'new',
        liveLeadKey,
        Date.now(),
      ]);

      const liveLeadId = liveLeadRes.rows[0]?.id;
      liveCreatedIds.leads.push(liveLeadId);

      check('Apex live lead persists to public.leads table', !!liveLeadId);
      check('Apex live lead stored under correct tenant slug', liveLeadRes.rows[0]?.slug === 'apex-climate-care-austin');
      check('Apex live lead has lead_type "consultation"', liveLeadRes.rows[0]?.lead_type === 'consultation');

      // Test duplicate lead prevention
      let leadDupCaught = false;
      try {
        await dbClient.query(insertLeadQuery, [
          'apex-climate-care-austin',
          'consultation',
          'Harrison Frost Duplicate',
          '+1 (512) 555-0177',
          'harrison.frost@example.com',
          'Duplicate',
          JSON.stringify({ duplicate: true }),
          'website_form',
          'new',
          liveLeadKey,
          Date.now(),
        ]);
      } catch (lDupErr) {
        leadDupCaught = lDupErr.code === '23505' || lDupErr.message.includes('unique');
      }
      check('Database unique index blocks duplicate lead for Apex tenant', leadDupCaught);

    } finally {
      // -----------------------------------------------------------------------
      // 9. Staging Data Cleanup
      // -----------------------------------------------------------------------
      console.log('\n--- 9. Staging Data Cleanup ---');
      if (liveCreatedIds.bookings.length > 0) {
        const delBookings = await dbClient.query(
          `DELETE FROM public.bookings WHERE id = ANY($1)`,
          [liveCreatedIds.bookings]
        );
        check(`Cleaned up ${delBookings.rowCount} staging booking row(s)`, delBookings.rowCount === liveCreatedIds.bookings.length);
      }
      if (liveCreatedIds.leads.length > 0) {
        const delLeads = await dbClient.query(
          `DELETE FROM public.leads WHERE id = ANY($1)`,
          [liveCreatedIds.leads]
        );
        check(`Cleaned up ${delLeads.rowCount} staging lead row(s)`, delLeads.rowCount === liveCreatedIds.leads.length);
      }
      await dbClient.end();
    }
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`TOTAL CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runStep3Verification().catch((err) => {
  console.error('Fatal test error in Step 3 suite:', err);
  process.exit(1);
});
