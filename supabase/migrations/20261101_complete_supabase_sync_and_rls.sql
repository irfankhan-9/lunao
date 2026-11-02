-- ============================================================================
-- LUNAO PRODUCTION SUPABASE MIGRATION: COMPLETE PERSISTENCE & RLS HARDENING
-- ============================================================================
-- Provisions all production tables for:
--   1. AI Website Studio (site_history, custom_templates, template_categories)
--   2. Email Campaigns & Gmail OAuth (email_accounts, email_campaigns, email_leads,
--      email_send_history, email_logs, email_suppression, email_suppressions)
--   3. SMS Campaigns & Telnyx (campaigns, sms_campaigns, campaign_leads,
--      sms_campaign_leads, telnyx_connections, sms_logs, sms_inbound)
--   4. Site Editor & Client PWA (business_profiles, booking_configs, site_addons,
--      invite_codes, oauth_states, places_lead_cache, credit_accounts, credit_ledger,
--      special_mode_sessions)
--   5. Row Level Security (RLS) across all public tables with tenant isolation
--      and scoped widget insert policies.
-- ============================================================================

-- 1. AI WEBSITE STUDIO: RECENT VIBE-CODED PROJECTS & HISTORY
CREATE TABLE IF NOT EXISTS public.site_history (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    parent_slug TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'Bespoke Business Website',
    niche TEXT NOT NULL DEFAULT 'Local Business',
    html TEXT NOT NULL,
    snapshot_label TEXT NOT NULL DEFAULT 'Build Snapshot',
    is_template BOOLEAN NOT NULL DEFAULT false,
    template_id TEXT,
    template_name TEXT,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_site_history_owner ON public.site_history (owner_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_history_slug ON public.site_history (parent_slug, owner_key);
CREATE INDEX IF NOT EXISTS idx_site_history_tmpl ON public.site_history (template_id, owner_key);

-- 2. AI WEBSITE STUDIO: CUSTOM TEMPLATES & CATEGORIES
CREATE TABLE IF NOT EXISTS public.custom_templates (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL DEFAULT 'dashboard',
    category_id TEXT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    niche TEXT NOT NULL DEFAULT 'General',
    raw_html TEXT NOT NULL,
    preview_html TEXT NOT NULL,
    style_tags TEXT DEFAULT '',
    used_count INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_custom_templates_owner ON public.custom_templates (owner_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_templates_slug ON public.custom_templates (slug);

CREATE TABLE IF NOT EXISTS public.template_categories (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL DEFAULT 'dashboard',
    name TEXT NOT NULL,
    slug TEXT NOT NULL DEFAULT '',
    emoji TEXT DEFAULT '',
    color TEXT DEFAULT '#2563EB',
    icon TEXT DEFAULT 'folder',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_template_categories_owner ON public.template_categories (owner_key, sort_order ASC);

-- 3. EMAIL CAMPAIGNS & SENDER ACCOUNTS
CREATE TABLE IF NOT EXISTS public.email_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    owner_key TEXT NOT NULL DEFAULT 'default_owner',
    email TEXT NOT NULL,
    display_name TEXT DEFAULT '',
    provider TEXT NOT NULL DEFAULT 'gmail',
    encrypted_refresh_token TEXT,
    encrypted_access_token TEXT,
    token_expires_at BIGINT,
    sends_today INTEGER NOT NULL DEFAULT 0,
    sends_this_week INTEGER NOT NULL DEFAULT 0,
    daily_cap INTEGER NOT NULL DEFAULT 80,
    health_score INTEGER NOT NULL DEFAULT 100,
    bounce_rate_7d NUMERIC(6, 2) NOT NULL DEFAULT 0,
    warmup_stage TEXT DEFAULT 'ready',
    status TEXT NOT NULL DEFAULT 'active',
    paused BOOLEAN NOT NULL DEFAULT false,
    last_successful_send BIGINT,
    last_reset_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()))::BIGINT,
    connected_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()))::BIGINT,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_email_accounts_owner ON public.email_accounts (owner_key);
CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON public.email_accounts (user_id);

CREATE TABLE IF NOT EXISTS public.email_campaigns (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    owner_key TEXT NOT NULL DEFAULT 'default_owner',
    name TEXT NOT NULL DEFAULT 'Email Outreach Campaign',
    niche TEXT NOT NULL DEFAULT 'General',
    template_id TEXT,
    template_key TEXT,
    lead_source TEXT DEFAULT 'dork',
    city TEXT DEFAULT '',
    category TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    account_id TEXT,
    subject TEXT DEFAULT '',
    email_subject TEXT DEFAULT '',
    body_html TEXT DEFAULT '',
    email_body TEXT DEFAULT '',
    csv_snapshot TEXT,
    target_volume INTEGER NOT NULL DEFAULT 50,
    total_leads INTEGER NOT NULL DEFAULT 0,
    leads_found INTEGER NOT NULL DEFAULT 0,
    emails_found INTEGER NOT NULL DEFAULT 0,
    sites_generated INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    emails_sent INTEGER NOT NULL DEFAULT 0,
    emails_delivered INTEGER NOT NULL DEFAULT 0,
    opened_count INTEGER NOT NULL DEFAULT 0,
    clicked_count INTEGER NOT NULL DEFAULT 0,
    bounced_count INTEGER NOT NULL DEFAULT 0,
    emails_bounced INTEGER NOT NULL DEFAULT 0,
    emails_failed INTEGER NOT NULL DEFAULT 0,
    credits_charged INTEGER NOT NULL DEFAULT 0,
    credits_refunded INTEGER NOT NULL DEFAULT 0,
    started_at BIGINT,
    completed_at BIGINT,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_owner ON public.email_campaigns (owner_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_user ON public.email_campaigns (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.email_leads (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    owner_key TEXT NOT NULL DEFAULT 'default_owner',
    business_name TEXT NOT NULL DEFAULT '',
    phone TEXT DEFAULT '',
    city TEXT DEFAULT '',
    website TEXT DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    email_source TEXT DEFAULT '',
    verification_status TEXT DEFAULT 'verified',
    slug TEXT DEFAULT '',
    site_url TEXT DEFAULT '',
    generated_site_url TEXT DEFAULT '',
    assigned_account_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    send_status TEXT NOT NULL DEFAULT 'pending',
    send_error TEXT,
    error_message TEXT,
    resend_id TEXT,
    sent_at BIGINT,
    index_in_campaign INTEGER DEFAULT 0,
    discovery_source TEXT DEFAULT '',
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_email_leads_campaign ON public.email_leads (campaign_id, send_status);

CREATE TABLE IF NOT EXISTS public.email_send_history (
    id BIGSERIAL PRIMARY KEY,
    account_id TEXT NOT NULL,
    campaign_id TEXT,
    lead_id TEXT,
    sent_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()))::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_email_send_hist_account ON public.email_send_history (account_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS public.email_logs (
    id BIGSERIAL PRIMARY KEY,
    lead_id TEXT,
    campaign_id TEXT,
    account_id TEXT,
    sent_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()))::BIGINT,
    delivery_status TEXT DEFAULT 'sent',
    bounce_status TEXT,
    error_code TEXT,
    error_message TEXT,
    subject TEXT,
    body_preview TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign ON public.email_logs (campaign_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS public.email_suppression (
    id BIGSERIAL PRIMARY KEY,
    owner_key TEXT NOT NULL DEFAULT 'default_owner',
    email TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT 'unsubscribe',
    source TEXT DEFAULT 'manual',
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_suppression_unique ON public.email_suppression (owner_key, lower(email));

CREATE TABLE IF NOT EXISTS public.email_suppressions (
    id BIGSERIAL PRIMARY KEY,
    owner_key TEXT NOT NULL DEFAULT 'default_owner',
    email TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT 'unsubscribe',
    source TEXT DEFAULT 'manual',
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_suppressions_unique ON public.email_suppressions (owner_key, lower(email));

-- 4. SMS CAMPAIGNS & TELNYX INTEGRATION
CREATE TABLE IF NOT EXISTS public.campaigns (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    name TEXT,
    niche TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    total_leads INTEGER NOT NULL DEFAULT 0,
    sites_generated INTEGER NOT NULL DEFAULT 0,
    sms_sent INTEGER NOT NULL DEFAULT 0,
    sms_failed INTEGER NOT NULL DEFAULT 0,
    sms_skipped INTEGER NOT NULL DEFAULT 0,
    credits_charged INTEGER NOT NULL DEFAULT 0,
    credits_refunded INTEGER NOT NULL DEFAULT 0,
    sms_template TEXT,
    csv_snapshot TEXT,
    started_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    completed_at BIGINT,
    type TEXT NOT NULL DEFAULT 'sms'
);
CREATE INDEX IF NOT EXISTS idx_campaigns_owner ON public.campaigns (owner_key, started_at DESC);

CREATE TABLE IF NOT EXISTS public.sms_campaigns (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    name TEXT,
    niche TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    total_leads INTEGER NOT NULL DEFAULT 0,
    sites_generated INTEGER NOT NULL DEFAULT 0,
    sms_sent INTEGER NOT NULL DEFAULT 0,
    sms_failed INTEGER NOT NULL DEFAULT 0,
    sms_skipped INTEGER NOT NULL DEFAULT 0,
    credits_charged INTEGER NOT NULL DEFAULT 0,
    credits_refunded INTEGER NOT NULL DEFAULT 0,
    sms_template TEXT,
    csv_snapshot TEXT,
    started_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    completed_at BIGINT,
    type TEXT NOT NULL DEFAULT 'sms'
);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_owner ON public.sms_campaigns (owner_key, started_at DESC);

CREATE TABLE IF NOT EXISTS public.campaign_leads (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    owner_key TEXT NOT NULL DEFAULT 'default_owner',
    name TEXT,
    phone TEXT NOT NULL DEFAULT '',
    email TEXT,
    city TEXT,
    niche TEXT,
    slug TEXT,
    site_url TEXT,
    site_status TEXT,
    sms_status TEXT NOT NULL DEFAULT 'pending',
    sms_error TEXT,
    index_in_campaign INTEGER DEFAULT 0,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_cid ON public.campaign_leads (campaign_id, index_in_campaign ASC);

CREATE TABLE IF NOT EXISTS public.sms_campaign_leads (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    owner_key TEXT NOT NULL DEFAULT 'default_owner',
    name TEXT,
    phone TEXT NOT NULL DEFAULT '',
    email TEXT,
    city TEXT,
    niche TEXT,
    slug TEXT,
    site_url TEXT,
    site_status TEXT,
    sms_status TEXT NOT NULL DEFAULT 'pending',
    sms_error TEXT,
    index_in_campaign INTEGER DEFAULT 0,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sms_campaign_leads_cid ON public.sms_campaign_leads (campaign_id, index_in_campaign ASC);

CREATE TABLE IF NOT EXISTS public.telnyx_connections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_email TEXT NOT NULL,
    account_label TEXT,
    encrypted_access_token TEXT NOT NULL,
    encrypted_refresh_token TEXT,
    expires_at BIGINT,
    total_numbers INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    connected_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()))::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_telnyx_connections_user ON public.telnyx_connections (user_id);

CREATE TABLE IF NOT EXISTS public.sms_logs (
    id TEXT PRIMARY KEY,
    campaign_id TEXT,
    lead_id TEXT,
    owner_key TEXT NOT NULL DEFAULT 'default_owner',
    to_number TEXT NOT NULL,
    from_number TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'queued',
    telnyx_id TEXT,
    error_code TEXT,
    error_message TEXT,
    segment_count INTEGER NOT NULL DEFAULT 1,
    cost_credits INTEGER NOT NULL DEFAULT 1,
    refunded BOOLEAN NOT NULL DEFAULT false,
    delivered_at BIGINT,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sms_logs_owner ON public.sms_logs (owner_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_telnyx_id ON public.sms_logs (telnyx_id);

CREATE TABLE IF NOT EXISTS public.sms_inbound (
    id TEXT PRIMARY KEY,
    telnyx_id TEXT,
    from_number TEXT NOT NULL,
    to_number TEXT NOT NULL,
    body TEXT NOT NULL,
    kind TEXT DEFAULT 'inbound',
    status TEXT DEFAULT 'received',
    raw TEXT,
    owner_key TEXT,
    received_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sms_inbound_created ON public.sms_inbound (created_at DESC);

-- 5. SITE EDITOR & CLIENT PWA PROFILES & OPERATIONAL TABLES
CREATE TABLE IF NOT EXISTS public.business_profiles (
    slug TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL DEFAULT 'default_owner',
    name TEXT NOT NULL DEFAULT '',
    niche TEXT DEFAULT '',
    tagline TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    phone_raw TEXT DEFAULT '',
    email TEXT DEFAULT '',
    address TEXT DEFAULT '',
    city TEXT DEFAULT '',
    state TEXT DEFAULT '',
    timezone TEXT DEFAULT '',
    logo_url TEXT,
    website_url TEXT,
    social_instagram TEXT DEFAULT '',
    social_facebook TEXT DEFAULT '',
    social_google_maps TEXT DEFAULT '',
    theme_accent TEXT DEFAULT '#059669',
    theme_accent_dark TEXT DEFAULT '#047857',
    theme_accent_soft TEXT DEFAULT '#ecfdf5',
    theme_accent_border TEXT DEFAULT '#a7f3d0',
    theme_radius TEXT DEFAULT 'lg',
    feature_booking BOOLEAN DEFAULT true,
    feature_chatbot BOOLEAN DEFAULT true,
    feature_email BOOLEAN DEFAULT true,
    feature_automations BOOLEAN DEFAULT true,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_business_profiles_owner ON public.business_profiles (owner_key);

CREATE TABLE IF NOT EXISTS public.oauth_states (
    state TEXT PRIMARY KEY,
    owner_key TEXT,
    provider TEXT,
    code_verifier TEXT,
    redirect_uri TEXT,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()))::BIGINT,
    expires_at BIGINT
);

CREATE TABLE IF NOT EXISTS public.places_lead_cache (
    searched_city_norm TEXT NOT NULL,
    niche_norm TEXT NOT NULL,
    place_id TEXT NOT NULL,
    business_name TEXT NOT NULL,
    resolved_city TEXT,
    state TEXT,
    phone TEXT,
    website TEXT,
    root_domain TEXT,
    email TEXT,
    email_host TEXT,
    discovery_method TEXT,
    source_query TEXT,
    source_page INTEGER DEFAULT 1,
    updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()))::BIGINT,
    PRIMARY KEY (searched_city_norm, niche_norm, place_id)
);

CREATE TABLE IF NOT EXISTS public.invite_codes (
    code TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    label TEXT,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    used_at BIGINT,
    last_active_at BIGINT,
    redeemed_count INTEGER NOT NULL DEFAULT 0,
    revoked_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_invite_codes_slug ON public.invite_codes (slug);

CREATE TABLE IF NOT EXISTS public.site_addons (
    slug TEXT PRIMARY KEY,
    booking_enabled BOOLEAN NOT NULL DEFAULT true,
    chatbot_enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS public.booking_configs (
    slug TEXT PRIMARY KEY,
    config_json TEXT NOT NULL DEFAULT '{}',
    updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS public.credit_accounts (
    owner_key TEXT PRIMARY KEY,
    plan TEXT NOT NULL DEFAULT 'Pro Plan',
    balance NUMERIC(14, 4) NOT NULL DEFAULT 1300,
    lifetime_used NUMERIC(14, 4) NOT NULL DEFAULT 0,
    lifetime_refunded NUMERIC(14, 4) NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS public.credit_ledger (
    id BIGSERIAL PRIMARY KEY,
    owner_key TEXT NOT NULL,
    delta NUMERIC(14, 4) NOT NULL,
    reason TEXT,
    ref_type TEXT,
    ref_id TEXT,
    balance_after NUMERIC(14, 4),
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_owner ON public.credit_ledger (owner_key, created_at DESC);

CREATE TABLE IF NOT EXISTS public.special_mode_sessions (
    owner_key TEXT PRIMARY KEY,
    mode TEXT,
    payout_email TEXT,
    activated_at BIGINT
);

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) HARDENING & TENANT ISOLATION POLICIES
-- ============================================================================

DO $$ 
DECLARE
    tbl TEXT;
    all_tbls TEXT[] := ARRAY[
        'user_credits', 'user_plans', 'ai_usage_ledger', 'ai_model_pricing',
        'credit_transactions', 'credit_accounts', 'credit_ledger',
        'site_history', 'custom_templates', 'template_categories',
        'email_accounts', 'email_campaigns', 'email_leads', 'email_send_history',
        'email_logs', 'email_suppression', 'email_suppressions',
        'campaigns', 'sms_campaigns', 'campaign_leads', 'sms_campaign_leads',
        'telnyx_connections', 'sms_logs', 'sms_inbound',
        'business_profiles', 'bookings', 'customers', 'automations',
        'chat_sessions', 'chat_messages', 'email_automation_jobs',
        'owner_businesses', 'affiliates', 'referrals', 'leads', 'tenants',
        'endpoint_rate_limits', 'user_sites', 'lunao_smoke_tests',
        'oauth_states', 'places_lead_cache', 'invite_codes', 'site_addons',
        'booking_configs', 'special_mode_sessions'
    ];
    owner_key_tbls TEXT[] := ARRAY[
        'site_history', 'custom_templates', 'template_categories',
        'email_accounts', 'email_campaigns', 'email_leads',
        'email_suppression', 'email_suppressions',
        'campaigns', 'sms_campaigns', 'campaign_leads', 'sms_campaign_leads',
        'sms_logs', 'business_profiles', 'owner_businesses', 'credit_accounts',
        'credit_ledger', 'special_mode_sessions'
    ];
    user_id_tbls TEXT[] := ARRAY[
        'user_credits', 'user_plans', 'ai_usage_ledger', 'credit_transactions',
        'telnyx_connections', 'affiliates'
    ];
BEGIN
    -- 6a. Enable RLS and grant full access to postgres & service_role on ALL tables
    FOREACH tbl IN ARRAY all_tbls LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
            EXECUTE format('DROP POLICY IF EXISTS %I_service_role_all ON public.%I;', tbl, tbl);
            EXECUTE format('CREATE POLICY %I_service_role_all ON public.%I FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);', tbl, tbl);
        END IF;
    END LOOP;

    -- 6b. Tenant Isolation for authenticated users on owner_key tables
    FOREACH tbl IN ARRAY owner_key_tbls LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'owner_key') THEN
            EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON public.%I;', tbl, tbl);
            EXECUTE format($pol$
                CREATE POLICY %I_tenant_isolation ON public.%I
                FOR ALL TO authenticated
                USING (
                    owner_key = COALESCE(
                        NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'owner_key'), ''),
                        NULLIF(auth.uid()::text, ''),
                        NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), ''),
                        NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'email'), '')
                    )
                )
                WITH CHECK (
                    owner_key = COALESCE(
                        NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'owner_key'), ''),
                        NULLIF(auth.uid()::text, ''),
                        NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), ''),
                        NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'email'), '')
                    )
                );
            $pol$, tbl, tbl);
        END IF;
    END LOOP;

    -- 6c. Tenant Isolation for authenticated users on user_id tables
    FOREACH tbl IN ARRAY user_id_tbls LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'user_id') THEN
            EXECUTE format('DROP POLICY IF EXISTS %I_user_isolation ON public.%I;', tbl, tbl);
            EXECUTE format($pol$
                CREATE POLICY %I_user_isolation ON public.%I
                FOR ALL TO authenticated
                USING (
                    user_id = COALESCE(
                        NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'owner_key'), ''),
                        NULLIF(auth.uid()::text, ''),
                        NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), ''),
                        NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'email'), '')
                    )
                )
                WITH CHECK (
                    user_id = COALESCE(
                        NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'owner_key'), ''),
                        NULLIF(auth.uid()::text, ''),
                        NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), ''),
                        NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'email'), '')
                    )
                );
            $pol$, tbl, tbl);
        END IF;
    END LOOP;
END $$;

-- 6d. Public read access for AI model pricing catalog
DROP POLICY IF EXISTS ai_model_pricing_public_read ON public.ai_model_pricing;
CREATE POLICY ai_model_pricing_public_read ON public.ai_model_pricing
    FOR SELECT TO anon, authenticated USING (true);

-- 6e. Scoped public INSERT access for live client widgets (bookings, leads, chat)
DROP POLICY IF EXISTS bookings_anon_insert ON public.bookings;
CREATE POLICY bookings_anon_insert ON public.bookings
    FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS chat_sessions_anon_insert ON public.chat_sessions;
CREATE POLICY chat_sessions_anon_insert ON public.chat_sessions
    FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS chat_messages_anon_insert ON public.chat_messages;
CREATE POLICY chat_messages_anon_insert ON public.chat_messages
    FOR INSERT TO anon, authenticated WITH CHECK (true);
