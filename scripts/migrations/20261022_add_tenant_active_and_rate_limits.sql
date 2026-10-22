-- ==============================================================================
-- Lunao Stage 3 Batch 5 Step 2 Migration: Tenant Active Column & Public Rate Limiting
-- ==============================================================================

-- 1. Add is_active column to public.tenants if not exists
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_tenants_slug_active ON public.tenants (slug) WHERE is_active = TRUE;

-- 2. Restrict public.tenants writes and enable RLS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenants FROM anon;
GRANT SELECT ON public.tenants TO anon;

DROP POLICY IF EXISTS "Allow anon read access to active tenants only" ON public.tenants;
CREATE POLICY "Allow anon read access to active tenants only" ON public.tenants
  FOR SELECT TO anon
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "Allow service_role full access to tenants" ON public.tenants;
CREATE POLICY "Allow service_role full access to tenants" ON public.tenants
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Create rate limiting table
CREATE TABLE IF NOT EXISTS public.endpoint_rate_limits (
  bucket_key TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  request_count INT NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.endpoint_rate_limits (window_start);

ALTER TABLE public.endpoint_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.endpoint_rate_limits FROM anon;
GRANT ALL ON public.endpoint_rate_limits TO service_role, postgres;

-- 4. Atomic rate limit function
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_bucket_key TEXT,
  p_window_start BIGINT,
  p_max_requests INT,
  p_now BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_count INT;
  v_allowed BOOLEAN;
  v_retry_after INT;
BEGIN
  INSERT INTO public.endpoint_rate_limits (bucket_key, window_start, request_count, updated_at)
  VALUES (p_bucket_key, p_window_start, 1, p_now)
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET 
    request_count = public.endpoint_rate_limits.request_count + 1,
    updated_at = p_now
  RETURNING request_count INTO v_current_count;

  IF v_current_count > p_max_requests THEN
    v_allowed := FALSE;
    v_retry_after := GREATEST(1, 300 - ((p_now - p_window_start) / 1000)::INT);
  ELSE
    v_allowed := TRUE;
    v_retry_after := 0;
  END IF;

  -- Periodic probabilistic cleanup of old windows (> 1 hour)
  IF (RANDOM() < 0.02) THEN
    DELETE FROM public.endpoint_rate_limits WHERE window_start < (p_now - 3600000);
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'count', v_current_count,
    'retry_after', v_retry_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_increment_rate_limit FROM anon;
GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit TO service_role, postgres;

-- 5. Conservative initial active tenant population
-- Only live verified client sites from Stage 3 audits
INSERT INTO public.tenants (id, slug, name, niche, is_active, created_at, updated_at)
VALUES
  ('t-apex-climate', 'apex-climate-care-austin', 'Apex Climate Care', 'HVAC & Climate', TRUE, NOW(), NOW()),
  ('t-everest-climate-sys', 'everest-climate-systems-austin', 'Everest Climate Systems', 'HVAC & Climate', TRUE, NOW(), NOW()),
  ('t-everest-climate', 'everest-climate-austin', 'Everest Climate', 'HVAC & Climate', TRUE, NOW(), NOW()),
  ('t-vintage-cuts', 'vintage-cuts-austin', 'Vintage Cuts Barber Lounge', 'Barber', TRUE, NOW(), NOW()),
  ('t-radiant-smiles', 'radiant-smiles-dental-austin', 'Radiant Smiles Dental', 'Dental Clinic', TRUE, NOW(), NOW()),
  ('t-bright-smiles', 'bright-smiles-dental-boston', 'Bright Smiles Dental', 'Dental Clinic', TRUE, NOW(), NOW()),
  ('t-acme-salon', 'acme-salon-dallas', 'Acme Salon', 'Hair & Beauty Salon', TRUE, NOW(), NOW()),
  ('t-acme-barber', 'acme-barber-austin', 'Acme Barber', 'Barber', TRUE, NOW(), NOW()),
  ('t-elite-roofing', 'elite-roofing-pro-austin-roofing', 'Elite Roofing Pro', 'Roofing & Construction', TRUE, NOW(), NOW()),
  ('t-iron-grit', 'iron-grit-fitness-brooklyn', 'Iron Grit Fitness', 'Gym & Fitness', TRUE, NOW(), NOW()),
  ('t-aurora-salon', 'aurora-salon-miami', 'Aurora Salon', 'Hair & Beauty Salon', TRUE, NOW(), NOW())
ON CONFLICT (slug) DO UPDATE SET is_active = EXCLUDED.is_active;
