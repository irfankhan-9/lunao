-- ==============================================================================
-- Rollback Migration for 20261022_add_tenant_active_and_rate_limits.sql
-- ==============================================================================

DROP FUNCTION IF EXISTS public.check_and_increment_rate_limit(TEXT, BIGINT, INT, BIGINT);
DROP TABLE IF EXISTS public.endpoint_rate_limits;
DROP POLICY IF EXISTS "Allow anon read access to active tenants only" ON public.tenants;
DROP POLICY IF EXISTS "Allow service_role full access to tenants" ON public.tenants;
DROP INDEX IF EXISTS idx_tenants_slug_active;
ALTER TABLE public.tenants DROP COLUMN IF EXISTS is_active;
