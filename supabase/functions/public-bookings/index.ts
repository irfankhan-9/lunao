// ==============================================================================
// Lunao Supabase Edge Function: public-bookings
// Target Booking Flow:
// Customer Website -> Supabase Edge Function -> Supabase PostgreSQL `bookings` -> Owner PWA
//
// Security Hardening (Stage 3 Batch 5 Step 2.2):
// 1. Direct CORS preflight (OPTIONS) with 204 No Content (CORS is not authentication)
// 2. Strict input validation before any database or RPC work
// 3. Requires SUPABASE_SERVICE_ROLE_KEY (never falls back to SUPABASE_ANON_KEY; fails closed 503)
// 4. Authoritative tenant registry validation (public.tenants is_active = true) before per-tenant rate-limit buckets
// 5. Coarse per-IP invalid-slug rate limit bucket so unknown/inactive slugs never create per-tenant rows
// 6. Fail-closed atomic rate limiting (per-IP + per-tenant aggregate) via SECURITY DEFINER RPC
// 7. Trusted IP extraction (no x-real-ip or x-forwarded-for; cf-connecting-ip only on verified Cloudflare/Supabase ingress)
// ==============================================================================

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-Key, x-owner-key, X-Idempotency-Key, x-client-info, apikey',
  'Access-Control-Max-Age': '86400',
};

export interface BookingSubmission {
  slug: string;
  businessName?: string;
  business_name?: string;
  customerName?: string;
  customer_name?: string;
  name?: string;
  phone: string;
  email?: string;
  service?: string;
  date?: string;
  time?: string;
  notes?: string;
  message?: string;
  source?: string;
  status?: string;
  createdAt?: number;
  created_at?: number;
  idempotencyKey?: string;
  idempotency_key?: string;
}

export interface SupabaseClientLike {
  from: (table: string) => {
    select: (columns?: string) => any;
    insert: (values: any) => any;
  };
  rpc?: (fn: string, args?: Record<string, any>) => Promise<{ data: any; error: any }>;
}

export interface EdgeIngressContext {
  trustedCloudflareIngress?: boolean;
  connectingIp?: string;
  remoteAddr?: string;
}

const IPV4_REGEX = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_REGEX = /^[0-9a-fA-F:]{2,45}$/;
const CF_RAY_REGEX = /^[0-9a-fA-F]{16}-[A-Z]{3}$/;

export function isValidIpAddress(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 45 || trimmed.includes(',') || /\s/.test(trimmed)) {
    return false;
  }
  if (IPV4_REGEX.test(trimmed)) return true;
  if (trimmed.includes(':') && IPV6_REGEX.test(trimmed)) return true;
  return false;
}

export function isTrustedSupabaseEdgeIngress(req: Request, ingressContext?: EdgeIngressContext): boolean {
  if (ingressContext && typeof ingressContext.trustedCloudflareIngress === 'boolean') {
    return ingressContext.trustedCloudflareIngress;
  }
  const cfRay = (req.headers.get('cf-ray') || '').trim();
  const sbGateway = (req.headers.get('sb-gateway-version') || '').trim();
  const servedBy = (req.headers.get('x-served-by') || '').trim();
  if (CF_RAY_REGEX.test(cfRay) && (sbGateway === '1' || servedBy === 'supabase-edge-runtime')) {
    return true;
  }
  return false;
}

/**
 * Extracts client IP strictly from verified Supabase/Cloudflare ingress context.
 * - Never reads caller-controlled x-real-ip or x-forwarded-for.
 * - Only trusts cf-connecting-ip when the request has verified Cloudflare/Supabase edge ingress metadata.
 * - Falls back to a safe constant bucket key ('fallback_unverified_ingress_ip') when missing or unverified.
 */
export function extractClientIp(req: Request, ingressContext?: EdgeIngressContext): string {
  if (isTrustedSupabaseEdgeIngress(req, ingressContext)) {
    if (ingressContext?.connectingIp && isValidIpAddress(ingressContext.connectingIp)) {
      return ingressContext.connectingIp.trim();
    }
    const cfIp = req.headers.get('cf-connecting-ip');
    if (cfIp && isValidIpAddress(cfIp)) {
      return cfIp.trim();
    }
  }
  if (ingressContext?.remoteAddr && isValidIpAddress(ingressContext.remoteAddr)) {
    return ingressContext.remoteAddr.trim();
  }
  return 'fallback_unverified_ingress_ip';
}

export function hashClientIp(ip: string): string {
  const salted = `lunao-rl-salt-2026:${ip}`;
  let h = 5381;
  for (let i = 0; i < salted.length; i++) {
    h = ((h << 5) + h) + salted.charCodeAt(i);
    h |= 0;
  }
  return 'ip_' + Math.abs(h).toString(36);
}

function getEnvVar(key: string): string {
  // @ts-ignore
  if (typeof Deno !== 'undefined' && Deno.env?.get) {
    // @ts-ignore
    return Deno.env.get(key) || '';
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || '';
  }
  return '';
}

