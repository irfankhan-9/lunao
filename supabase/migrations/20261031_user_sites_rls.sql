-- ============================================================================
-- Migration: 20261031_user_sites_rls.sql
-- Purpose:   Multi-tenant storage and strict Row Level Security (RLS) for
--            user-rebranded Lunao PWA sites in the Site Editor.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.user_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  niche TEXT NOT NULL DEFAULT 'Barber',
  template_key TEXT NOT NULL,
  template_source TEXT NOT NULL DEFAULT 'builtin' CHECK (template_source IN ('builtin')),
  is_pwa_connected BOOLEAN NOT NULL DEFAULT true CHECK (is_pwa_connected = true),
  campaign_source TEXT NOT NULL DEFAULT 'site-deploy' CHECK (campaign_source IN ('sms', 'email', 'site-deploy')),
  campaign_id TEXT,
  deploy_url TEXT NOT NULL DEFAULT '',
  compiled_html TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_user_sites_owner_updated
  ON public.user_sites (owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_sites_slug_owner
  ON public.user_sites (slug, owner_id);

-- Strictly enable and force Row Level Security (even table owners are subject to policies unless bypassed by role policy)
ALTER TABLE public.user_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sites FORCE ROW LEVEL SECURITY;

-- Revoke all anonymous/public access
REVOKE ALL ON public.user_sites FROM anon;
REVOKE ALL ON public.user_sites FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sites TO authenticated;
GRANT ALL ON public.user_sites TO service_role;

-- Drop existing policies idempotently before recreating
DROP POLICY IF EXISTS "user_sites_service_role_all" ON public.user_sites;
DROP POLICY IF EXISTS "user_sites_select_own" ON public.user_sites;
DROP POLICY IF EXISTS "user_sites_insert_own" ON public.user_sites;
DROP POLICY IF EXISTS "user_sites_update_own" ON public.user_sites;
DROP POLICY IF EXISTS "user_sites_delete_own" ON public.user_sites;

-- 1. Service role / backend admin full control
CREATE POLICY "user_sites_service_role_all"
  ON public.user_sites
  FOR ALL
  TO service_role, postgres
  USING (true)
  WITH CHECK (true);

-- 2. Authenticated tenant isolation: SELECT only own built-in PWA sites
CREATE POLICY "user_sites_select_own"
  ON public.user_sites
  FOR SELECT
  TO authenticated
  USING (
    owner_id = COALESCE(
      NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'owner_key', ''),
      NULLIF(auth.uid()::text, ''),
      NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub', ''),
      NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'email', '')
    )
    AND template_source = 'builtin'
    AND is_pwa_connected = true
  );

-- 3. Authenticated tenant isolation: INSERT only own built-in PWA sites
CREATE POLICY "user_sites_insert_own"
  ON public.user_sites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = COALESCE(
      NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'owner_key', ''),
      NULLIF(auth.uid()::text, ''),
      NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub', ''),
      NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'email', '')
    )
    AND template_source = 'builtin'
    AND is_pwa_connected = true
  );

-- 4. Authenticated tenant isolation: UPDATE only own built-in PWA sites
CREATE POLICY "user_sites_update_own"
  ON public.user_sites
  FOR UPDATE
  TO authenticated
  USING (
    owner_id = COALESCE(
      NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'owner_key', ''),
      NULLIF(auth.uid()::text, ''),
      NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub', ''),
      NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'email', '')
    )
  )
  WITH CHECK (
    owner_id = COALESCE(
      NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'owner_key', ''),
      NULLIF(auth.uid()::text, ''),
      NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub', ''),
      NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'email', '')
    )
    AND template_source = 'builtin'
    AND is_pwa_connected = true
  );

-- 5. Authenticated tenant isolation: DELETE only own sites
CREATE POLICY "user_sites_delete_own"
  ON public.user_sites
  FOR DELETE
  TO authenticated
  USING (
    owner_id = COALESCE(
      NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'owner_key', ''),
      NULLIF(auth.uid()::text, ''),
      NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub', ''),
      NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'email', '')
    )
  );
