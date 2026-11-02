-- Migration: 20261029_create_ai_billing_and_pricing.sql
-- Multi-Provider AI Studio billing, versioned pricing registry, sub-cent accounting, and atomic reservations.

-- 1. AI Model Pricing Registry Table
CREATE TABLE IF NOT EXISTS ai_model_pricing (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  provider TEXT NOT NULL, -- 'google' or 'anthropic'
  display_name TEXT NOT NULL,
  description TEXT,
  speed_tier TEXT NOT NULL DEFAULT 'Balanced',
  reasoning_tier TEXT NOT NULL DEFAULT 'Standard',
  is_recommended BOOLEAN NOT NULL DEFAULT false,
  input_cost_per_million NUMERIC(14, 6) NOT NULL,
  output_cost_per_million NUMERIC(14, 6) NOT NULL,
  cached_read_cost_per_million NUMERIC(14, 6) NOT NULL DEFAULT 0,
  cache_write_cost_per_million NUMERIC(14, 6) NOT NULL DEFAULT 0,
  context_threshold INTEGER NOT NULL DEFAULT 128000,
  input_cost_per_million_tiered NUMERIC(14, 6),
  output_cost_per_million_tiered NUMERIC(14, 6),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT '2020-01-01T00:00:00Z',
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_model_pricing_lookup ON ai_model_pricing (model_id, effective_from DESC);

-- Populate authoritative pricing for 6 exact models
INSERT INTO ai_model_pricing (
  id, model_id, provider, display_name, description,
  speed_tier, reasoning_tier, is_recommended,
  input_cost_per_million, output_cost_per_million,
  cached_read_cost_per_million, cache_write_cost_per_million,
  context_threshold, input_cost_per_million_tiered, output_cost_per_million_tiered,
  effective_from, effective_until
) VALUES
(
  'gemini-3.5-flash-v1', 'gemini-3.5-flash', 'google', 'Gemini 3.5 Flash',
  'Ultra-fast multimodal generation with exceptional latency and high accuracy.',
  'Fast', 'Standard', false,
  0.075, 0.30, 0.01875, 0.0,
  128000, 0.15, 0.60,
  '2020-01-01T00:00:00Z', NULL
),
(
  'gemini-3.8-flash-v1', 'gemini-3.8-flash', 'google', 'Gemini 3.8 Flash',
  'Flagship workhorse for real-time frontend synthesis & live DOM compilation.',
  'Fastest', 'High', true,
  0.075, 0.30, 0.01875, 0.0,
  128000, 0.15, 0.60,
  '2020-01-01T00:00:00Z', '2026-12-31T23:59:59Z'
),
(
  'gemini-3.8-flash-2027', 'gemini-3.8-flash', 'google', 'Gemini 3.8 Flash (2027+)',
  'Updated rate tier effective Jan 1, 2027 onwards.',
  'Fastest', 'High', true,
  0.15, 0.60, 0.0375, 0.0,
  128000, 0.30, 1.20,
  '2027-01-01T00:00:00Z', NULL
),
(
  'gemini-3.1-pro-preview-v1', 'gemini-3.1-pro-preview', 'google', 'Gemini 3.1 Pro Preview',
  'Heavyweight reasoning model for complex architectural refactoring and rich micro-interactions.',
  'Balanced', 'Deep Reasoning', false,
  1.25, 5.00, 0.3125, 0.0,
  128000, 2.50, 10.00,
  '2020-01-01T00:00:00Z', NULL
),
(
  'claude-haiku-5-5-v1', 'claude-haiku-5-5', 'anthropic', 'Claude Haiku 5.5',
  'Rapid response Claude engine for instant text tweaks, SEO meta, and copy polish.',
  'Fast', 'Standard', false,
  0.80, 4.00, 0.08, 1.00,
  200000, 0.80, 4.00,
  '2020-01-01T00:00:00Z', NULL
),
(
  'claude-sonnet-5-5-v1', 'claude-sonnet-5-5', 'anthropic', 'Claude Sonnet 5.5',
  'State-of-the-art coding intelligence with deep semantic understanding of CSS & DOM layout.',
  'Balanced', 'Advanced', false,
  3.00, 15.00, 0.30, 3.75,
  200000, 3.00, 15.00,
  '2020-01-01T00:00:00Z', NULL
),
(
  'claude-fable-5-1-v1', 'claude-fable-5-1', 'anthropic', 'Claude Fable 5.1',
  'Editorial storytelling and brand voice tuning for high-converting marketing copy.',
  'Balanced', 'Advanced', false,
  3.00, 15.00, 0.30, 3.75,
  200000, 3.00, 15.00,
  '2020-01-01T00:00:00Z', NULL
)
ON CONFLICT (id) DO UPDATE SET
  model_id = EXCLUDED.model_id,
  provider = EXCLUDED.provider,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  speed_tier = EXCLUDED.speed_tier,
  reasoning_tier = EXCLUDED.reasoning_tier,
  is_recommended = EXCLUDED.is_recommended,
  input_cost_per_million = EXCLUDED.input_cost_per_million,
  output_cost_per_million = EXCLUDED.output_cost_per_million,
  cached_read_cost_per_million = EXCLUDED.cached_read_cost_per_million,
  cache_write_cost_per_million = EXCLUDED.cache_write_cost_per_million,
  context_threshold = EXCLUDED.context_threshold,
  input_cost_per_million_tiered = EXCLUDED.input_cost_per_million_tiered,
  output_cost_per_million_tiered = EXCLUDED.output_cost_per_million_tiered,
  effective_from = EXCLUDED.effective_from,
  effective_until = EXCLUDED.effective_until;

-- 2. Durable AI Usage Ledger Table
CREATE TABLE IF NOT EXISTS ai_usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  tenant_id TEXT,
  request_id TEXT UNIQUE NOT NULL,
  reservation_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'settled', 'refunded', 'failed', 'cancelled')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_preview TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  thought_tokens INTEGER NOT NULL DEFAULT 0,
  cached_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  reserved_cost_usd NUMERIC(14, 8) NOT NULL DEFAULT 0,
  reserved_credits NUMERIC(14, 4) NOT NULL DEFAULT 0,
  actual_cost_usd NUMERIC(14, 8) NOT NULL DEFAULT 0,
  actual_credits NUMERIC(14, 4) NOT NULL DEFAULT 0,
  balance_credits_after NUMERIC(14, 4),
  latency_ms INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_ledger_user ON ai_usage_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_ledger_req ON ai_usage_ledger (request_id);

