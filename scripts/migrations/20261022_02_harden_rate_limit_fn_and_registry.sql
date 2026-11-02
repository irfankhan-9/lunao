-- ==============================================================================
-- Lunao Stage 3 Batch 5 Step 2.2 Forward Security Migration:
-- Harden public.check_and_increment_rate_limit & Authoritative Registry Grants
-- ==============================================================================

-- 1. Enforce strict table privileges and RLS on public.tenants
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tenants TO anon, authenticated;
GRANT ALL ON TABLE public.tenants TO service_role, postgres;

-- 2. Enforce strict table privileges and RLS on public.endpoint_rate_limits
ALTER TABLE public.endpoint_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.endpoint_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.endpoint_rate_limits TO service_role, postgres;

DROP POLICY IF EXISTS "Allow service_role full access to rate limits" ON public.endpoint_rate_limits;
CREATE POLICY "Allow service_role full access to rate limits" ON public.endpoint_rate_limits
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Harden public.check_and_increment_rate_limit:
--    - Pin search_path = pg_catalog (excludes all user/untrusted schemas)
--    - Fully schema-qualify public.endpoint_rate_limits and pg_catalog builtins
--    - Derive server time (v_now_ms) and 5-minute window boundary (v_window_start)
--      strictly inside PostgreSQL from pg_catalog.clock_timestamp()
--    - Ignore caller-supplied p_window_start and p_now so callers cannot spoof time
--    - Compute Retry-After using ceiling arithmetic: CEIL(remaining_ms / 1000.0)
--    - Bound opportunistic cleanup to expired rows (> 1h old by server clock, LIMIT 500)
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_bucket_key TEXT,
  p_window_start BIGINT DEFAULT NULL,
  p_max_requests INT DEFAULT 10,
  p_now BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_clean_key TEXT;
  v_window_ms CONSTANT BIGINT := 300000; -- 5 minutes in milliseconds
  v_now_ms BIGINT;
  v_window_start BIGINT;
  v_max_requests INT;
  v_current_count INT;
  v_allowed BOOLEAN;
  v_retry_after INT;
BEGIN
  v_clean_key := pg_catalog.btrim(COALESCE(p_bucket_key, ''));
  IF v_clean_key = '' OR pg_catalog.length(v_clean_key) > 256 THEN
    RAISE EXCEPTION 'Invalid rate limit bucket key' USING ERRCODE = '22023';
  END IF;

  v_max_requests := GREATEST(1, LEAST(COALESCE(p_max_requests, 10), 10000));

  -- Derive current epoch ms and fixed 5-minute window boundary strictly from PostgreSQL server clock
  v_now_ms := pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()) * 1000.0)::BIGINT;
  v_window_start := (v_now_ms / v_window_ms) * v_window_ms;

  INSERT INTO public.endpoint_rate_limits (bucket_key, window_start, request_count, updated_at)
  VALUES (v_clean_key, v_window_start, 1, v_now_ms)
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET
    request_count = public.endpoint_rate_limits.request_count + 1,
    updated_at = v_now_ms
  RETURNING request_count INTO v_current_count;

  IF v_current_count > v_max_requests THEN
    v_allowed := FALSE;
    v_retry_after := GREATEST(
      1,
      pg_catalog.ceil(((v_window_start + v_window_ms) - v_now_ms)::NUMERIC / 1000.0)::INT
    );
  ELSE
    v_allowed := TRUE;
    v_retry_after := 0;
  END IF;

  -- Bounded probabilistic cleanup of expired windows (> 1 hour old by PostgreSQL server clock)
  IF (pg_catalog.random() < 0.02) THEN
    DELETE FROM public.endpoint_rate_limits
    WHERE ctid IN (
      SELECT ctid
      FROM public.endpoint_rate_limits
      WHERE window_start < (v_now_ms - 3600000)
      LIMIT 500
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'allowed', v_allowed,
    'count', v_current_count,
    'retry_after', v_retry_after,
    'window_start', v_window_start,
    'server_now', v_now_ms
  );
END;
$$;

-- 4. Lock down function ownership and EXECUTE privileges
ALTER FUNCTION public.check_and_increment_rate_limit(TEXT, BIGINT, INT, BIGINT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_and_increment_rate_limit(TEXT, BIGINT, INT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(TEXT, BIGINT, INT, BIGINT) TO service_role, postgres;