async function enforceRateLimitBucket(
  supabase: SupabaseClientLike,
  bucketKey: string,
  maxRequests: number
): Promise<{ ok: true; allowed: boolean; retryAfter: number } | { ok: false; status: number; error: string }> {
  if (!supabase || typeof supabase.rpc !== 'function') {
    console.error('[public-bookings] Rate limiter unavailable: missing privileged RPC interface');
    return { ok: false, status: 503, error: 'Service temporarily unavailable: rate limiter unavailable' };
  }
  const now = Date.now();
  const windowStart = Math.floor(now / 300000) * 300000;
  try {
    const { data: rlData, error: rlErr } = await supabase.rpc('check_and_increment_rate_limit', {
      p_bucket_key: bucketKey,
      p_window_start: windowStart,
      p_max_requests: maxRequests,
      p_now: now,
    });
    const rlObj = Array.isArray(rlData) ? rlData[0] : rlData;
    if (rlErr || !rlObj || typeof rlObj.allowed !== 'boolean') {
      console.error('[public-bookings] Rate limit RPC error:', rlErr?.message || 'Malformed RPC response');
      return { ok: false, status: 503, error: 'Service temporarily unavailable: rate limit verification failed' };
    }
    return {
      ok: true,
      allowed: rlObj.allowed,
      retryAfter: Number(rlObj.retry_after || rlObj.retry_after_seconds || 300),
    };
  } catch (err: any) {
    console.error('[public-bookings] Rate limit RPC exception:', err?.message || 'Unknown error');
    return { ok: false, status: 503, error: 'Service temporarily unavailable: rate limit check failed' };
  }
}

/**
 * Core booking submission handler. Accepts web-standard Request and returns Response.
 * Works natively in Deno / Supabase Edge Runtime and Node.js test harnesses.
 */