-- 3. Upgrade user_credits and user_plans schema for decimal credits & cycle rollover
ALTER TABLE user_credits ALTER COLUMN ai_credits_balance TYPE NUMERIC(14, 4) USING ai_credits_balance::NUMERIC;
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS ai_cycle_start TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS ai_cycle_end TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days';

ALTER TABLE user_plans ADD COLUMN IF NOT EXISTS monthly_ai_credits NUMERIC(14, 4) DEFAULT 600;

-- 4. Stored Procedure: Atomic AI Budget Reservation
CREATE OR REPLACE FUNCTION reserve_ai_budget(
  p_user_id TEXT,
  p_request_id TEXT,
  p_estimated_credits NUMERIC,
  p_model TEXT,
  p_provider TEXT,
  p_prompt_preview TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_credits NUMERIC;
  v_cycle_end TIMESTAMPTZ;
  v_plan_tier TEXT;
  v_monthly_credits NUMERIC;
  v_monthly_usd NUMERIC;
  v_now TIMESTAMPTZ := NOW();
  v_reserved_cost_usd NUMERIC;
BEGIN
  -- 1. Ensure user row exists in user_plans
  SELECT plan_tier, monthly_ai_credits, monthly_ai_allowance_usd 
  INTO v_plan_tier, v_monthly_credits, v_monthly_usd
  FROM user_plans WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    v_plan_tier := 'Free Plan';
    v_monthly_credits := 15;
    v_monthly_usd := 0.15;
    INSERT INTO user_plans (user_id, plan_tier, monthly_action_credits, monthly_ai_allowance_usd, monthly_ai_credits, ai_credits_balance, updated_at)
    VALUES (p_user_id, v_plan_tier, 15, v_monthly_usd, v_monthly_credits, v_monthly_credits, (EXTRACT(EPOCH FROM v_now)*1000)::BIGINT)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- 2. Lock & fetch user_credits
  SELECT ai_credits_balance, ai_cycle_end 
  INTO v_current_credits, v_cycle_end
  FROM user_credits WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_current_credits := COALESCE(v_monthly_credits, 15);
    INSERT INTO user_credits (user_id, action_credits_balance, ai_credits_balance, ai_dollars_spent, ai_cycle_start, ai_cycle_end, updated_at)
    VALUES (p_user_id, 15, v_current_credits, 0.0000, v_now, v_now + INTERVAL '30 days', (EXTRACT(EPOCH FROM v_now)*1000)::BIGINT);
  ELSIF (v_current_credits IS NULL OR v_current_credits <= 0) AND (SELECT ai_dollars_spent FROM user_credits WHERE user_id = p_user_id) = 0 THEN
    v_current_credits := COALESCE(v_monthly_credits, 15);
    UPDATE user_credits
    SET ai_credits_balance = v_current_credits,
        updated_at = (EXTRACT(EPOCH FROM v_now)*1000)::BIGINT
    WHERE user_id = p_user_id;
  ELSIF v_cycle_end IS NOT NULL AND v_now > v_cycle_end THEN
    -- Rollover billing cycle
    v_current_credits := COALESCE(v_monthly_credits, 15);
    UPDATE user_credits 
    SET ai_credits_balance = v_current_credits,
        ai_dollars_spent = 0.0000,
        ai_cycle_start = v_now,
        ai_cycle_end = v_now + INTERVAL '30 days',
        updated_at = (EXTRACT(EPOCH FROM v_now)*1000)::BIGINT
    WHERE user_id = p_user_id;
  END IF;

  -- 3. Check sufficient balance (> 0)
  IF v_current_credits <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'INSUFFICIENT_CREDITS',
      'message', 'Insufficient AI credits (0 remaining). Please upgrade your plan in Subscription Plans.',
      'balance', v_current_credits,
      'needed', p_estimated_credits
    );
  END IF;

  -- 4. Do NOT pre-deduct credits during preflight reservation.
  -- Credits are strictly deducted in settle_ai_usage ONLY after the AI writes valid code.
  v_reserved_cost_usd := p_estimated_credits / 100.0;

  -- 5. Record pending reservation in ledger
  INSERT INTO ai_usage_ledger (
    user_id,
    request_id,
    reservation_id,
    status,
    provider,
    model,
    prompt_preview,
    reserved_cost_usd,
    reserved_credits,
    balance_credits_after,
    created_at
  )
  VALUES (
    p_user_id,
    p_request_id,
    p_request_id,
    'reserved',
    p_provider,
    p_model,
    p_prompt_preview,
    v_reserved_cost_usd,
    p_estimated_credits,
    v_current_credits,
    v_now
  )
  ON CONFLICT (request_id) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'reservation_id', p_request_id,
    'reserved_credits', p_estimated_credits,
    'remaining_balance', v_current_credits,
    'plan', v_plan_tier
  );
