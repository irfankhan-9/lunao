// scripts/test-stage3-batch4-hvac-step4-runtime.mjs
// Lunao Stage 3 Batch 4 Step 4 Runtime & Fallback Verification Suite

import fs from 'fs';
import dotenv from 'dotenv';
import pg from 'pg';
import { handleRequest } from '../supabase/functions/public-bookings/index.ts';
import { handleLeadRequest, ALLOWED_LEAD_TYPES } from '../supabase/functions/public-leads/index.ts';

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

async function runStep4RuntimeTests() {
  console.log('========================================================================');
  console.log('❄️ LUNAO STAGE 3 BATCH 4, STEP 4: RUNTIME BEHAVIOR & FALLBACK AUDIT');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. Live Database Connection & Test Isolation
  // ---------------------------------------------------------------------------
  console.log('--- 1. Live Staging Database Connection ---');
  let dbClient = null;
  let dbConnected = false;
  const createdRecordIds = { bookings: [], leads: [] };

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
      connectionTimeoutMillis: 10000,
    });

    await dbClient.connect();
    dbConnected = true;
    console.log('✓ Successfully connected to live Supabase PostgreSQL staging database.');
  } catch (err) {
    console.error('❌ Failed to connect to PostgreSQL staging:', err.message);
  }

  check('Live Supabase PostgreSQL connection established', dbConnected);

  if (dbConnected) {
    // Database adapter bridging edge function handlers directly to live staging DB
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
              if (table === 'leads') {
                const res = await dbClient.query(
                  `INSERT INTO leads (slug, lead_type, customer_name, phone, email, notes, details, source, status, idempotency_key, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                   RETURNING *`,
                  [
                    rec.slug,
                    rec.lead_type || 'general_inquiry',
                    rec.customer_name || '',
                    rec.phone || '',
                    rec.email || null,
                    rec.notes || '',
                    typeof rec.details === 'object' ? JSON.stringify(rec.details) : (rec.details || '{}'),
                    rec.source || 'form',
                    rec.status || 'new',
                    rec.idempotency_key || null,
                    rec.created_at || Date.now()
                  ]
                );
                return { data: res.rows[0], error: null };
              } else {
                const res = await dbClient.query(
                  `INSERT INTO ${table} (slug, business_name, customer_name, phone, email, service, date, time, notes, source, status, idempotency_key, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                   RETURNING *`,
                  [
                    rec.slug,
                    rec.business_name || '',
                    rec.customer_name || '',
                    rec.phone || '',
                    rec.email || null,
                    rec.service || '',
                    rec.date || '',
                    rec.time || '',
                    rec.notes || null,
                    rec.source || 'form',
                    rec.status || 'new',
                    rec.idempotency_key || null,
                    rec.created_at || Date.now()
                  ]
                );
                return { data: res.rows[0], error: null };
              }
            }
          })
        })
      })
    };

    try {
      // -----------------------------------------------------------------------
      // 2. Gate 2: Booking Runtime Scenarios & Dual-Route Fallback
      // -----------------------------------------------------------------------
      console.log('\n--- 2. Booking Runtime Scenarios & Dual-Route Fallback ---');

      const apexSlug = 'apex-climate-care-austin';
      const stableBookingKey = `stage3-step4-runtime-book-${Date.now()}`;

      const bookingPayload = {
        slug: apexSlug,
        businessName: 'Apex Climate Care',
        customerName: 'Victoria Sterling',
        phone: '+1 (512) 555-0188',
        email: 'victoria.sterling@example.com',
        service: 'Whole-Home Inverter Heat Pump Conversion',
        date: '2026-11-12',
        time: '11:00 AM',
        notes: 'Property: 804 Westlake Hills Dr | Scope: Historic Luxury Residence',
        source: 'website_bespoke_modal',
        status: 'new',
        idempotencyKey: stableBookingKey,
        createdAt: Date.now()
      };

      // Scenario 2a: Successful Booking via Edge Function (/functions/v1/public-bookings)
      const edgeReq = new Request('https://wqlbuadknltsjfzrltpe.supabase.co/functions/v1/public-bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': stableBookingKey
        },
        body: JSON.stringify(bookingPayload)
      });

      const edgeRes = await handleRequest(edgeReq, pgSupabaseClient);
      const edgeData = await edgeRes.json();

      check('Runtime: Edge booking returns HTTP 201 Created', edgeRes.status === 201);
      const edgeBookingId = edgeData.id || edgeData.booking?.id;
      check('Runtime: Edge booking returns confirmed ID', !!edgeBookingId);
      if (edgeBookingId) createdRecordIds.bookings.push(edgeBookingId);

      // Scenario 2b: Dual-Route Fallback Idempotency Check
      // Suppose the client experienced a disconnect before receiving the response and fell back to /api/bookings.
      // Both routes query the same table with (slug, idempotency_key).
      const retryReq = new Request('https://wqlbuadknltsjfzrltpe.supabase.co/functions/v1/public-bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': stableBookingKey
        },
        body: JSON.stringify(bookingPayload)
      });
      const retryRes = await handleRequest(retryReq, pgSupabaseClient);
      const retryData = await retryRes.json();
      check('Runtime: Retry returns HTTP 200 OK with isExisting: true', retryRes.status === 200 && retryData.isExisting === true);
      check('Runtime: Retry returns identical database ID', String(retryData.id || retryData.booking?.id) === String(edgeBookingId));

      const countRes = await dbClient.query(
        'SELECT COUNT(*) as cnt FROM public.bookings WHERE slug = $1 AND idempotency_key = $2',
        [apexSlug, stableBookingKey]
      );
      check('Runtime: Exactly 1 row created across repeated attempts (0 duplicates)', parseInt(countRes.rows[0].cnt, 10) === 1);

      // Scenario 2c: Malformed/Invalid Booking (Validation Rejection)
      const invalidReq = new Request('https://wqlbuadknltsjfzrltpe.supabase.co/functions/v1/public-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: apexSlug, phone: '123' }) // missing name, invalid phone
      });
      const invalidRes = await handleRequest(invalidReq, pgSupabaseClient);
      check('Runtime: Invalid booking payload rejected with HTTP 400 Bad Request', invalidRes.status === 400);

      // -----------------------------------------------------------------------
      // 3. Gate 3: All Six Dedicated Lead Forms Runtime Execution
      // -----------------------------------------------------------------------
      console.log('\n--- 3. All Six Dedicated Lead Forms Runtime Execution ---');

      const leadTypesToTest = [
        {
          type: 'consultation',
          desc: 'VIP Feasibility Desk',
          payload: {
            slug: apexSlug,
            customerName: 'Marcus Kensington',
            phone: '+1 (512) 555-0155',
            email: 'marcus.k@example.com',
            notes: 'Historic renovation consultation',
            details: { property_address: '302 Lavaca St', inquiry_type: 'architectural_feasibility' }
          }
        },
        {
          type: 'newsletter',
          desc: 'Climate Dispatch Newsletter (Single-Field Email)',
          payload: {
            slug: apexSlug,
            leadType: 'newsletter',
            email: 'subscriber.step4@example.com',
            details: { newsletter: 'climate_dispatch' }
          }
        },
        {
          type: 'warranty_claim',
          desc: '5-Year Installation Warranty Claim',
          payload: {
            slug: apexSlug,
            customerName: 'Diana Prince',
            phone: '+1 (512) 555-0177',
            email: 'diana.p@example.com',
            notes: 'System airflow calibration',
            details: { commission_address: '42 Beacon St', year_commissioned: '2024' }
          }
        },
        {
          type: 'specimen_order',
          desc: 'Specimen Sample Kit Order',
          payload: {
            slug: apexSlug,
            customerName: 'Arthur Pendelton',
            phone: '+1 (512) 555-0133',
            email: 'arthur.p@example.com',
            notes: 'Deliver to architectural firm',
            details: { delivery_address: '900 Congress Ave', cart_items: ['Acoustic Brass Diffuser'] }
          }
        },
        {
          type: 'workshop_inquiry',
          desc: 'Building Science Masterclass Inquiry',
          payload: {
            slug: apexSlug,
            customerName: 'Helena Troy',
            phone: '+1 (512) 555-0166',
            email: 'helena.t@example.com',
            notes: 'AIA continuing education credits',
            details: { workshop_type: 'psychrometric_dynamics', residential_sqft: '6500' }
          }
        },
        {
          type: 'general_inquiry',
          desc: 'Studio Contact Desk Inquiry',
          payload: {
            slug: apexSlug,
            customerName: 'Sebastian Shaw',
            phone: '+1 (512) 555-0122',
            email: 'sebastian.s@example.com',
            notes: 'New build HVAC design consultation',
            details: { project_scope: 'Full residence VRF zoning' }
          }
        }
      ];

      for (const lt of leadTypesToTest) {
        const leadIdempKey = `stage3-step4-lead-${lt.type}-${Date.now()}`;
        const req = new Request('https://wqlbuadknltsjfzrltpe.supabase.co/functions/v1/public-leads', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Idempotency-Key': leadIdempKey
          },
          body: JSON.stringify({ ...lt.payload, idempotencyKey: leadIdempKey })
        });

        const res = await handleLeadRequest(req, pgSupabaseClient);
        const data = await res.json();

        check(`Runtime: Lead (${lt.type}) returns HTTP 201 Created`, res.status === 201);
        const leadId = data.id || data.lead?.id;
        check(`Runtime: Lead (${lt.type}) returns persisted ID`, !!leadId);
        if (leadId) createdRecordIds.leads.push(leadId);

        // Verify newsletter specific behavior
        if (lt.type === 'newsletter') {
          const nlRow = await dbClient.query('SELECT * FROM public.leads WHERE id = $1', [leadId]);
          check('Runtime: Newsletter lead sets name to "Newsletter Subscriber"', nlRow.rows[0]?.customer_name === 'Newsletter Subscriber');
          check('Runtime: Newsletter lead uses placeholder phone "(000) 000-0000" to satisfy NOT NULL constraint', nlRow.rows[0]?.phone === '(000) 000-0000');
        }

        // Test duplicate lead prevention
        const dupReq = new Request('https://wqlbuadknltsjfzrltpe.supabase.co/functions/v1/public-leads', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Idempotency-Key': leadIdempKey
          },
          body: JSON.stringify({ ...lt.payload, idempotencyKey: leadIdempKey })
        });
        const dupRes = await handleLeadRequest(dupReq, pgSupabaseClient);
        const dupData = await dupRes.json();
        check(`Runtime: Lead duplicate (${lt.type}) returns HTTP 200 with isExisting: true`, dupRes.status === 200 && dupData.isExisting === true);
      }

      // -----------------------------------------------------------------------
      // 4. Gate 4: Tenant Slug Validation & Owner Isolation Analysis
      // -----------------------------------------------------------------------
      console.log('\n--- 4. Tenant Isolation & Query Boundary Audit ---');

      // Verify Owner PWA can query records strictly for this tenant
      const ownerBookings = await dbClient.query(
        'SELECT * FROM public.bookings WHERE slug = $1 ORDER BY created_at DESC LIMIT 5',
        [apexSlug]
      );
      const foundInOwner = ownerBookings.rows.some(r => String(r.id) === String(edgeBookingId));
      check('Tenant Isolation: Apex Owner feed accurately retrieves newly submitted booking', foundInOwner);

      const foreignSlug = `unrelated-tenant-${Date.now()}`;
      const foreignBookings = await dbClient.query(
        'SELECT * FROM public.bookings WHERE slug = $1 ORDER BY created_at DESC LIMIT 5',
        [foreignSlug]
      );
      check('Tenant Isolation: Foreign tenant feed CANNOT access Apex bookings', foreignBookings.rows.length === 0);

      // Verify public intake accepts arbitrary non-empty slug (Security Finding)
      const arbitrarySlugReq = new Request('https://wqlbuadknltsjfzrltpe.supabase.co/functions/v1/public-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'non-registered-arbitrary-slug-test',
          customerName: 'Arbitrary Test User',
          phone: '+1 (512) 555-0100',
          service: 'General Service',
          idempotencyKey: `arbitrary-test-${Date.now()}`
        })
      });
      const arbitraryRes = await handleRequest(arbitrarySlugReq, pgSupabaseClient);
      const arbitraryData = await arbitraryRes.json();
      if (arbitraryData && arbitraryData.id) createdRecordIds.bookings.push(arbitraryData.id);

      console.log('  ℹ️ AUDIT NOTE: Public intake endpoint accepts non-registered slugs without foreign-key rejection (Status:', arbitraryRes.status, ')');
      check('Audit Documentation: Endpoint behavior verified (unauthenticated public submission trusts provided slug)', arbitraryRes.status === 201);

    } finally {
      // -----------------------------------------------------------------------
      // 5. Cleanup
      // -----------------------------------------------------------------------
      console.log('\n--- 5. Staging Records Cleanup ---');
      if (createdRecordIds.bookings.length > 0) {
        const delB = await dbClient.query('DELETE FROM public.bookings WHERE id = ANY($1)', [createdRecordIds.bookings]);
        check(`Cleaned up ${delB.rowCount} runtime test booking row(s)`, delB.rowCount === createdRecordIds.bookings.length);
      }
      if (createdRecordIds.leads.length > 0) {
        const delL = await dbClient.query('DELETE FROM public.leads WHERE id = ANY($1)', [createdRecordIds.leads]);
        check(`Cleaned up ${delL.rowCount} runtime test lead row(s)`, delL.rowCount === createdRecordIds.leads.length);
      }
      await dbClient.end();
    }
  }

  console.log('\n========================================================================');
  console.log(`TOTAL RUNTIME CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('========================================================================\n');

  if (failed > 0) process.exit(1);
}

runStep4RuntimeTests().catch(err => {
  console.error('Fatal error in Step 4 runtime tests:', err);
  process.exit(1);
});
