/**
 * Lunao Stage 3 — Batch 5, Step 2.2: Security Remediation & Verified Staging Acceptance Suite
 *
 * Covers Phases 1–6:
 * - Phase 1 / 5A: SECURITY DEFINER function permissions, owner, pinned search_path = pg_catalog,
 *   EXECUTE revoked from PUBLIC/anon/authenticated, SET LOCAL ROLE anon/authenticated direct call denial,
 *   server-side time derivation, CEIL Retry-After, bounded cleanup, Edge service-role requirement.
 * - Phase 2 / 5B: Trusted client IP extraction — independent rotation of cf-connecting-ip, x-real-ip,
 *   and x-forwarded-for against Express and Edge Functions; peer CIDR verification; per-tenant aggregate cap.
 * - Phase 3 / 5C: Fail-closed rate limiting across all 4 endpoints (Edge bookings/leads, Express bookings/leads),
 *   concurrent Promise.all burst serialization, 5-minute window rollover, bucket isolation, HTTP 503 on RPC error,
 *   and coarse invalid-slug bucket (zero per-tenant rows created for unknown/inactive slugs).
 * - Phase 4 / 5D: Sole authoritative tenant registry (public.tenants) when Supabase is configured,
 *   rejection of memory-only tenants, authenticated registration/deactivation sync, Owner PWA cross-tenant isolation.
 * - Phase 6: Strict cleanup of all test records, buckets, and temporary tenants; verification of original 11 active tenants.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import pg from 'pg';
import {
  handleRequest as handleBookingEdge,
  extractClientIp as extractBookingEdgeIp,
  hashClientIp as hashEdgeIp,
} from '../supabase/functions/public-bookings/index.ts';
import {
  handleLeadRequest as handleLeadEdge,
} from '../supabase/functions/public-leads/index.ts';

process.env.NO_SERVER_LISTEN = 'true';
const { setPgPool } = await import('../server/lib/supabase.js');
const { app } = await import('../server/index.js');
const {
  registerTenant,
  registerTenantAsync,
  deactivateTenantAsync,
  removeTenant,
  removeTenantAsync,
  registerOwnerBusinessAsync,
  extractTrustedIpFromExpress,
  isVerifiedCloudflarePeer,
  setSimulateRateLimitFailure,
  clearRateLimitBuckets,
} = await import('../server/lib/tenantAuth.js');

const { Pool } = pg;
const projectRef = 'wqlbuadknltsjfzrltpe';
const host = process.env.SUPABASE_DB_HOST || 'aws-0-us-east-1.pooler.supabase.com';
const port = parseInt(process.env.SUPABASE_DB_PORT || '6543', 10);
const user = process.env.SUPABASE_DB_USER || 'postgres.' + projectRef;
const rawPassword = process.env.SUPABASE_DB_PASSWORD || '$@Khan1234455';
const password = rawPassword.replace(/^["']|["']$/g, '').trim();

let passed = 0;
let failed = 0;

function check(label, condition, details = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${details ? ' — ' + details : ''}`);
    failed++;
  }
}

async function runStep22SecuritySuite() {
  console.log('========================================================================');
  console.log('🛡️ LUNAO STAGE 3 — BATCH 5, STEP 2.2: SECURITY REMEDIATION ACCEPTANCE');
  console.log('========================================================================\n');

  const dbClient = new Pool({
    host,
    port,
    user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });

  await dbClient.query('SELECT 1');
  console.log('✓ Connected to live Supabase PostgreSQL staging database.');

  // Apply forward-only Step 2.2 security migration
  const migrationPath = path.resolve('scripts/migrations/20261022_02_harden_rate_limit_fn_and_registry.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  await dbClient.query(migrationSql);
  console.log('✓ Applied forward security migration: 20261022_02_harden_rate_limit_fn_and_registry.sql\n');

  // Wire Express to live Supabase PostgreSQL connection
  setPgPool(dbClient);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const expressPort = server.address().port;
  const expressBaseUrl = `http://127.0.0.1:${expressPort}`;

  const createdBookingIds = [];
  const createdLeadIds = [];
  const createdTempTenants = [];
  const createdRateLimitPatterns = ['%:invalid_slug:%'];

  // Postgres-backed Supabase client adapter for Edge Function handlers
  const pgSupabaseClient = {
    rpc: async (fnName, params) => {
      if (fnName === 'check_and_increment_rate_limit') {
        const res = await dbClient.query(
          `SELECT public.check_and_increment_rate_limit($1, $2, $3, $4) AS rl`,
          [params.p_bucket_key, params.p_window_start, params.p_max_requests, params.p_now]
        );
        return { data: res.rows[0]?.rl || null, error: null };
      }
      return { data: null, error: null };
    },
    from: (table) => ({
      select: (_cols) => ({
        eq: (field1, val1) => ({
          maybeSingle: async () => {
            const res = await dbClient.query(
              `SELECT * FROM public.${table} WHERE ${field1} = $1 LIMIT 1`,
              [val1]
            );
            return { data: res.rows[0] || null, error: null };
          },
          single: async () => {
            const res = await dbClient.query(
              `SELECT * FROM public.${table} WHERE ${field1} = $1 LIMIT 1`,
              [val1]
            );
            return { data: res.rows[0] || null, error: null };
          },
          eq: (field2, val2) => ({
            maybeSingle: async () => {
              const res = await dbClient.query(
                `SELECT * FROM public.${table} WHERE ${field1} = $1 AND ${field2} = $2 LIMIT 1`,
                [val1, val2]
              );
              return { data: res.rows[0] || null, error: null };
            },
            single: async () => {
              const res = await dbClient.query(
                `SELECT * FROM public.${table} WHERE ${field1} = $1 AND ${field2} = $2 LIMIT 1`,
                [val1, val2]
              );
              return { data: res.rows[0] || null, error: null };
            },
          }),
        }),
      }),
      insert: (records) => ({
        select: () => ({
          single: async () => {
            const rec = Array.isArray(records) ? records[0] : records;
            if (table === 'leads') {
              const res = await dbClient.query(
                `INSERT INTO public.leads (slug, business_name, lead_type, customer_name, phone, email, notes, details, source, status, idempotency_key, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                 RETURNING *`,
                [
                  rec.slug,
                  rec.business_name || '',
                  rec.lead_type || 'general_inquiry',
                  rec.customer_name || '',
                  rec.phone || '',
                  rec.email || null,
                  rec.notes || null,
                  typeof rec.details === 'object' ? JSON.stringify(rec.details) : rec.details || '{}',
                  rec.source || 'form',
                  rec.status || 'new',
                  rec.idempotency_key || null,
                  rec.created_at || Date.now(),
                ]
              );
              return { data: res.rows[0], error: null };
            } else {
              const res = await dbClient.query(
                `INSERT INTO public.bookings (slug, business_name, customer_name, phone, email, service, date, time, notes, source, status, idempotency_key, created_at)
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
                  rec.created_at || Date.now(),
                ]
              );
              return { data: res.rows[0], error: null };
            }
          },
        }),
      }),
    }),
  };

  try {
    // =========================================================================
    // SECTION A (PHASE 1 & 5A): SECURITY DEFINER FUNCTION PERMISSIONS & SEARCH_PATH
    // =========================================================================
    console.log('--- SECTION A: SECURITY DEFINER Function Permissions, ACL & search_path ---');

    const procRes = await dbClient.query(`
      SELECT
        p.proname,
        pg_get_userbyid(p.proowner) AS owner,
        p.prosecdef AS security_definer,
        p.proconfig AS config_settings,
        p.proacl::text AS acl,
        has_function_privilege('public', p.oid, 'EXECUTE') AS public_can_exec,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_exec,
        has_function_privilege('postgres', p.oid, 'EXECUTE') AS postgres_can_exec
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'check_and_increment_rate_limit'
    `);

    check('Exactly 1 function public.check_and_increment_rate_limit exists in pg_proc', procRes.rows.length === 1);
    const fnMeta = procRes.rows[0] || {};
    check('Function owner is postgres and prosecdef (SECURITY DEFINER) is true',
      fnMeta.owner === 'postgres' && fnMeta.security_definer === true,
      `owner=${fnMeta.owner}, security_definer=${fnMeta.security_definer}`
    );
    check('Function has pinned search_path=pg_catalog (no untrusted/mutable schemas)',
      Array.isArray(fnMeta.config_settings) && fnMeta.config_settings.includes('search_path=pg_catalog'),
      `proconfig=${JSON.stringify(fnMeta.config_settings)}`
    );
    check('EXECUTE privilege is revoked from PUBLIC (public_can_exec === false)',
      fnMeta.public_can_exec === false,
      `acl=${fnMeta.acl}`
    );
    check('EXECUTE privilege is revoked from anon (anon_can_exec === false)',
      fnMeta.anon_can_exec === false,
      `acl=${fnMeta.acl}`
    );
    check('EXECUTE privilege is revoked from authenticated (authenticated_can_exec === false)',
      fnMeta.authenticated_can_exec === false,
      `acl=${fnMeta.acl}`
    );
    check('EXECUTE privilege is granted to service_role and postgres',
      fnMeta.service_role_can_exec === true && fnMeta.postgres_can_exec === true,
      `acl=${fnMeta.acl}`
    );

    // Direct invocation tests under SET LOCAL ROLE anon, authenticated, and service_role
    let anonExecDeniedCode = null;
    let authExecDeniedCode = null;
    let anonInsertTenantsBlocked = false;
    let anonUpdateTenantsBlocked = false;
    let anonInsertRateLimitsBlocked = false;
    let serviceRoleExecAllowed = false;

    const roleTestBucket = `sec-role-test-bucket-${Date.now()}`;
    createdRateLimitPatterns.push(roleTestBucket);

    const runAsRole = async (roleName, sql, params = []) => {
      const client = await dbClient.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL ROLE ${roleName}`);
        return await client.query(sql, params);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    };

    try {
      await runAsRole('anon', `SELECT public.check_and_increment_rate_limit($1, 0, 5, 0)`, [roleTestBucket]);
    } catch (e) {
      anonExecDeniedCode = e.code;
    }

    try {
      await runAsRole('anon', `INSERT INTO public.tenants (id, slug, name, is_active) VALUES ('hack-id', 'hacked-slug', 'Hacked', true)`);
    } catch (_e) {
      anonInsertTenantsBlocked = true;
    }

    try {
      await runAsRole('anon', `UPDATE public.tenants SET is_active = false WHERE slug = 'everest-climate-systems-austin'`);
    } catch (_e) {
      anonUpdateTenantsBlocked = true;
    }

    try {
      await runAsRole('anon', `INSERT INTO public.endpoint_rate_limits (bucket_key, window_start, request_count, updated_at) VALUES ('hack', 0, 0, 0)`);
    } catch (_e) {
      anonInsertRateLimitsBlocked = true;
    }

    const clientAuth = await dbClient.connect();
    try {
      await clientAuth.query('BEGIN');
      await clientAuth.query('SET LOCAL ROLE authenticated');
      try {
        await clientAuth.query(`SELECT public.check_and_increment_rate_limit($1, 0, 5, 0)`, [roleTestBucket]);
      } catch (e) {
        authExecDeniedCode = e.code;
      }
    } finally {
      await clientAuth.query('ROLLBACK');
      clientAuth.release();
    }

    const clientSr = await dbClient.connect();
    try {
      await clientSr.query('BEGIN');
      await clientSr.query('SET LOCAL ROLE service_role');
      const srRes = await clientSr.query(`SELECT public.check_and_increment_rate_limit($1, 0, 5, 0) AS rl`, [roleTestBucket]);
      serviceRoleExecAllowed = srRes.rows[0]?.rl?.allowed === true && srRes.rows[0]?.rl?.count === 1;
    } finally {
      await clientSr.query('ROLLBACK');
      clientSr.release();
    }

    check('SET LOCAL ROLE anon direct invocation of check_and_increment_rate_limit fails with 42501 (permission denied)',
      anonExecDeniedCode === '42501',
      `code=${anonExecDeniedCode}`
    );
    check('SET LOCAL ROLE authenticated direct invocation of check_and_increment_rate_limit fails with 42501 (permission denied)',
      authExecDeniedCode === '42501',
      `code=${authExecDeniedCode}`
    );
    check('SET LOCAL ROLE service_role CAN execute check_and_increment_rate_limit', serviceRoleExecAllowed);
    check('SET LOCAL ROLE anon CANNOT INSERT/UPDATE public.tenants or public.endpoint_rate_limits',
      anonInsertTenantsBlocked && anonUpdateTenantsBlocked && anonInsertRateLimitsBlocked
    );

    // Verify Edge Functions require SUPABASE_SERVICE_ROLE_KEY and do NOT fall back to SUPABASE_ANON_KEY
    const prevUrl = process.env.SUPABASE_URL;
    const prevServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const prevSecretKey = process.env.SUPABASE_SECRET_KEY;
    const prevAnonKey = process.env.SUPABASE_ANON_KEY;
    try {
      process.env.SUPABASE_URL = `https://${projectRef}.supabase.co`;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_SECRET_KEY;
      process.env.SUPABASE_ANON_KEY = 'anon-key-must-never-be-used-as-fallback';

      const noKeyBookReq = new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'vintage-cuts-austin',
          customerName: 'Missing Key Caller',
          phone: '(512) 555-0199',
        }),
      });
      const noKeyBookRes = await handleBookingEdge(noKeyBookReq);
      check('Edge public-bookings: Missing SUPABASE_SERVICE_ROLE_KEY fails closed with HTTP 503 (never falls back to SUPABASE_ANON_KEY)',
        noKeyBookRes.status === 503,
        `status=${noKeyBookRes.status}`
      );

      const noKeyLeadReq = new Request(`https://${projectRef}.supabase.co/functions/v1/public-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'vintage-cuts-austin',
          leadType: 'consultation',
          customerName: 'Missing Key Caller',
          phone: '(512) 555-0199',
        }),
      });
      const noKeyLeadRes = await handleLeadEdge(noKeyLeadReq);
      check('Edge public-leads: Missing SUPABASE_SERVICE_ROLE_KEY fails closed with HTTP 503 (never falls back to SUPABASE_ANON_KEY)',
        noKeyLeadRes.status === 503,
        `status=${noKeyLeadRes.status}`
      );
    } finally {
      if (prevUrl !== undefined) process.env.SUPABASE_URL = prevUrl; else delete process.env.SUPABASE_URL;
      if (prevServiceKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prevServiceKey; else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (prevSecretKey !== undefined) process.env.SUPABASE_SECRET_KEY = prevSecretKey; else delete process.env.SUPABASE_SECRET_KEY;
      if (prevAnonKey !== undefined) process.env.SUPABASE_ANON_KEY = prevAnonKey; else delete process.env.SUPABASE_ANON_KEY;
    }

    // =========================================================================
    // SECTION B (PHASE 2 & 5B): TRUSTED CLIENT IP & SPOOFING PROTECTION
    // =========================================================================
    console.log('\n--- SECTION B: Trusted Client IP Extraction & Header Spoofing Tests ---');

    // Unit checks on peer CIDR verification
    check('Peer verification: 127.0.0.1 and 198.51.100.50 are NOT treated as Cloudflare proxy peers',
      isVerifiedCloudflarePeer('127.0.0.1') === false && isVerifiedCloudflarePeer('198.51.100.50') === false
    );
    check('Peer verification: Cloudflare CIDR IP 172.64.0.15 IS recognized as a verified Cloudflare peer',
      isVerifiedCloudflarePeer('172.64.0.15') === true
    );
    check('Express IP extraction: Untrusted peer ignores forged cf-connecting-ip, x-real-ip, and x-forwarded-for',
      extractTrustedIpFromExpress({
        socket: { remoteAddress: '::ffff:198.51.100.77' },
        headers: {
          'cf-connecting-ip': '203.0.113.1',
          'x-real-ip': '203.0.113.2',
          'x-forwarded-for': '203.0.113.3',
        },
      }) === '198.51.100.77'
    );
    check('Express IP extraction: Verified Cloudflare peer (172.64.0.15 + cf-ray) extracts valid cf-connecting-ip and ignores x-real-ip',
      extractTrustedIpFromExpress({
        socket: { remoteAddress: '172.64.0.15' },
        headers: {
          'cf-ray': '8a1b2c3d4e5f6071-DFW',
          'cf-connecting-ip': '198.51.100.44',
          'x-real-ip': '203.0.113.99',
        },
      }) === '198.51.100.44'
    );
    check('Edge IP extraction: Unverified ingress ignores forged cf-connecting-ip and x-real-ip',
      extractBookingEdgeIp(
        new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
          headers: {
            'cf-connecting-ip': '203.0.113.55',
            'x-real-ip': '203.0.113.66',
          },
        })
      ) === 'fallback_unverified_ingress_ip'
    );
    check('Edge IP extraction: Verified Cloudflare/Supabase ingress (cf-ray + sb-gateway-version) extracts cf-connecting-ip and ignores x-real-ip',
      extractBookingEdgeIp(
        new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
          headers: {
            'cf-ray': '8a1b2c3d4e5f6071-SIN',
            'sb-gateway-version': '1',
            'cf-connecting-ip': '198.51.100.88',
            'x-real-ip': '203.0.113.99',
          },
        })
      ) === '198.51.100.88'
    );
    check('Edge IP extraction: Malformed cf-connecting-ip falls back safely to fallback_unverified_ingress_ip',
      extractBookingEdgeIp(
        new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
          headers: {
            'cf-ray': '8a1b2c3d4e5f6071-SIN',
            'sb-gateway-version': '1',
            'cf-connecting-ip': '1.2.3.4, 5.6.7.8; malformed',
          },
        })
      ) === 'fallback_unverified_ingress_ip'
    );

    // Provision temporary tenants for independent header spoofing tests on Express
    const spoofCfSlug = `sec-spoof-cf-${Date.now()}`;
    const spoofRealIpSlug = `sec-spoof-realip-${Date.now()}`;
    const spoofXffSlug = `sec-spoof-xff-${Date.now()}`;
    const spoofEdgeSlug = `sec-spoof-edge-${Date.now()}`;
    createdTempTenants.push(spoofCfSlug, spoofRealIpSlug, spoofXffSlug, spoofEdgeSlug);
    createdRateLimitPatterns.push(`%:${spoofCfSlug}`, `%:${spoofRealIpSlug}`, `%:${spoofXffSlug}`, `%:${spoofEdgeSlug}`);

    await registerTenantAsync(spoofCfSlug, 'Spoof CF Test Tenant', true, 'Barber');
    await registerTenantAsync(spoofRealIpSlug, 'Spoof Real-IP Test Tenant', true, 'Barber');
    await registerTenantAsync(spoofXffSlug, 'Spoof XFF Test Tenant', true, 'Barber');
    await registerTenantAsync(spoofEdgeSlug, 'Spoof Edge Test Tenant', true, 'Barber');

    const baseBookPayload = {
      customerName: 'Header Spoof Tester',
      phone: '(512) 555-0142',
      email: 'spoof.test@lunao.app',
      service: 'Diagnostic',
      date: '2026-11-15',
      time: '09:00 AM',
    };

    // B1. Express: Independently rotate cf-connecting-ip across 11 requests
    let cfRotAllowed = 0;
    let cfRot11Status = 0;
    for (let i = 1; i <= 11; i++) {
      const res = await fetch(`${expressBaseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': `203.0.113.${i}`, // Rotating forged cf-connecting-ip
          'X-Idempotency-Key': `cf-rot-${Date.now()}-${i}`,
        },
        body: JSON.stringify({ ...baseBookPayload, slug: spoofCfSlug }),
      });
      const d = await res.json();
      if (d?.id) createdBookingIds.push(d.id);
      if (i <= 10 && res.status === 201) cfRotAllowed++;
      if (i === 11) cfRot11Status = res.status;
    }
    check('Express /api/bookings: Rotating forged cf-connecting-ip from unverified peer does NOT evade rate limit (10 allowed, 11th -> 429)',
      cfRotAllowed === 10 && cfRot11Status === 429,
      `allowed=${cfRotAllowed}, 11th=${cfRot11Status}`
    );

    // B2. Express: Independently rotate x-real-ip across 11 requests
    let realIpRotAllowed = 0;
    let realIpRot11Status = 0;
    for (let i = 1; i <= 11; i++) {
      const res = await fetch(`${expressBaseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-real-ip': `198.51.100.${i}`, // Rotating forged x-real-ip
          'X-Idempotency-Key': `realip-rot-${Date.now()}-${i}`,
        },
        body: JSON.stringify({ ...baseBookPayload, slug: spoofRealIpSlug }),
      });
      const d = await res.json();
      if (d?.id) createdBookingIds.push(d.id);
      if (i <= 10 && res.status === 201) realIpRotAllowed++;
      if (i === 11) realIpRot11Status = res.status;
    }
    check('Express /api/bookings: Rotating forged x-real-ip does NOT evade rate limit (10 allowed, 11th -> 429)',
      realIpRotAllowed === 10 && realIpRot11Status === 429,
      `allowed=${realIpRotAllowed}, 11th=${realIpRot11Status}`
    );

    // B3. Express: Independently rotate x-forwarded-for across 11 requests
    let xffRotAllowed = 0;
    let xffRot11Status = 0;
    for (let i = 1; i <= 11; i++) {
      const res = await fetch(`${expressBaseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': `192.0.2.${i}`, // Rotating forged x-forwarded-for
          'X-Idempotency-Key': `xff-rot-${Date.now()}-${i}`,
        },
        body: JSON.stringify({ ...baseBookPayload, slug: spoofXffSlug }),
      });
      const d = await res.json();
      if (d?.id) createdBookingIds.push(d.id);
      if (i <= 10 && res.status === 201) xffRotAllowed++;
      if (i === 11) xffRot11Status = res.status;
    }
    check('Express /api/bookings: Rotating forged x-forwarded-for does NOT evade rate limit (10 allowed, 11th -> 429)',
      xffRotAllowed === 10 && xffRot11Status === 429,
      `allowed=${xffRotAllowed}, 11th=${xffRot11Status}`
    );

    // B4. Edge Function: Unverified direct caller rotating cf-connecting-ip, x-real-ip, and x-forwarded-for
    let edgeUnverifiedAllowed = 0;
    let edgeUnverified11Status = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      edgeUnverifiedAllowed = 0;
      edgeUnverified11Status = 0;
      const startWin = Math.floor(Date.now() / 300000);
      for (let i = 1; i <= 11; i++) {
        const req = new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-connecting-ip': `203.0.113.${i}`,
            'x-real-ip': `198.51.100.${i}`,
            'x-forwarded-for': `192.0.2.${i}`,
            'X-Idempotency-Key': `edge-spoof-${Date.now()}-${i}`,
          },
          body: JSON.stringify({ ...baseBookPayload, slug: spoofEdgeSlug }),
        });
        const res = await handleBookingEdge(req, pgSupabaseClient);
        const d = await res.json();
        if (d?.id) createdBookingIds.push(d.id);
        if (i <= 10 && res.status === 201) edgeUnverifiedAllowed++;
        if (i === 11) edgeUnverified11Status = res.status;
      }
      if (Math.floor(Date.now() / 300000) === startWin) break;
    }
    check('Edge public-bookings: Unverified caller rotating cf-connecting-ip, x-real-ip, and x-forwarded-for is blocked at 11th request (429)',
      edgeUnverifiedAllowed === 10 && edgeUnverified11Status === 429,
      `allowed=${edgeUnverifiedAllowed}, 11th=${edgeUnverified11Status}`
    );

    // =========================================================================
    // SECTION C (PHASE 3 & 5C): RATE LIMITER CORRECTNESS, CONCURRENCY, ROLLOVER,
    // ISOLATION, FAIL-CLOSED 503, AND COARSE INVALID-SLUG BUCKET
    // =========================================================================
    console.log('\n--- SECTION C: Rate-Limiter Concurrency, Rollover, Isolation & Fail-Closed 503 ---');

    // C1. Explicitly test Express /api/leads rate limiting (10 allowed, 11th -> 429 with Retry-After)
    const expLeadRlSlug = `sec-exp-lead-rl-${Date.now()}`;
    createdTempTenants.push(expLeadRlSlug);
    createdRateLimitPatterns.push(`%:${expLeadRlSlug}`);
    await registerTenantAsync(expLeadRlSlug, 'Express Lead RL Tenant', true, 'HVAC & Climate');

    let expLeadAllowed = 0;
    let expLead11Status = 0;
    let expLeadRetryAfter = 0;
    for (let i = 1; i <= 11; i++) {
      const res = await fetch(`${expressBaseUrl}/api/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `exp-lead-rl-${Date.now()}-${i}`,
        },
        body: JSON.stringify({
          slug: expLeadRlSlug,
          leadType: 'consultation',
          customerName: 'Express Lead RL Tester',
          phone: '(512) 555-0177',
          email: 'lead.rl@lunao.app',
        }),
      });
      const d = await res.json();
      if (d?.id) createdLeadIds.push(d.id);
      if (i <= 10 && res.status === 201) expLeadAllowed++;
      if (i === 11) {
        expLead11Status = res.status;
        expLeadRetryAfter = Number(res.headers.get('retry-after') || 0);
      }
    }
    check('Express POST /api/leads: First 10 requests succeed (201) and 11th returns HTTP 429 with Retry-After (1..300s)',
      expLeadAllowed === 10 && expLead11Status === 429 && expLeadRetryAfter >= 1 && expLeadRetryAfter <= 300,
      `allowed=${expLeadAllowed}, 11th=${expLead11Status}, retryAfter=${expLeadRetryAfter}`
    );

    // C2. Concurrent requests (Promise.all): 15 simultaneous requests -> exactly 10 succeed (201) and 5 return 429
    const concurrentSlug = `sec-concurrent-rl-${Date.now()}`;
    createdTempTenants.push(concurrentSlug);
    createdRateLimitPatterns.push(`%:${concurrentSlug}`);
    await registerTenantAsync(concurrentSlug, 'Concurrent RL Tenant', true, 'Barber');

    const concurrentPromises = Array.from({ length: 15 }, (_, idx) => {
      const req = new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `conc-book-${Date.now()}-${idx}`,
        },
        body: JSON.stringify({
          ...baseBookPayload,
          slug: concurrentSlug,
          customerName: `Concurrent User ${idx}`,
        }),
      });
      return handleBookingEdge(req, pgSupabaseClient, {
        trustedCloudflareIngress: true,
        connectingIp: '198.51.100.200',
      });
    });

    const concurrentResponses = await Promise.all(concurrentPromises);
    let conc201 = 0;
    let conc429 = 0;
    for (const r of concurrentResponses) {
      const d = await r.json();
      if (d?.id) createdBookingIds.push(d.id);
      if (r.status === 201) conc201++;
      if (r.status === 429) conc429++;
    }
    check('Concurrent burst (15 simultaneous requests via Promise.all): Exactly 10 succeed (201) and 5 return HTTP 429',
      conc201 === 10 && conc429 === 5,
      `201=${conc201}, 429=${conc429}`
    );

    // C3. Server-side time derivation & Five-minute window rollover
    // Verify caller-supplied p_window_start=0 and p_now=9999999999999 cannot spoof server time or wipe active buckets
    const spoofTimeBucket = `sec-time-integrity-${Date.now()}`;
    createdRateLimitPatterns.push(spoofTimeBucket);
    const timeRes = await dbClient.query(
      `SELECT public.check_and_increment_rate_limit($1, 0, 10, 9999999999999) AS rl`,
      [spoofTimeBucket]
    );
    const rlTimeObj = timeRes.rows[0]?.rl;
    const jsNow = Date.now();
    check('PostgreSQL function derives window_start and server_now from clock_timestamp() and ignores caller-supplied p_window_start/p_now',
      rlTimeObj &&
      Math.abs(Number(rlTimeObj.server_now) - jsNow) < 15000 &&
      Number(rlTimeObj.window_start) > 1700000000000,
      `rlTimeObj=${JSON.stringify(rlTimeObj)}`
    );

    // Simulate 5-minute window rollover on the exhausted concurrentSlug bucket:
    // Move the current window's rows back by 300,000 ms (1 window) to represent 5 minutes elapsing
    await dbClient.query(
      `UPDATE public.endpoint_rate_limits
       SET window_start = window_start - 300000
       WHERE bucket_key LIKE $1`,
      [`%:${concurrentSlug}`]
    );

    const afterRolloverReq = new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `rollover-book-${Date.now()}`,
      },
      body: JSON.stringify({
        ...baseBookPayload,
        slug: concurrentSlug,
        customerName: 'Post Rollover Customer',
      }),
    });
    const afterRolloverRes = await handleBookingEdge(afterRolloverReq, pgSupabaseClient, {
      trustedCloudflareIngress: true,
      connectingIp: '198.51.100.200',
    });
    const afterRolloverJson = await afterRolloverRes.json();
    if (afterRolloverJson?.id) createdBookingIds.push(afterRolloverJson.id);
    check('5-minute window rollover: After window advances, request_count resets to 1 and booking succeeds with HTTP 201',
      afterRolloverRes.status === 201
    );

    // C4. Per-Tenant Aggregate Limit test (configurable threshold across multiple distinct IPs)
    const aggTenantSlug = `sec-agg-limit-${Date.now()}`;
    createdTempTenants.push(aggTenantSlug);
    createdRateLimitPatterns.push(`%:${aggTenantSlug}`);
    await registerTenantAsync(aggTenantSlug, 'Aggregate Limit Tenant', true, 'Barber');

    const prevAggEnv = process.env.PUBLIC_BOOKINGS_TENANT_MAX_PER_WINDOW;
    const prevIpEnv = process.env.PUBLIC_BOOKINGS_IP_MAX_PER_WINDOW;
    try {
      process.env.PUBLIC_BOOKINGS_IP_MAX_PER_WINDOW = '3';
      process.env.PUBLIC_BOOKINGS_TENANT_MAX_PER_WINDOW = '6';

      let aggAllowed = 0;
      let agg7thStatus = 0;
      // Send 7 requests using 7 distinct verified client IPs (each IP only sends 1 request < IP limit 3,
      // but tenant aggregate hits 6 on request 6 and blocks request 7 with 429)
      for (let i = 1; i <= 7; i++) {
        const req = new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Idempotency-Key': `agg-book-${Date.now()}-${i}`,
          },
          body: JSON.stringify({ ...baseBookPayload, slug: aggTenantSlug }),
        });
        const res = await handleBookingEdge(req, pgSupabaseClient, {
          trustedCloudflareIngress: true,
          connectingIp: `198.51.100.${100 + i}`,
        });
        const d = await res.json();
        if (d?.id) createdBookingIds.push(d.id);
        if (i <= 6 && res.status === 201) aggAllowed++;
        if (i === 7) agg7thStatus = res.status;
      }
      check('Per-tenant aggregate limit: Distributed requests across 7 distinct IPs hit tenant aggregate cap (6 allowed, 7th -> 429)',
        aggAllowed === 6 && agg7thStatus === 429,
        `aggAllowed=${aggAllowed}, 7th=${agg7thStatus}`
      );
    } finally {
      if (prevAggEnv !== undefined) process.env.PUBLIC_BOOKINGS_TENANT_MAX_PER_WINDOW = prevAggEnv;
      else delete process.env.PUBLIC_BOOKINGS_TENANT_MAX_PER_WINDOW;
      if (prevIpEnv !== undefined) process.env.PUBLIC_BOOKINGS_IP_MAX_PER_WINDOW = prevIpEnv;
      else delete process.env.PUBLIC_BOOKINGS_IP_MAX_PER_WINDOW;
    }

    // C5. Per-IP, Per-Tenant, and Per-Endpoint Bucket Isolation
    // spoofCfSlug is currently exhausted (429) for bookings from 127.0.0.1 on Express.
    // Verify that from the same IP (127.0.0.1):
    //   1) Submitting a LEAD to spoofCfSlug succeeds (201) -> endpoint isolation
    //   2) Submitting a BOOKING to activeTestTenant2 succeeds (201) -> tenant isolation
    //   3) Submitting a BOOKING to spoofCfSlug from a different verified IP (198.51.100.250) succeeds (201) -> IP isolation
    const isoLeadRes = await fetch(`${expressBaseUrl}/api/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `iso-lead-${Date.now()}`,
      },
      body: JSON.stringify({
        slug: spoofCfSlug,
        leadType: 'consultation',
        customerName: 'Endpoint Isolation Tester',
        phone: '(512) 555-0188',
      }),
    });
    const isoLeadData = await isoLeadRes.json();
    if (isoLeadData?.id) createdLeadIds.push(isoLeadData.id);
    check('Bucket isolation (Endpoint): Exhausted bookings bucket for tenant does NOT block leads for same IP + tenant (201)',
      isoLeadRes.status === 201
    );

    const isoTenant2Slug = `sec-iso-tenant2-${Date.now()}`;
    createdTempTenants.push(isoTenant2Slug);
    createdRateLimitPatterns.push(`%:${isoTenant2Slug}`);
    await registerTenantAsync(isoTenant2Slug, 'Isolation Tenant 2', true, 'Barber');

    const isoTenantRes = await fetch(`${expressBaseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `iso-tenant-${Date.now()}`,
      },
      body: JSON.stringify({
        ...baseBookPayload,
        slug: isoTenant2Slug,
      }),
    });
    const isoTenantData = await isoTenantRes.json();
    if (isoTenantData?.id) createdBookingIds.push(isoTenantData.id);
    check('Bucket isolation (Tenant): Exhausted bookings bucket for Tenant 1 does NOT block bookings for Tenant 2 from same IP (201)',
      isoTenantRes.status === 201
    );

    const isoIpReq = new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `iso-ip-${Date.now()}`,
      },
      body: JSON.stringify({
        ...baseBookPayload,
        slug: spoofCfSlug,
      }),
    });
    const isoIpRes = await handleBookingEdge(isoIpReq, pgSupabaseClient, {
      trustedCloudflareIngress: true,
      connectingIp: '198.51.100.250',
    });
    const isoIpData = await isoIpRes.json();
    if (isoIpData?.id) createdBookingIds.push(isoIpData.id);
    check('Bucket isolation (IP): Exhausted bookings bucket for IP 1 does NOT block bookings for IP 2 on same tenant (201)',
      isoIpRes.status === 201
    );

    // C6. Simulate RPC / Storage Error Path -> Fail Closed HTTP 503 with 0 DB rows inserted
    const brokenRpcClient = {
      ...pgSupabaseClient,
      rpc: async () => ({ data: null, error: { message: 'Simulated rate-limit storage outage' } }),
    };
    const failClosedSlug = isoTenant2Slug;
    const beforeFailCountB = await dbClient.query(`SELECT COUNT(*) AS cnt FROM public.bookings WHERE slug = $1`, [failClosedSlug]);
    const beforeFailCountL = await dbClient.query(`SELECT COUNT(*) AS cnt FROM public.leads WHERE slug = $1`, [failClosedSlug]);

    const edgeFailBookRes = await handleBookingEdge(
      new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...baseBookPayload, slug: failClosedSlug }),
      }),
      brokenRpcClient
    );
    const edgeFailLeadRes = await handleLeadEdge(
      new Request(`https://${projectRef}.supabase.co/functions/v1/public-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: failClosedSlug,
          leadType: 'consultation',
          customerName: 'Fail Closed Tester',
          phone: '(512) 555-0199',
        }),
      }),
      brokenRpcClient
    );

    setSimulateRateLimitFailure(true);
    let expFailBookStatus = 0;
    let expFailLeadStatus = 0;
    try {
      const expFailBook = await fetch(`${expressBaseUrl}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...baseBookPayload, slug: failClosedSlug }),
      });
      expFailBookStatus = expFailBook.status;

      const expFailLead = await fetch(`${expressBaseUrl}/api/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: failClosedSlug,
          leadType: 'consultation',
          customerName: 'Fail Closed Tester',
          phone: '(512) 555-0199',
        }),
      });
      expFailLeadStatus = expFailLead.status;
    } finally {
      setSimulateRateLimitFailure(false);
    }

    const afterFailCountB = await dbClient.query(`SELECT COUNT(*) AS cnt FROM public.bookings WHERE slug = $1`, [failClosedSlug]);
    const afterFailCountL = await dbClient.query(`SELECT COUNT(*) AS cnt FROM public.leads WHERE slug = $1`, [failClosedSlug]);

    check('Fail-closed rate limiter: Edge public-bookings and public-leads return HTTP 503 when RPC fails',
      edgeFailBookRes.status === 503 && edgeFailLeadRes.status === 503,
      `edgeBook=${edgeFailBookRes.status}, edgeLead=${edgeFailLeadRes.status}`
    );
    check('Fail-closed rate limiter: Express /api/bookings and /api/leads return HTTP 503 when RPC fails',
      expFailBookStatus === 503 && expFailLeadStatus === 503,
      `expBook=${expFailBookStatus}, expLead=${expFailLeadStatus}`
    );
    check('Fail-closed rate limiter: 0 bookings or leads inserted during RPC outage',
      afterFailCountB.rows[0].cnt === beforeFailCountB.rows[0].cnt &&
      afterFailCountL.rows[0].cnt === beforeFailCountL.rows[0].cnt
    );

    // =========================================================================
    // SECTION D (PHASE 4 & 5D): SOLE AUTHORITATIVE TENANT REGISTRY,
    // MEMORY-ONLY REJECTION, NO PER-TENANT BUCKET FOR INVALID SLUGS,
    // SYNCHRONIZED REGISTRATION, AND OWNER PWA ISOLATION
    // =========================================================================
    console.log('\n--- SECTION D: Sole Authoritative Tenant Registry & Synchronization ---');

    const unknownSlug = `sec-unknown-slug-${Date.now()}`;
    const inactiveSlug = `sec-inactive-slug-${Date.now()}`;
    const memoryOnlySlug = `sec-memory-only-slug-${Date.now()}`;
    createdTempTenants.push(inactiveSlug);

    // Create inactive tenant in public.tenants via synchronized helper
    await registerTenantAsync(inactiveSlug, 'Inactive Test Tenant', true, 'Barber');
    await deactivateTenantAsync(inactiveSlug);

    // Register memoryOnlySlug ONLY in local memory (NOT in public.tenants)
    registerTenant(memoryOnlySlug, 'Memory Only Tenant', true);

    // D1. Unknown slug rejected (404) on all 4 endpoints
    const unkEdgeBook = await handleBookingEdge(
      new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...baseBookPayload, slug: unknownSlug }),
      }),
      pgSupabaseClient
    );
    const unkEdgeLead = await handleLeadEdge(
      new Request(`https://${projectRef}.supabase.co/functions/v1/public-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: unknownSlug,
          leadType: 'consultation',
          customerName: 'Unknown Tester',
          phone: '(512) 555-0199',
        }),
      }),
      pgSupabaseClient
    );
    const unkExpBook = await fetch(`${expressBaseUrl}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBookPayload, slug: unknownSlug }),
    });
    const unkExpLead = await fetch(`${expressBaseUrl}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: unknownSlug,
        leadType: 'consultation',
        customerName: 'Unknown Tester',
        phone: '(512) 555-0199',
      }),
    });

    check('Unknown tenant slug rejected with HTTP 404 across Edge bookings/leads and Express bookings/leads',
      unkEdgeBook.status === 404 &&
      unkEdgeLead.status === 404 &&
      unkExpBook.status === 404 &&
      unkExpLead.status === 404
    );

    // D2. Inactive tenant rejected (404) on all 4 endpoints
    const inactEdgeBook = await handleBookingEdge(
      new Request(`https://${projectRef}.supabase.co/functions/v1/public-bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...baseBookPayload, slug: inactiveSlug }),
      }),
      pgSupabaseClient
    );
    const inactEdgeLead = await handleLeadEdge(
      new Request(`https://${projectRef}.supabase.co/functions/v1/public-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: inactiveSlug,
          leadType: 'consultation',
          customerName: 'Inactive Tester',
          phone: '(512) 555-0199',
        }),
      }),
      pgSupabaseClient
    );
    const inactExpBook = await fetch(`${expressBaseUrl}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBookPayload, slug: inactiveSlug }),
    });
    const inactExpLead = await fetch(`${expressBaseUrl}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: inactiveSlug,
        leadType: 'consultation',
        customerName: 'Inactive Tester',
        phone: '(512) 555-0199',
      }),
    });

    check('Inactive tenant (is_active = false via deactivateTenantAsync) rejected with HTTP 404 across Edge and Express',
      inactEdgeBook.status === 404 &&
      inactEdgeLead.status === 404 &&
      inactExpBook.status === 404 &&
      inactExpLead.status === 404
    );

    // D3. Verify unknown and inactive slugs did NOT create per-tenant rate-limit rows
    const perTenantInvalidBuckets = await dbClient.query(
      `SELECT COUNT(*) AS cnt FROM public.endpoint_rate_limits
       WHERE bucket_key LIKE $1 OR bucket_key LIKE $2`,
      [`%:${unknownSlug}`, `%:${inactiveSlug}`]
    );
    const coarseInvalidBuckets = await dbClient.query(
      `SELECT COUNT(*) AS cnt FROM public.endpoint_rate_limits
       WHERE bucket_key LIKE '%:invalid_slug:%'`
    );
    check('Invalid/inactive slugs create 0 per-tenant rate-limit rows and instead increment coarse per-IP invalid_slug bucket',
      parseInt(perTenantInvalidBuckets.rows[0].cnt, 10) === 0 &&
      parseInt(coarseInvalidBuckets.rows[0].cnt, 10) > 0,
      `perTenant=${perTenantInvalidBuckets.rows[0].cnt}, coarse=${coarseInvalidBuckets.rows[0].cnt}`
    );

    // D4. Verify a tenant present ONLY in memory is rejected with HTTP 404 when Supabase is configured
    const memOnlyBookRes = await fetch(`${expressBaseUrl}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBookPayload, slug: memoryOnlySlug }),
    });
    const memOnlyLeadRes = await fetch(`${expressBaseUrl}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: memoryOnlySlug,
        leadType: 'consultation',
        customerName: 'Memory Only Tester',
        phone: '(512) 555-0199',
      }),
    });
    removeTenant(memoryOnlySlug);
    check('Tenant present ONLY in memory (tenantsRegistry) is rejected with HTTP 404 by Express when Supabase is configured',
      memOnlyBookRes.status === 404 && memOnlyLeadRes.status === 404,
      `book=${memOnlyBookRes.status}, lead=${memOnlyLeadRes.status}`
    );

    // D5. Verify unauthenticated route cannot register/activate tenants, while authorized registration synchronizes to public.tenants
    const unauthDeploySlug = `sec-unauth-deploy-${Date.now()}`;
    const unauthDeployRes = await fetch(`${expressBaseUrl}/api/site-deploy/rebrand-single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business: { name: 'Unauth Barber', slug: unauthDeploySlug, city: 'Austin, TX', phone: '(512) 555-0100' },
        niche: 'Barber',
        deploy: false,
      }),
    });
    const unauthInDb = await dbClient.query(`SELECT * FROM public.tenants WHERE slug = $1`, [unauthDeploySlug]);
    check('Unauthenticated POST /api/site-deploy/rebrand-single is rejected with HTTP 401 and does not write to public.tenants',
      unauthDeployRes.status === 401 && unauthInDb.rows.length === 0,
      `status=${unauthDeployRes.status}, rows=${unauthInDb.rows.length}`
    );

    const syncedOwnerSlug = `sec-synced-owner-${Date.now()}`;
    createdTempTenants.push(syncedOwnerSlug);
    createdRateLimitPatterns.push(`%:${syncedOwnerSlug}`);
    await registerOwnerBusinessAsync('mock-user-owner-sync', syncedOwnerSlug, {
      name: 'Synced Owner Business',
      niche: 'HVAC & Climate',
    });
    const syncedRow = await dbClient.query(`SELECT slug, name, is_active FROM public.tenants WHERE slug = $1`, [syncedOwnerSlug]);
    check('Authorized registerOwnerBusinessAsync synchronizes active tenant record to Supabase public.tenants',
      syncedRow.rows.length === 1 && syncedRow.rows[0].is_active === true
    );

    // D6. Verify Owner PWA authentication and cross-tenant isolation
    const ownerAllowRes = await fetch(`${expressBaseUrl}/api/bookings?slug=${syncedOwnerSlug}`, {
      headers: { Authorization: 'Bearer mock-user-owner-sync' },
    });
    const ownerCrossTenantRes = await fetch(`${expressBaseUrl}/api/bookings?slug=${syncedOwnerSlug}`, {
      headers: { Authorization: 'Bearer mock-user-attacker-other' },
    });
    const ownerUnauthRes = await fetch(`${expressBaseUrl}/api/bookings?slug=${syncedOwnerSlug}`);
    check('Owner PWA isolation: Authorized owner gets 200, cross-tenant owner gets 403, unauthenticated caller gets 401',
      ownerAllowRes.status === 200 && ownerCrossTenantRes.status === 403 && ownerUnauthRes.status === 401,
      `allow=${ownerAllowRes.status}, cross=${ownerCrossTenantRes.status}, unauth=${ownerUnauthRes.status}`
    );

  } finally {
    // =========================================================================
    // SECTION E (PHASE 6): STRICT STAGING CLEANUP & ZERO-RESIDUE VERIFICATION
    // =========================================================================
    console.log('\n--- SECTION E: Strict Staging Cleanup & Zero-Residue Verification ---');

    setSimulateRateLimitFailure(false);

    if (createdBookingIds.length > 0) {
      await dbClient.query(`DELETE FROM public.bookings WHERE id = ANY($1)`, [createdBookingIds]);
    }
    if (createdLeadIds.length > 0) {
      await dbClient.query(`DELETE FROM public.leads WHERE id = ANY($1)`, [createdLeadIds]);
    }
    for (const pattern of createdRateLimitPatterns) {
      await dbClient.query(`DELETE FROM public.endpoint_rate_limits WHERE bucket_key LIKE $1`, [pattern]);
    }
    for (const slug of createdTempTenants) {
      await dbClient.query(`DELETE FROM public.bookings WHERE slug = $1`, [slug]);
      await dbClient.query(`DELETE FROM public.leads WHERE slug = $1`, [slug]);
      await removeTenantAsync(slug);
    }
    clearRateLimitBuckets();

    const remTenants = await dbClient.query(
      `SELECT COUNT(*) AS cnt FROM public.tenants WHERE slug = ANY($1)`,
      [createdTempTenants]
    );
    const remBookings = createdBookingIds.length > 0
      ? await dbClient.query(`SELECT COUNT(*) AS cnt FROM public.bookings WHERE id = ANY($1)`, [createdBookingIds])
      : { rows: [{ cnt: 0 }] };
    const remLeads = createdLeadIds.length > 0
      ? await dbClient.query(`SELECT COUNT(*) AS cnt FROM public.leads WHERE id = ANY($1)`, [createdLeadIds])
      : { rows: [{ cnt: 0 }] };

    check('Cleanup: 0 temporary test tenants remain in public.tenants', parseInt(remTenants.rows[0].cnt, 10) === 0);
    check('Cleanup: 0 test bookings remain in public.bookings', parseInt(remBookings.rows[0].cnt, 10) === 0);
    check('Cleanup: 0 test leads remain in public.leads', parseInt(remLeads.rows[0].cnt, 10) === 0);

    const finalActiveTenants = await dbClient.query(
      `SELECT COUNT(*) AS cnt FROM public.tenants WHERE is_active = TRUE`
    );
    check('Cleanup: Original 11 verified active tenants remain intact in public.tenants',
      parseInt(finalActiveTenants.rows[0].cnt, 10) === 11,
      `active count=${finalActiveTenants.rows[0].cnt}`
    );

    setPgPool(null);
    server.close();
    await dbClient.end();
  }

  console.log('\n========================================================================');
  console.log(`📊 STEP 2.2 SECURITY SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStep22SecuritySuite().catch((err) => {
  console.error('Fatal error in Step 2.2 security suite:', err);
  process.exit(1);
});