END;
$$;

-- 5. Stored Procedure: Atomic AI Usage Settlement (100 AI credits = $1.00 USD)
CREATE OR REPLACE FUNCTION settle_ai_usage(
  p_request_id TEXT,
  p_actual_cost_usd NUMERIC,
  p_actual_credits NUMERIC,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_thought_tokens INTEGER,
  p_cached_read_tokens INTEGER,
  p_cache_write_tokens INTEGER,
  p_total_tokens INTEGER,
  p_latency_ms INTEGER,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_ledger ai_usage_ledger%ROWTYPE;
  v_new_balance NUMERIC;
  v_now TIMESTAMPTZ := NOW();
  v_now_ms BIGINT := (EXTRACT(EPOCH FROM v_now)*1000)::BIGINT;
BEGIN
  -- 1. Find reservation in ledger
  SELECT * INTO v_ledger
  FROM ai_usage_ledger
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RESERVATION_NOT_FOUND');
  END IF;

  -- Idempotency check: if already settled or refunded, return current row
  IF v_ledger.status IN ('settled', 'refunded', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'status', v_ledger.status,
      'actual_credits', v_ledger.actual_credits,
      'actual_cost_usd', v_ledger.actual_cost_usd,
      'balance_after', v_ledger.balance_credits_after
    );
  END IF;

  -- 2. If status is failed or cancelled, ZERO credits deducted
  IF p_status IN ('failed', 'cancelled') THEN
    SELECT ai_credits_balance INTO v_new_balance
    FROM user_credits WHERE user_id = v_ledger.user_id;

    UPDATE ai_usage_ledger
    SET status = p_status,
        actual_cost_usd = 0,
        actual_credits = 0,
        balance_credits_after = v_new_balance,
        error_message = p_error_message,
        latency_ms = p_latency_ms,
        settled_at = v_now,
        metadata = COALESCE(p_metadata, '{}'::jsonb)
    WHERE id = v_ledger.id;

    RETURN jsonb_build_object(
      'ok', true,
      'status', p_status,
      'actual_cost_usd', 0,
      'actual_credits', 0,
      'balance_after', v_new_balance
    );
  END IF;

  -- 3. Successful generation: deduct exact real usage credits (100 credits = $1.00 USD)
  UPDATE user_credits
  SET ai_credits_balance = GREATEST(0, ai_credits_balance - p_actual_credits),
      ai_dollars_spent = ai_dollars_spent + p_actual_cost_usd,
      updated_at = v_now_ms
  WHERE user_id = v_ledger.user_id
  RETURNING ai_credits_balance INTO v_new_balance;

  -- Mirror balance into user_plans so both tables remain 100% synced
  UPDATE user_plans
  SET ai_credits_balance = v_new_balance,
      updated_at = v_now_ms
  WHERE user_id = v_ledger.user_id;

  UPDATE ai_usage_ledger
  SET status = 'settled',
      actual_cost_usd = p_actual_cost_usd,
      actual_credits = p_actual_credits,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      thought_tokens = p_thought_tokens,
      cached_read_tokens = p_cached_read_tokens,
      cache_write_tokens = p_cache_write_tokens,
      total_tokens = p_total_tokens,
      latency_ms = p_latency_ms,
      balance_credits_after = v_new_balance,
      error_message = p_error_message,
      metadata = COALESCE(p_metadata, '{}'::jsonb),
      settled_at = v_now
  WHERE id = v_ledger.id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'settled',
    'actual_cost_usd', p_actual_cost_usd,
    'actual_credits', p_actual_credits,
    'balance_after', v_new_balance
  );
