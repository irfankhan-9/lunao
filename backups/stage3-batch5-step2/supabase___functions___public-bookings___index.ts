// ==============================================================================
// Lunao Supabase Edge Function: public-bookings
// Target Booking Flow:
// Customer Website -> Supabase Edge Function -> Supabase PostgreSQL `bookings` -> Owner PWA
//
// Supports:
// 1. Direct CORS preflight (OPTIONS) with 204 No Content (no redirects)
// 2. Strict input validation (slug, customer name, phone, optional email/time)
// 3. Durable persistence to Supabase PostgreSQL `bookings` table
// 4. Client idempotency via X-Idempotency-Key or body field
// 5. Zero credentials leaked to client-side code
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
}

/**
 * Core booking submission handler. Accepts web-standard Request and returns Response.
 * Works natively in Deno / Supabase Edge Runtime and Node.js test harnesses.
 */
export async function handleRequest(
  req: Request,
  customSupabaseClient?: SupabaseClientLike
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

  // 3. Parse JSON Body
  let body: BookingSubmission;
  try {
    body = (await req.json()) as BookingSubmission;
  } catch (_err) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid JSON request body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 4. Validate Required Fields
  const slug = String(body.slug || '').trim();
  if (!slug) {
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

  // Idempotency Key from header or body
  const rawIdempotencyKey =
    req.headers.get('x-idempotency-key') ||
    body.idempotencyKey ||
    body.idempotency_key ||
    '';
  const idempotencyKey = String(rawIdempotencyKey).trim() || null;

  // 5. Initialize Supabase Client
  let supabase = customSupabaseClient;
  if (!supabase) {
    // Deno environment variables or Node fallback
    const envGet = (key: string): string => {
      if (typeof Deno !== 'undefined' && Deno.env?.get) {
        return Deno.env.get(key) || '';
      }
      if (typeof process !== 'undefined' && process.env) {
        return process.env[key] || '';
      }
      return '';
    };

    const supabaseUrl = envGet('SUPABASE_URL');
    const supabaseKey =
      envGet('SUPABASE_SERVICE_ROLE_KEY') ||
      envGet('SUPABASE_SECRET_KEY') ||
      envGet('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('[public-bookings] Missing SUPABASE_URL or service key');
      return new Response(
        JSON.stringify({ ok: false, error: 'Backend database configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Dynamic import to support both Deno and Node environments
    const { createClient } = await import(
      typeof Deno !== 'undefined' ? 'https://esm.sh/@supabase/supabase-js@2.45.4' : '@supabase/supabase-js'
    );
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  // 6. Check Idempotency before inserting
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
      // If table query fails on idempotency_key column, continue to insert
    }
  }

  // 7. Insert Booking Record
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

    // Audit Check: If idempotency_key column does not exist on the database,
    // do NOT silently delete the key and insert anyway (which would bypass duplicate protection).
    // Instead, return an explicit 500 configuration error indicating migration is required.
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

  // 8. Durable Confirmation Check: Never return success if persistence failed!
  // Secure: Do not leak SQL errors, column names, or stack traces in client response
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

  // 9. Return 201 Created on verified commit
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
  Deno.serve(handleRequest);
}
