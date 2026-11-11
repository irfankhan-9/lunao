-- Free-tier AI Vibe Coding credits: every Free-plan user receives 15 one-time AI credits
-- (15 credits = $0.15 provider cost; 100 AI credits = $1.00).
--
-- Additive + idempotent: no columns/tables dropped or renamed, no existing balance is reset.
-- The server (server/lib/ai/accountingService.js -> grantFreeVibeCreditsOnce) also self-heals
-- this on first read, so this migration is a bulk backfill of existing Free users.

-- 1. One-time grant marker. NULL = never granted. Set atomically at grant time so that
--    plan toggling (Free <-> paid) can never grant the credits twice.
ALTER TABLE public.user_credits ADD COLUMN IF NOT EXISTS free_vibe_granted_at BIGINT;

-- 2. Backfill existing Free-plan users (exactly once per user).
--    - ai_credits_balance is ADDED to (never overwritten), so any existing balance is preserved.
--    - updated_at is intentionally untouched: it carries the fractional action-credit tail (700..709).
WITH to_grant AS (
  UPDATE public.user_credits uc
  SET ai_credits_balance = COALESCE(uc.ai_credits_balance, 0) + 15,
      free_vibe_granted_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
  FROM public.user_plans up
  WHERE up.user_id = uc.user_id
    AND COALESCE(up.plan_tier, 'Free Plan') = 'Free Plan'
    AND uc.free_vibe_granted_at IS NULL
  RETURNING uc.user_id, uc.ai_credits_balance
),
mirror AS (
  UPDATE public.user_plans up
  SET ai_credits_balance = ROUND(g.ai_credits_balance)::INT,
      monthly_ai_credits = GREATEST(COALESCE(up.monthly_ai_credits, 0), 15)
  FROM to_grant g
  WHERE up.user_id = g.user_id
  RETURNING up.user_id
)
INSERT INTO public.credit_transactions (user_id, action_type, credits_charged, description, created_at)
SELECT g.user_id,
       'free_vibe_grant',
       0, -- action-credit ledger is unaffected; the AI grant is described below
       'Free plan one-time grant: 15 AI Vibe Coding credits',
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
FROM to_grant g;

-- 3. Keep the (currently unused by the server) stored procedures consistent with the
--    free grant: a Free plan's AI allowance is 15 credits ($0.15).
--    NOTE: sync_user_ai_plan / reserve_ai_budget from 20261029 already use 15 for Free; they are
--    left untouched on purpose because they reset balances on conflict and are not called by the app.
