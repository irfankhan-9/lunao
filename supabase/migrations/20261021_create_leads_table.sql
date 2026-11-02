-- Migration: Dedicated Customer Inbound Leads Pipeline
-- Supports gym passes, home valuation inquiries, and general lead capture
-- Enforces tenant isolation, idempotency deduplication, and non-blocking JSON details.

CREATE TABLE IF NOT EXISTS public.leads (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL,
  business_name TEXT,
  lead_type TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  notes TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  source TEXT DEFAULT 'form',
  status TEXT DEFAULT 'new',
  idempotency_key TEXT,
  created_at BIGINT NOT NULL,
  created_at_tz TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique index for client idempotency deduplication per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_slug_idempotency 
  ON public.leads (slug, idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

-- Fast index for tenant feed sorted by latest inquiry
CREATE INDEX IF NOT EXISTS idx_leads_slug_created 
  ON public.leads (slug, created_at DESC);

-- Enable Row Level Security (RLS) if enabled in Supabase
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Allow anon/service role inserts via Edge Function or backend
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'Allow public insert to leads'
  ) THEN
    CREATE POLICY "Allow public insert to leads" ON public.leads
      FOR INSERT TO public
      WITH CHECK (true);
  END IF;
END $$;

-- Allow service role full access
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'Allow service_role full access to leads'
  ) THEN
    CREATE POLICY "Allow service_role full access to leads" ON public.leads
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
