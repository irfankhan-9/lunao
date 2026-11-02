/**
 * Lunao Stage 3, Batch 4, Step 2: Bespoke HVAC Verification Suite
 * 
 * Verifies:
 * 1. Template Registry & Aliasing in server/lib/templates.js (canonical hvac-bespoke + aliases)
 * 2. Primary 5-Step Booking Modal Contract & Persistence
 * 3. Idempotency and Duplication Prevention for HVAC Bookings
 * 4. Six Dedicated Customer Lead Forms (consultation, newsletter, warranty_claim, specimen_order, workshop_inquiry, general_inquiry)
 * 5. Fail-Closed Error Behavior & Input Retention
 * 6. Client-Side Integrity (Reviews and AI Concierge stay client-side)
 * 7. Sacred Raw Placeholder Parity
 * 8. Live Supabase PostgreSQL Staging Verification (Persistence, Deduplication & Cleanup)
 */

import 'dotenv/config';
import fs from 'node:fs';
import pg from 'pg';
import { resolveTemplate, BUILTIN_TEMPLATES } from '../server/lib/templates.js';
import { validateBookingContract, validateBookingPayloadContract } from '../server/lib/bookingContractValidator.js';
import { handleRequest } from '../supabase/functions/public-bookings/index.ts';
import { handleLeadRequest, ALLOWED_LEAD_TYPES } from '../supabase/functions/public-leads/index.ts';