export async function handleRequest(
  req: Request,
  customSupabaseClient?: SupabaseClientLike,
  ingressContext?: EdgeIngressContext
): Promise<Response> {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // 2. Enforce POST method
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: `Method ${req.method} not allowed` }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' },
      }
    );
  }

  // 3. Parse JSON Body before any DB/RPC work
  let body: BookingSubmission;
  try {
    body = (await req.json()) as BookingSubmission;
  } catch (_err) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid JSON request body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 4. Validate Required Fields before any DB/RPC work
  const slug = String(body?.slug || '').trim().toLowerCase();
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,120}$/.test(slug)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Missing required field: slug' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const customerName = String(body.customerName || body.customer_name || body.name || '').trim();
  if (!customerName || customerName.length < 2) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Customer name must be at least 2 characters' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const phone = String(body.phone || '').trim();
  const digits = phone.replace(/\D/g, '');
  if (!digits || digits.length < 7) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Valid phone number with at least 7 digits is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const email = String(body.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid email address format' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Sanitized optional fields
  const businessName = String(body.businessName || body.business_name || '').trim();
  const service = String(body.service || 'General Service').trim();
  const date = String(body.date || '').trim();
  const time = String(body.time || '').trim();
  const notes = String(body.notes || body.message || '').trim();
  const source = String(body.source || 'website_form').trim();
  const status = String(body.status || 'new').trim();
  const createdAt = Number(body.createdAt || body.created_at || Date.now());

  const rawIdempotencyKey =
    req.headers.get('x-idempotency-key') ||
    body.idempotencyKey ||
    body.idempotency_key ||
    '';
  const idempotencyKey = String(rawIdempotencyKey).trim() || null;

  // 5. Initialize Privileged Supabase Client (Require SUPABASE_SERVICE_ROLE_KEY; NEVER fall back to SUPABASE_ANON_KEY)
  let supabase = customSupabaseClient;
  if (!supabase) {
    const supabaseUrl = getEnvVar('SUPABASE_URL');
    const supabaseServiceKey =
      getEnvVar('SUPABASE_SERVICE_ROLE_KEY') ||
      getEnvVar('SUPABASE_SECRET_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[public-bookings] Missing required SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response(
        JSON.stringify({ ok: false, error: 'Service temporarily unavailable: backend credentials not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { createClient } = await import(
      // @ts-ignore
      typeof Deno !== 'undefined' ? 'https://esm.sh/@supabase/supabase-js@2.45.4' : '@supabase/supabase-js'
    );
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  const clientIp = extractClientIp(req, ingressContext);
  const ipHash = hashClientIp(clientIp);
  const maxIpRequests = Math.max(1, parseInt(getEnvVar('PUBLIC_BOOKINGS_IP_MAX_PER_WINDOW') || '10', 10));
  const maxTenantAggregateRequests = Math.max(
    maxIpRequests,
    parseInt(getEnvVar('PUBLIC_BOOKINGS_TENANT_MAX_PER_WINDOW') || '30', 10)
  );
  const maxInvalidSlugRequests = Math.max(1, parseInt(getEnvVar('PUBLIC_INVALID_SLUG_MAX_PER_WINDOW') || '15', 10));

  // 6. Security Control A: Authoritative Tenant Registry Validation BEFORE creating per-tenant rate-limit rows
  try {
    const { data: tenant, error: tenantErr } = await supabase!
      .from('tenants')
      .select('slug, name, is_active')
      .eq('slug', slug)
      .maybeSingle();

    if (tenantErr) {
      console.error('[public-bookings] Tenant registry query error:', tenantErr.message);
      return new Response(
        JSON.stringify({ ok: false, error: 'Service temporarily unavailable: unable to verify tenant registration' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tenant || tenant.is_active !== true) {
      // Throttle unknown/inactive slug probing using a coarse per-IP + endpoint bucket (no per-tenant row created!)
      const invalidBucket = `${ipHash}:invalid_slug:bookings`;
      const invalidRl = await enforceRateLimitBucket(supabase!, invalidBucket, maxInvalidSlugRequests);
      if (invalidRl.ok === false) {
        return new Response(
          JSON.stringify({ ok: false, error: invalidRl.error }),
          { status: invalidRl.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!invalidRl.allowed) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Rate limit exceeded: Too many requests. Please try again later.' }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'Retry-After': String(invalidRl.retryAfter),
            },
          }
        );
      }
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Unregistered or inactive business tenant: ${slug}`,
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err: any) {
    console.error('[public-bookings] Tenant validation failure:', err?.message || 'Unknown error');
    return new Response(
      JSON.stringify({ ok: false, error: 'Service temporarily unavailable: failed to verify tenant registration' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 7. Security Control B: Fail-Closed Atomic Server-Side Rate Limiting for Verified Active Tenant
  // 7a. Per-IP + Tenant + Endpoint bucket
  const perIpBucketKey = `${ipHash}:bookings:${slug}`;
  const ipRl = await enforceRateLimitBucket(supabase!, perIpBucketKey, maxIpRequests);
  if (ipRl.ok === false) {
    return new Response(
      JSON.stringify({ ok: false, error: ipRl.error }),
      { status: ipRl.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  if (!ipRl.allowed) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Rate limit exceeded: Too many requests. Please try again later.',
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(ipRl.retryAfter),
        },
      }
    );
  }

  // 7b. Per-Tenant Aggregate bucket (protects active tenant against distributed multi-IP floods)
  const tenantAggBucketKey = `tenant_agg:bookings:${slug}`;
  const aggRl = await enforceRateLimitBucket(supabase!, tenantAggBucketKey, maxTenantAggregateRequests);
  if (aggRl.ok === false) {
    return new Response(
      JSON.stringify({ ok: false, error: aggRl.error }),
      { status: aggRl.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  if (!aggRl.allowed) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Rate limit exceeded: Too many requests for this business. Please try again later.',
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(aggRl.retryAfter),
        },
      }
    );
  }

  // 8. Check Idempotency before inserting
  if (idempotencyKey && supabase) {
    try {
      const { data: existing, error: findError } = await supabase
        .from('bookings')
        .select('*')
        .eq('slug', slug)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existing && !findError) {
        return new Response(
          JSON.stringify({
            ok: true,
            id: existing.id,
            booking: existing,
            isExisting: true,
            message: 'Booking already confirmed',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (_err) {
      // Continue to insert
    }
  }

  // 9. Insert Booking Record
  const insertPayload: Record<string, unknown> = {
    slug,
    business_name: businessName,
    customer_name: customerName,
    phone,
    email,
    service,
    date,
    time,
    notes,
    source,
    status,
    created_at: createdAt,
  };

  if (idempotencyKey) {
    insertPayload.idempotency_key = idempotencyKey;
  }

  let data: any = null;
  let error: any = null;

  try {
    const insertRes = await supabase!
      .from('bookings')
      .insert(insertPayload)
      .select()
      .single();
    data = insertRes.data;
    error = insertRes.error;

    if (error && error.message && error.message.includes('idempotency_key')) {
      console.error('[public-bookings] Database schema error: column "idempotency_key" missing. Migration required.');
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Database schema configuration error: idempotency support not migrated. Duplicate protection unavailable.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle concurrent duplicate key conflict (Postgres 23505)
    if (error && (error.code === '23505' || String(error.message).includes('unique'))) {
      if (idempotencyKey) {
        const { data: existing } = await supabase!
          .from('bookings')
          .select('*')
          .eq('slug', slug)
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();
        if (existing) {
          return new Response(
            JSON.stringify({
              ok: true,
              id: existing.id,
              booking: existing,
              isExisting: true,
              message: 'Booking already confirmed',
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }
  } catch (err: any) {
    error = err;
  }

  if (error || !data) {
    console.error('[public-bookings] Supabase insert failed:', error?.message || error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Failed to record booking. Please call the business directly.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      id: data.id,
      booking: data,
      isExisting: false,
      message: 'Booking confirmed successfully',
    }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Global Deno entry point for Supabase Edge Runtime
// @ts-ignore
if (typeof Deno !== 'undefined' && Deno?.serve) {
  // @ts-ignore
  Deno.serve((req: Request, info: any) =>
    handleRequest(req, undefined, {
      trustedCloudflareIngress: true,
      remoteAddr: info?.remoteAddr?.hostname,
    })
  );
}
