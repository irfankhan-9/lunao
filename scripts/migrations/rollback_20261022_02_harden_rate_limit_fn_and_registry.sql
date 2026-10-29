-- ==============================================================================
-- Rollback for 20261022_02_harden_rate_limit_fn_and_registry.sql
-- Restores the Step 2 baseline function definition while preserving tables
-- ==============================================================================

DROP POLICY IF EXISTS "Allow service_role full access to rate limits" ON public.endpoint_rate_limits;

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