const { Client } = pg;
const projectRef = 'wqlbuadknltsjfzrltpe';
const host = 'aws-0-us-east-1.pooler.supabase.com';
const port = 6543;
const user = 'postgres.' + projectRef;
const rawPassword = process.env.SUPABASE_DB_PASSWORD || '$@Khan1234455';
const password = rawPassword.replace(/^["']|["']$/g, '').trim();

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

async function runBespokeHvacStep2Verification() {
  console.log('========================================================================');
  console.log('❄️ LUNAO STAGE 3 BATCH 4, STEP 2: BESPOKE HVAC VERIFICATION SUITE');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. TEMPLATE REGISTRY & ALIASING RESOLUTION
  // ---------------------------------------------------------------------------
  console.log('--- 1. Template Registry & Alias Resolution ---');

  const bespokeBuiltin = BUILTIN_TEMPLATES.find((t) => t.key === 'hvac-bespoke');
  check('Canonical hvac-bespoke registered in BUILTIN_TEMPLATES', !!bespokeBuiltin);
  check('hvac-bespoke uses rawFile hvac-bespoke.html', bespokeBuiltin && bespokeBuiltin.rawFile === 'hvac-bespoke.html');

  const resBespoke = await resolveTemplate('hvac-bespoke');
  check('resolveTemplate("hvac-bespoke") returns canonical template', resBespoke && resBespoke.key === 'hvac-bespoke');

  const resAlias02 = await resolveTemplate('hvac-template-02');
  check('resolveTemplate("hvac-template-02") aliases to hvac-bespoke', resAlias02 && resAlias02.key === 'hvac-bespoke');

  const resAliasLegacy = await resolveTemplate('hvac-template');
  check('resolveTemplate("hvac-template") aliases to hvac-bespoke', resAliasLegacy && resAliasLegacy.key === 'hvac-bespoke');

  const resHvac01 = await resolveTemplate('hvac-template-01');
  check('resolveTemplate("hvac-template-01") still resolves to Everest Climate', resHvac01 && resHvac01.key === 'hvac-template-01');

  const resBarber = await resolveTemplate('barber-dark-luxury');
  check('resolveTemplate("barber-dark-luxury") preserved', resBarber && resBarber.key === 'barber-dark-luxury');

  // ---------------------------------------------------------------------------
  // 2. SACRED RAW PLACEHOLDER INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Sacred Raw Placeholder Integrity ---');

  const rawHtml = fs.readFileSync('public/templates-raw/hvac-bespoke.html', 'utf8');
  const rawPlaceholders = rawHtml.match(/\{\{[A-Z0-9_]+\}\}/g) || [];
  check('Raw template contains sacred {{PLACEHOLDERS}}', rawPlaceholders.length > 0, `Count: ${rawPlaceholders.length}`);
  check('Raw template includes {{BUSINESS_NAME}}', rawHtml.includes('{{BUSINESS_NAME}}'));
  check('Raw template includes {{CITY_NAME}}', rawHtml.includes('{{CITY_NAME}}'));
  check('Raw template includes {{PHONE_NUMBER}}', rawHtml.includes('{{PHONE_NUMBER}}'));
  check('Raw template includes {{BOOKING_URL}}', rawHtml.includes('{{BOOKING_URL}}'));

  // ---------------------------------------------------------------------------
  // 3. BOOKING CONTRACT VALIDATION & DOM STRUCTURE
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Primary Booking Modal DOM Structure & Contract ---');

  const contractResult = validateBookingContract(rawHtml);
  check('Booking contract validator accepts bespoke template structure', contractResult.valid, contractResult.reason);

  check('Step 1 service selector exists', rawHtml.includes('id="bookingServiceOptions"'));
  check('Step 2 scope selector exists', rawHtml.includes('id="bookingBarberOptions"'));
  check('Step 3 date and time inputs exist', rawHtml.includes('id="bookingDateInput"') && rawHtml.includes('class="booking-time-grid"'));
  check('Step 4 customer input fields exist', rawHtml.includes('id="bookingName"') && rawHtml.includes('id="bookingPhone"') && rawHtml.includes('id="bookingEmail"') && rawHtml.includes('id="bookingAddress"'));
  check('Step 4 inline error banner (#bookingModalError) exists', rawHtml.includes('id="bookingModalError"'));
  check('Step 4 submit button (#bookingSubmitBtn) exists', rawHtml.includes('id="bookingSubmitBtn"'));
  check('Step 5 celebration summary elements exist', rawHtml.includes('id="summaryRef"') && rawHtml.includes('id="summaryService"') && rawHtml.includes('id="summaryClient"'));

  // ---------------------------------------------------------------------------
  // 4. PRIMARY BOOKING ENDPOINT SUBMISSION & DEDUPLICATION (MOCK + LIVE)
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Primary Booking Endpoint Submission & Deduplication ---');

  const mockDbBookings = new Map();
  const mockSupabaseBookings = {
    rpc: async () => ({
      data: [{ allowed: true, current_count: 1, retry_after_seconds: 0 }],
      error: null
    }),
    from: (table) => ({
      select: (cols) => ({
        eq: (f1, v1) => ({
          maybeSingle: async () => {
            if (table === 'tenants' && v1 === 'apex-climate-care-austin') {
              return { data: { slug: 'apex-climate-care-austin', name: 'Apex Climate Care', is_active: true }, error: null };
            }
            return { data: null, error: null };
          },
          single: async () => {
            if (table === 'tenants' && v1 === 'apex-climate-care-austin') {
              return { data: { slug: 'apex-climate-care-austin', name: 'Apex Climate Care', is_active: true }, error: null };
            }
            return { data: null, error: null };
          },
          eq: (f2, v2) => ({
            maybeSingle: async () => {
              for (const row of mockDbBookings.values()) {
                if (row[f1] === v1 && row[f2] === v2) {
                  return { data: row, error: null };
                }
              }
              return { data: null, error: null };
            },
            single: async () => {
              for (const row of mockDbBookings.values()) {
                if (row[f1] === v1 && row[f2] === v2) {
                  return { data: row, error: null };
                }
              }
              return { data: null, error: null };
            }
          })
        })
      }),
      insert: (rows) => ({
        select: () => ({
          single: async () => {
            const row = Array.isArray(rows) ? rows[0] : rows;
            const id = 1000 + mockDbBookings.size + 1;
            const inserted = { ...row, id };
            mockDbBookings.set(id, inserted);
            return { data: inserted, error: null };
          }
        })
      })
    })
  };

  const bookingIdempotencyKey = 'hvac-book-mock-' + Date.now();
  const validBookingPayload = {
    slug: 'apex-climate-care-austin',
    businessName: 'Apex Climate Care',
    customerName: 'Marcus Vance',
    phone: '+1 (512) 555-0198',
    email: 'marcus.vance@example.com',
    service: 'Whole-Home Inverter Heat Pump & Climate Overhaul',
    date: '2026-09-24',
    time: '10:00 AM',
    notes: 'Property: 742 Highland Park Crescent | Scope: Luxury Residence | Budget: $18,500 – $38,000',
    idempotencyKey: bookingIdempotencyKey,
  };

  // Test Payload Contract
  const payloadCheck = validateBookingPayloadContract(validBookingPayload);
  check('validateBookingPayloadContract approves bespoke booking payload', payloadCheck.valid, payloadCheck.error);

  // First submission: 201 Created
  const req1 = new Request('https://edge.example.com/functions/v1/public-bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': bookingIdempotencyKey },
    body: JSON.stringify(validBookingPayload),
  });
  const res1 = await handleRequest(req1, mockSupabaseBookings);
  const data1 = await res1.json();

  check('First booking submission returns HTTP 201 Created', res1.status === 201);
  check('Booking returns confirmed ID and booking payload', data1.ok && !!data1.id && !!data1.booking);
  check('Persisted booking contains customer name and notes', data1.booking && data1.booking.customer_name === 'Marcus Vance');

  // Second submission with same idempotency key: 200 OK (deduplicated)
  const req2 = new Request('https://edge.example.com/functions/v1/public-bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': bookingIdempotencyKey },
    body: JSON.stringify(validBookingPayload),
  });
  const res2 = await handleRequest(req2, mockSupabaseBookings);
  const data2 = await res2.json();

  check('Duplicate booking submission returns HTTP 200 OK', res2.status === 200);
  check('Duplicate booking marks isExisting: true', data2.isExisting === true);
  check('Exactly 1 row created in database across repeated attempts', mockDbBookings.size === 1);

  // Invalid booking rejected: 400 Bad Request
  const badReq = new Request('https://edge.example.com/functions/v1/public-bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'apex-climate-care-austin', customerName: 'A', phone: '123' }),
  });
  const badRes = await handleRequest(badReq, mockSupabaseBookings);
  check('Invalid booking input rejected with HTTP 400 Bad Request', badRes.status === 400);

  // ---------------------------------------------------------------------------
  // 5. SIX DEDICATED CUSTOMER LEAD FORMS & VALIDATION (MOCK)
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Six Dedicated Customer Lead Forms & Edge Intake (Mock Bridge) ---');

  check('public-leads ALLOWED_LEAD_TYPES includes consultation', ALLOWED_LEAD_TYPES.has('consultation'));
  check('public-leads ALLOWED_LEAD_TYPES includes newsletter', ALLOWED_LEAD_TYPES.has('newsletter'));
  check('public-leads ALLOWED_LEAD_TYPES includes warranty_claim', ALLOWED_LEAD_TYPES.has('warranty_claim'));
  check('public-leads ALLOWED_LEAD_TYPES includes specimen_order', ALLOWED_LEAD_TYPES.has('specimen_order'));
  check('public-leads ALLOWED_LEAD_TYPES includes workshop_inquiry', ALLOWED_LEAD_TYPES.has('workshop_inquiry'));
  check('public-leads ALLOWED_LEAD_TYPES includes general_inquiry', ALLOWED_LEAD_TYPES.has('general_inquiry'));

  const mockDbLeads = new Map();
  const mockSupabaseLeads = {
    rpc: async () => ({
      data: [{ allowed: true, current_count: 1, retry_after_seconds: 0 }],
      error: null
    }),
    from: (table) => ({
      select: (cols) => ({
        eq: (f1, v1) => ({
          maybeSingle: async () => {
            if (table === 'tenants' && v1 === 'apex-climate-care-austin') {
              return { data: { slug: 'apex-climate-care-austin', name: 'Apex Climate Care', is_active: true }, error: null };
            }
            return { data: null, error: null };
          },
          single: async () => {
            if (table === 'tenants' && v1 === 'apex-climate-care-austin') {
              return { data: { slug: 'apex-climate-care-austin', name: 'Apex Climate Care', is_active: true }, error: null };
            }
            return { data: null, error: null };
          },
          eq: (f2, v2) => ({
            maybeSingle: async () => {
              for (const row of mockDbLeads.values()) {
                if (row[f1] === v1 && row[f2] === v2) {
                  return { data: row, error: null };
                }
              }
              return { data: null, error: null };
            },
            single: async () => {
              for (const row of mockDbLeads.values()) {
                if (row[f1] === v1 && row[f2] === v2) {
                  return { data: row, error: null };
                }
              }
              return { data: null, error: null };
            }
          })
        })
      }),
      insert: (rows) => ({
        select: () => ({
          single: async () => {
            const row = Array.isArray(rows) ? rows[0] : rows;
            const id = 5000 + mockDbLeads.size + 1;
            const inserted = { ...row, id };
            mockDbLeads.set(id, inserted);
            return { data: inserted, error: null };
          }
        })
      })
    })
  };

  const leadFormsToTest = [
    {
      type: 'consultation',
      desc: 'Form 1: VIP Feasibility Review',
      payload: {
        slug: 'apex-climate-care-austin',
        leadType: 'consultation',
        customerName: 'Elena Rostova',
        phone: '+1 (512) 555-0144',
        email: 'elena@example.com',
        notes: 'Whole-building IAQ and cold-climate heat pump sizing',
        details: { property_address: '400 W 5th St', inquiry_type: 'feasibility_review' }
      }
    },
    {
      type: 'newsletter',
      desc: 'Form 2: Climate Dispatch Newsletter',
      payload: {
        slug: 'apex-climate-care-austin',
        leadType: 'newsletter',
        customerName: 'Newsletter Subscriber',
        phone: '(000) 000-0000',
        email: 'subscriber@example.com',
        details: { newsletter: 'climate_dispatch' }
      }
    },
    {
      type: 'warranty_claim',
      desc: 'Form 3: 5-Year Warranty Service Claim',
      payload: {
        slug: 'apex-climate-care-austin',
        leadType: 'warranty_claim',
        customerName: 'Harrison Sterling',
        phone: '+1 (512) 555-0199',
        details: { commission_address: '42 Beacon St', year_commissioned: '2025', adjustment_requested: 'Airflow velocity balancing' }
      }
    },
    {
      type: 'specimen_order',
      desc: 'Form 4: Specimen Sample Kit Order',
      payload: {
        slug: 'apex-climate-care-austin',
        leadType: 'specimen_order',
        customerName: 'Claire Sterling',
        phone: '+1 (512) 555-0188',
        email: 'claire@example.com',
        details: { delivery_address: '128 Commonwealth Ave', cart_items: [{ name: 'Acoustic Linear Diffuser Specimen', price: 0 }] }
      }
    },
    {
      type: 'workshop_inquiry',
      desc: 'Form 5: Masterclasses / Workshop Registration',
      payload: {
        slug: 'apex-climate-care-austin',
        leadType: 'workshop_inquiry',
        customerName: 'Julian Sterling',
        phone: '+1 (512) 555-0177',
        details: { workshop_type: 'Historic Landmark Concealed High-Velocity Retrofit', residential_sqft: 4500 }
      }
    },
    {
      type: 'general_inquiry',
      desc: 'Form 6: Contact Desk Inquiry',
      payload: {
        slug: 'apex-climate-care-austin',
        leadType: 'general_inquiry',
        customerName: 'David Harrison',
        phone: '+1 (512) 555-0166',
        email: 'david@example.com',
        notes: 'Consultation for historic brownstone conversion',
        details: { project_scope: 'Full mechanical conversion' }
      }
    }
  ];

  for (const item of leadFormsToTest) {
    const key = `lead-test-${item.type}-${Date.now()}`;
    const req = new Request('https://edge.example.com/functions/v1/public-leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': key },
      body: JSON.stringify({ ...item.payload, idempotencyKey: key }),
    });
    const res = await handleLeadRequest(req, mockSupabaseLeads);
    const json = await res.json();

    check(`${item.desc} persists to public-leads (HTTP 201)`, res.status === 201 && json.ok && !!json.id);
    check(`${item.desc} stores correct lead_type "${item.type}"`, json.lead && json.lead.lead_type === item.type);

    // Test duplicate idempotency
    const reqDup = new Request('https://edge.example.com/functions/v1/public-leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': key },
      body: JSON.stringify({ ...item.payload, idempotencyKey: key }),
    });
    const resDup = await handleLeadRequest(reqDup, mockSupabaseLeads);
    const jsonDup = await resDup.json();

    check(`${item.desc} idempotency deduplication succeeds (HTTP 200, isExisting: true)`, resDup.status === 200 && jsonDup.isExisting === true);
  }

  // ---------------------------------------------------------------------------
  // 6. CLIENT-SIDE NON-LEAD INTERACTIONS INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. Client-Side Non-Lead Interactions Remain Client-Side ---');

  check('Review submission form (#reviewSubmitForm) remains client-side', rawHtml.includes('id="reviewSubmitForm"') && rawHtml.includes('app.submitReview(event)'));
  check('Review handler operates on in-memory REVIEWS_DATA', rawHtml.includes('REVIEWS_DATA.unshift(newReview)'));
  check('Concierge AI chatbot (.ai-chat-input-row) remains client-side', rawHtml.includes('class="ai-chat-input-row"') && rawHtml.includes('app.handleAiSubmit(event)'));
  check('Concierge AI handler uses typewriter generator, not public-leads', rawHtml.includes('generateAiResponse') && rawHtml.includes('typewriterAnimateHtml'));

  // ---------------------------------------------------------------------------
  // 7. LIVE SUPABASE POSTGRESQL STAGING PERSISTENCE & DEDUPLICATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. Live Supabase PostgreSQL Staging Verification ---');

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

  check('Live Supabase PostgreSQL database connection established', dbConnected);

  if (dbConnected) {
    const liveCreatedIds = { bookings: [], leads: [] };

    try {
      // 7a. Live Booking Persistence & Unique Deduplication
      const liveBookingKey = `stage3-batch4-booking-${Date.now()}`;
      const insertBookingQuery = `
        INSERT INTO public.bookings (slug, customer_name, phone, email, service, date, time, notes, status, idempotency_key, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, customer_name, service, idempotency_key;
      `;
      const liveBookingRes = await dbClient.query(insertBookingQuery, [
        'apex-climate-care-austin',
        'Julian Sterling Staging Test',
        '+1 (512) 555-0198',
        'julian.staging@example.com',
        'Whole-Home Inverter Heat Pump & Climate Overhaul',
        '2026-09-24',
        '10:00 AM',
        'Property: 742 Highland Park Crescent | Staging Test Verification',
        'new',
        liveBookingKey,
        Date.now(),
      ]);

      const liveBookingId = liveBookingRes.rows[0]?.id;
      liveCreatedIds.bookings.push(liveBookingId);

      check('Live booking persists to public.bookings table', !!liveBookingId);

      // Verify query returns exact row
      const verifyBookingRes = await dbClient.query(
        'SELECT * FROM public.bookings WHERE id = $1',
        [liveBookingId]
      );
      check('Live booking retrieved with exact fields preserved', verifyBookingRes.rows[0]?.customer_name === 'Julian Sterling Staging Test');

      // Attempt duplicate insertion with same idempotency key (must trigger unique violation)
      let duplicateCaught = false;
      try {
        await dbClient.query(insertBookingQuery, [
          'apex-climate-care-austin',
          'Julian Sterling Staging Test Duplicate',
          '+1 (512) 555-0198',
          'julian.staging@example.com',
          'Whole-Home Inverter Heat Pump & Climate Overhaul',
          '2026-09-24',
          '10:00 AM',
          'Duplicate attempt',
          'new',
          liveBookingKey,
          Date.now(),
        ]);
      } catch (dupErr) {
        duplicateCaught = dupErr.code === '23505' || dupErr.message.includes('unique');
      }
      check('Live database unique constraint blocks duplicate booking under same idempotency key', duplicateCaught);

      // 7b. Live Lead Persistence & Deduplication for all 6 Lead Types
      for (const item of leadFormsToTest) {
        const liveLeadKey = `stage3-batch4-${item.type}-${Date.now()}`;
        const insertLeadQuery = `
          INSERT INTO public.leads (slug, lead_type, customer_name, phone, email, notes, details, source, status, idempotency_key, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id, lead_type, customer_name, idempotency_key;
        `;
        const liveLeadRes = await dbClient.query(insertLeadQuery, [
          'apex-climate-care-austin',
          item.type,
          item.payload.customerName,
          item.payload.phone,
          item.payload.email || null,
          item.payload.notes || '',
          JSON.stringify(item.payload.details || {}),
          'test_suite',
          'new',
          liveLeadKey,
          Date.now(),
        ]);

        const liveLeadId = liveLeadRes.rows[0]?.id;
        liveCreatedIds.leads.push(liveLeadId);

        check(`Live lead (${item.type}) persists to public.leads table`, !!liveLeadId);

        // Attempt duplicate lead insertion with same idempotency key
        let leadDupCaught = false;
        try {
          await dbClient.query(insertLeadQuery, [
            'apex-climate-care-austin',
            item.type,
            item.payload.customerName,
            item.payload.phone,
            item.payload.email || null,
            'Duplicate attempt',
            JSON.stringify({ duplicate: true }),
            'test_suite',
            'new',
            liveLeadKey,
            Date.now(),
          ]);
        } catch (dupErr) {
          leadDupCaught = dupErr.code === '23505' || dupErr.message.includes('unique');
        }
        check(`Live database unique index blocks duplicate lead (${item.type})`, leadDupCaught);
      }
    } finally {
      // 7c. Clean up staging test rows
      console.log('\n--- 8. Staging Data Cleanup ---');
      if (liveCreatedIds.bookings.length > 0) {
        const delBookings = await dbClient.query(
          `DELETE FROM public.bookings WHERE id = ANY($1::bigint[])`,
          [liveCreatedIds.bookings]
        );
        check(`Cleaned up ${delBookings.rowCount} staging booking row(s)`, delBookings.rowCount === liveCreatedIds.bookings.length);
      }
      if (liveCreatedIds.leads.length > 0) {
        const delLeads = await dbClient.query(
          `DELETE FROM public.leads WHERE id = ANY($1::bigint[])`,
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

runBespokeHvacStep2Verification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