END;
$$;

-- 6. Stored Procedure: Synchronize User Plan & Monthly AI Allowance
CREATE OR REPLACE FUNCTION sync_user_ai_plan(
  p_user_id TEXT,
  p_plan_tier TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_norm TEXT := LOWER(TRIM(COALESCE(p_plan_tier, 'Starter Plan')));
  v_canonical_plan TEXT;
  v_monthly_ai_credits NUMERIC;
  v_monthly_ai_usd NUMERIC;
  v_monthly_action_credits INTEGER;
  v_now TIMESTAMPTZ := NOW();
  v_now_ms BIGINT := (EXTRACT(EPOCH FROM v_now)*1000)::BIGINT;
  v_new_balance NUMERIC;
BEGIN
  IF v_norm LIKE '%agency%' THEN
    v_canonical_plan := 'Agency Plan';
    v_monthly_ai_credits := 2000;
    v_monthly_ai_usd := 20.00;
    v_monthly_action_credits := 12000;
  ELSIF v_norm LIKE '%pro%' OR v_norm LIKE '%growth%' THEN
    v_canonical_plan := 'Pro Plan';
    v_monthly_ai_credits := 1300;
    v_monthly_ai_usd := 13.00;
    v_monthly_action_credits := 6500;
  ELSIF v_norm LIKE '%starter%' THEN
    v_canonical_plan := 'Starter Plan';
    v_monthly_ai_credits := 600;
    v_monthly_ai_usd := 6.00;
    v_monthly_action_credits := 2500;
  ELSE
    v_canonical_plan := 'Free Plan';
    v_monthly_ai_credits := 15;
    v_monthly_ai_usd := 0.15;
    v_monthly_action_credits := 15;
  END IF;

  INSERT INTO user_plans (
    user_id, plan_tier, monthly_action_credits, monthly_ai_allowance_usd, monthly_ai_credits, ai_credits_balance, updated_at
  )
  VALUES (
    p_user_id, v_canonical_plan, v_monthly_action_credits, v_monthly_ai_usd, v_monthly_ai_credits, v_monthly_ai_credits, v_now_ms
  )
  ON CONFLICT (user_id) DO UPDATE SET
    plan_tier = EXCLUDED.plan_tier,
    monthly_action_credits = EXCLUDED.monthly_action_credits,
    monthly_ai_allowance_usd = EXCLUDED.monthly_ai_allowance_usd,
    monthly_ai_credits = EXCLUDED.monthly_ai_credits,
    ai_credits_balance = CASE
      WHEN user_plans.plan_tier IS DISTINCT FROM EXCLUDED.plan_tier THEN EXCLUDED.monthly_ai_credits
      ELSE GREATEST(COALESCE(user_plans.ai_credits_balance, 0), 0)
    END,
    updated_at = v_now_ms;

  INSERT INTO user_credits (
    user_id, action_credits_balance, ai_credits_balance, ai_dollars_spent, ai_cycle_start, ai_cycle_end, updated_at
  )
  VALUES (
    p_user_id, v_monthly_action_credits, v_monthly_ai_credits, 0.0000, v_now, v_now + INTERVAL '30 days', v_now_ms
  )
  ON CONFLICT (user_id) DO UPDATE SET
    ai_credits_balance = v_monthly_ai_credits,
    ai_dollars_spent = 0.0000,
    ai_cycle_start = v_now,
    ai_cycle_end = v_now + INTERVAL '30 days',
    updated_at = v_now_ms
  RETURNING ai_credits_balance INTO v_new_balance;

  UPDATE user_plans
  SET ai_credits_balance = v_new_balance
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'plan', v_canonical_plan,
    'monthly_credits', v_monthly_ai_credits,
    'monthly_allowance_usd', v_monthly_ai_usd,
    'balance_credits', v_new_balance
  );
END;
$$;
