// ==============================================================================
// Lunao Supabase Edge Function: public-leads
// Target Lead Intake Flow:
// Customer Website (Gym VIP Pass / Home Valuation) -> Supabase Edge Function -> Supabase PostgreSQL `leads` -> Owner PWA
//
// Supports:
// 1. Direct CORS preflight (OPTIONS) with 204 No Content (no redirects)
// 2. Strict input validation (slug, customer name, phone, lead type, optional email/notes/details)
// 3. Durable persistence to Supabase PostgreSQL `leads` table
// 4. Client idempotency via X-Idempotency-Key or body field
// 5. Zero credentials leaked to client-side code
// ==============================================================================

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-Key, x-owner-key, X-Idempotency-Key, x-client-info, apikey',
  'Access-Control-Max-Age': '86400',
};

export const ALLOWED_LEAD_TYPES = new Set([
  'gym_pass',
  'gym_vip_pass',
  'home_valuation',
  'valuation_request',
  'general_inquiry',
  'lead_form',
  // HVAC bespoke lead types
  'consultation',
  'newsletter',
  'warranty_claim',
  'specimen_order',
  'workshop_inquiry',
]);

export interface LeadSubmission {
  slug: string;
  businessName?: string;
  business_name?: string;
  leadType?: string;
  lead_type?: string;
  customerName?: string;
  customer_name?: string;
  name?: string;
  fullName?: string;
  full_name?: string;
  phone: string;
  email?: string;
  notes?: string;
  message?: string;
  details?: Record<string, any>;
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
 * Core lead submission handler. Accepts web-standard Request and returns Response.
 * Works natively in Deno / Supabase Edge Runtime and Node.js test harnesses.
 */
export async function handleLeadRequest(
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
  let body: LeadSubmission;
  try {
    body = (await req.json()) as LeadSubmission;
  } catch (_err) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid JSON request body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 4. Validate Required Fields
  const slug = String(body.slug || '').trim();
  if (!slug || slug.length < 2) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Missing or invalid required field: slug' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const rawLeadType = String(body.leadType || body.lead_type || 'general_inquiry').trim().toLowerCase();
  if (!ALLOWED_LEAD_TYPES.has(rawLeadType)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Unsupported lead type: ${rawLeadType}. Allowed: ${Array.from(ALLOWED_LEAD_TYPES).join(', ')}`,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  const leadType = rawLeadType;
  const isNewsletter = leadType === 'newsletter';

  const customerName = String(
    body.customerName || body.customer_name || body.fullName || body.full_name || body.name || (isNewsletter ? 'Newsletter Subscriber' : '')
  ).trim();
  if (!customerName || customerName.length < 2) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Customer name must be at least 2 characters' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const rawPhone = String(body.phone || '').trim();
  const phone = (!rawPhone && isNewsletter) ? '(000) 000-0000' : rawPhone;
  const digits = phone.replace(/\D/g, '');
  if (!isNewsletter && (!digits || digits.length < 7)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Valid phone number with at least 7 digits is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const email = String(body.email || '').trim();
  if (isNewsletter && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Valid email address is required for newsletter subscription' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid email address format' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Sanitized optional fields
  const businessName = String(body.businessName || body.business_name || '').trim();
  const notes = String(body.notes || body.message || '').trim();
  const source = String(body.source || 'website_form').trim();
  const status = String(body.status || 'new').trim();
  const createdAt = Number(body.createdAt || body.created_at || Date.now());

  // Structured details sanitization
  let details: Record<string, any> = {};
  if (body.details && typeof body.details === 'object' && !Array.isArray(body.details)) {
    details = { ...body.details };
  }

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
    const envGet = (key: string): string => {
      if (typeof Deno !== 'undefined' && Deno.env?.get) {
        return Deno.env.get(key) || '';
      }
      if (typeof process !== 'undefined' && process.env) {
        return process.env[key] || '';
      }
      return '';
    };

    const supabaseUrl = envGet('SUPABASE_URL') || 'https://wqlbuadknltsjfzrltpe.supabase.co';
    const supabaseKey =
      envGet('SUPABASE_SERVICE_ROLE_KEY') ||
      envGet('SUPABASE_SECRET_KEY') ||
      envGet('SUPABASE_KEY') ||
      envGet('SUPABASE_ANON_KEY');

    if (!supabaseUrl) {
      console.error('[public-leads] Missing SUPABASE_URL');
      return new Response(
        JSON.stringify({ ok: false, error: 'Backend database configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { createClient } = await import(
      typeof Deno !== 'undefined' ? 'https://esm.sh/@supabase/supabase-js@2.45.4' : '@supabase/supabase-js'
    );
    supabase = createClient(supabaseUrl, supabaseKey || '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  // 6. Check Idempotency before inserting
  if (idempotencyKey && supabase) {
    try {
      const { data: existing, error: findError } = await supabase
        .from('leads')
        .select('*')
        .eq('slug', slug)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existing && !findError) {
        return new Response(
          JSON.stringify({
            ok: true,
            id: existing.id,
            lead: existing,
            isExisting: true,
            message: 'Lead inquiry already received',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (_err) {
      // Continue to insert if query fails
    }
  }

  // 7. Insert Lead Record
  const insertPayload: Record<string, unknown> = {
    slug,
    business_name: businessName,
    lead_type: leadType,
    customer_name: customerName,
    phone,
    email: email || null,
    notes: notes || null,
    details: details || {},
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
      .from('leads')
      .insert(insertPayload)
      .select()
      .single();
    data = insertRes.data;
    error = insertRes.error;
  } catch (err: any) {
    error = err;
  }

  if (error || !data) {
    console.error('[public-leads] Insert failed:', error?.message || error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Database persistence failed. Your inquiry could not be saved.',
        details: error?.message || 'Unknown database error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      id: data.id,
      lead: data,
      isExisting: false,
      message: 'Lead inquiry registered successfully',
    }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Export default handler for Deno/Supabase Edge Functions runtime
export default async function (req: Request): Promise<Response> {
  return handleLeadRequest(req);
}
