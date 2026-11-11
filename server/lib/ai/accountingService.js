// Accounting Service for AI Web Studio
// Manages atomic credit reservations, settlements, plan allowances, and ledger persistence.
// Authoritative persistence via Supabase REST API (IPv4 HTTPS) + PostgreSQL pool + local memory cache.
import { getPgPool } from '../supabase.js';
import { supabase as supabaseCfg } from '../config.js';
import { calculateUsageCost, getModelRates, normalizeModelId } from './pricingRegistry.js';

// Local in-memory reserve cache synced with Supabase REST
const _localAccounts = new Map();
const _localLedger = new Map();

let _sbAiCircuitBreakerUntil = 0;
function isSbAiDegraded() {
  return Date.now() < _sbAiCircuitBreakerUntil;
}
function tripSbAiCircuitBreaker(ttlMs = 45000) {
  _sbAiCircuitBreakerUntil = Date.now() + ttlMs;
}
function resetSbAiCircuitBreaker() {
  _sbAiCircuitBreakerUntil = 0;
}

// One-time AI Vibe Coding credits granted to every Free-plan account (15 credits = $0.15).
// This is NOT a monthly allowance: it is granted exactly once per account, tracked by
// user_credits.free_vibe_granted_at (see grantFreeVibeCreditsOnce).
export const FREE_VIBE_CREDITS = 15;

// Free accounts may only use low-cost Flash-tier models so the $0.15 grant stays bounded.
export const FREE_ALLOWED_MODEL_IDS = ['gemini-3.5-flash', 'gemini-3.8-flash'];

export function isFreePlanName(planName) {
  return getPlanConfig(planName) === PLAN_ALLOWANCES['Free Plan'];
}

export const PLAN_ALLOWANCES = {
  'Free Plan': { monthlyUsd: 0.15, monthlyCredits: FREE_VIBE_CREDITS, priceUsd: 0 },
  'Starter Plan': { monthlyUsd: 6.00, monthlyCredits: 600, priceUsd: 97 },
  'Pro Plan': { monthlyUsd: 13.00, monthlyCredits: 1300, priceUsd: 187 },
  'Agency Plan': { monthlyUsd: 20.00, monthlyCredits: 2000, priceUsd: 297 },
};

export function getPlanConfig(planName) {
  const norm = String(planName || '').trim().toLowerCase();
  if (norm.includes('agency')) return PLAN_ALLOWANCES['Agency Plan'];
  if (norm.includes('pro') || norm.includes('growth')) return PLAN_ALLOWANCES['Pro Plan'];
  if (norm.includes('starter')) return PLAN_ALLOWANCES['Starter Plan'];
  return PLAN_ALLOWANCES['Free Plan'];
}

function getSupabaseRestCredentials() {
  const sbUrl = process.env.SUPABASE_URL || supabaseCfg?.url || 'https://wqlbuadknltsjfzrltpe.supabase.co';
  const sbKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseCfg?.secretKey || '';
  return { sbUrl, sbKey };
}

/**
 * Helper: Fetch user's current plan and AI credit row directly from Supabase REST API.
 */
async function fetchSupabaseAiAccount(userId) {
  if (isSbAiDegraded()) return null;
  const { sbUrl, sbKey } = getSupabaseRestCredentials();
  if (!sbUrl || !sbKey || !userId) return null;
  try {
    const [planRes, credRes] = await Promise.all([
      fetch(
        `${sbUrl}/rest/v1/user_plans?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
        {
          headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
          signal: AbortSignal.timeout(1000),
        }
      ),
      fetch(
        `${sbUrl}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
        {
          headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
          signal: AbortSignal.timeout(1000),
        }
      ),
    ]);
    const planRows = planRes.ok ? await planRes.json() : [];
    const credRows = credRes.ok ? await credRes.json() : [];
    const planRow = Array.isArray(planRows) && planRows.length > 0 ? planRows[0] : null;
    const credRow = Array.isArray(credRows) && credRows.length > 0 ? credRows[0] : null;
    if (!planRow && !credRow) return null;
    resetSbAiCircuitBreaker();
    return { planRow, credRow };
  } catch (err) {
    tripSbAiCircuitBreaker(45000);
    console.warn('[accountingService] Supabase REST fetch notice:', err.message);
    return null;
  }
}

/**
 * Helper: Persist updated AI credit balance and dollars spent to Supabase REST (`user_credits` & `user_plans`).
 */
export async function persistSupabaseAiBalance(userId, newBalance, newDollarsSpent, planName = null) {
  const { sbUrl, sbKey } = getSupabaseRestCredentials();
  if (!sbUrl || !sbKey || !userId) return false;
  const safeBalance = Math.max(0, Number(Number(newBalance || 0).toFixed(4)));
  const safeDollars = Math.max(0, Number(Number(newDollarsSpent || 0).toFixed(6)));
  // Preserve fractional encoding in updated_at if row exists, or use standard timestamp
  try {
    const existingRes = await fetch(
      `${sbUrl}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(userId)}&select=action_credits_balance,updated_at&limit=1`,
      {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
        signal: AbortSignal.timeout(3500),
      }
    );
    const existingRows = existingRes.ok ? await existingRes.json() : [];
    const existingRow = Array.isArray(existingRows) && existingRows.length > 0 ? existingRows[0] : null;

    // Keep the action_credits_balance fractional tail (700..709) intact when updating updated_at!
    let nextUpdatedAt = Date.now();
    if (existingRow && typeof existingRow.updated_at === 'number') {
      const tail = Number(existingRow.updated_at) % 1000;
      if (tail >= 700 && tail <= 709) {
        nextUpdatedAt = Math.floor(Date.now() / 1000) * 1000 + tail;
      }
    }

    const credPatch = await fetch(
      `${sbUrl}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ai_credits_balance: safeBalance,
          ai_dollars_spent: safeDollars,
          updated_at: nextUpdatedAt,
        }),
        signal: AbortSignal.timeout(4000),
      }
    );

    if (!existingRow || !credPatch.ok) {
      await fetch(`${sbUrl}/rest/v1/user_credits`, {
        method: 'POST',
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          user_id: userId,
          action_credits_balance: 15,
          ai_credits_balance: safeBalance,
          ai_dollars_spent: safeDollars,
          updated_at: nextUpdatedAt,
        }),
        signal: AbortSignal.timeout(4000),
      });
    }

    // Note: user_plans.ai_credits_balance is an integer column in PostgREST, so round for user_plans while keeping exact numeric(12,4) in user_credits
    const planPatchBody = {
      ai_credits_balance: Math.round(safeBalance),
      updated_at: nextUpdatedAt,
    };
    if (planName) {
      planPatchBody.plan_tier = planName;
    }

    await fetch(
      `${sbUrl}/rest/v1/user_plans?user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(planPatchBody),
        signal: AbortSignal.timeout(4000),
      }
    );
    return true;
  } catch (err) {
    console.warn('[accountingService] Supabase REST balance update notice:', err.message);
    return false;
  }
}

// Accounts we have already verified/granted in this process (avoids a DB round-trip per request).
const _freeVibeGrantSettled = new Set();
let _freeVibeColumnEnsured = false;

/**
 * Best-effort: add user_credits.free_vibe_granted_at if the migration has not been applied yet
 * (same self-healing approach credits.js uses for plan_expires_at). No-op without a Postgres pool.
 */
async function ensureFreeVibeColumn() {
  if (_freeVibeColumnEnsured) return;
  const pool = getPgPool();
  if (!pool) return;
  try {
    await pool.query('ALTER TABLE public.user_credits ADD COLUMN IF NOT EXISTS free_vibe_granted_at BIGINT');
    await pool.query("NOTIFY pgrst, 'reload schema'").catch(() => {});
    _freeVibeColumnEnsured = true;
    // Give PostgREST a moment to pick up the new column.
    await new Promise((r) => setTimeout(r, 400));
  } catch (err) {
    console.warn('[accountingService] ensureFreeVibeColumn notice:', err.message);
  }
}

/**
 * Grant the one-time FREE_VIBE_CREDITS to a Free-plan account.
 *
 * Safety properties:
 *  - Atomic claim: PATCH ... WHERE free_vibe_granted_at IS NULL. Only one concurrent caller gets a row back,
 *    so the credits can never be granted twice (also not across Free -> paid -> Free toggling).
 *  - Additive: new balance = existing balance + grant. Existing balances are never overwritten.
 *  - Free plan only: paid accounts are skipped (they get their plan allowance instead).
 *
 * Returns { granted: boolean, balance?: number }.
 */
export async function grantFreeVibeCreditsOnce(userId, knownPlanName = null) {
  if (!userId || _freeVibeGrantSettled.has(userId)) return { granted: false };
  const { sbUrl, sbKey } = getSupabaseRestCredentials();
  if (!sbUrl || !sbKey || isSbAiDegraded()) return { granted: false };

  const headers = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' };
  const enc = encodeURIComponent(userId);

  try {
    let plan = knownPlanName;
    if (!plan) {
      const planRes = await fetch(`${sbUrl}/rest/v1/user_plans?user_id=eq.${enc}&select=plan_tier&limit=1`, {
        headers,
        signal: AbortSignal.timeout(2500),
      });
      const planRows = planRes.ok ? await planRes.json() : [];
      plan = Array.isArray(planRows) && planRows[0] ? planRows[0].plan_tier || 'Free Plan' : null;
    }
    // No plan row yet (account not provisioned) or a paid plan: nothing to grant here.
    if (!plan) return { granted: false };
    if (!isFreePlanName(plan)) return { granted: false };

    const claim = async () =>
      fetch(`${sbUrl}/rest/v1/user_credits?user_id=eq.${enc}&free_vibe_granted_at=is.null`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ free_vibe_granted_at: Date.now() }),
        signal: AbortSignal.timeout(3500),
      });

    let claimRes = await claim();
    if (!claimRes.ok) {
      // Column missing (migration pending): add it, then retry once.
      await ensureFreeVibeColumn();
      claimRes = await claim();
      if (!claimRes.ok) {
        console.warn('[accountingService] free vibe grant claim failed:', claimRes.status);
        return { granted: false };
      }
    }
    const claimed = await claimRes.json();
    if (!Array.isArray(claimed) || claimed.length === 0) {
      // Either already granted earlier, or no user_credits row yet. Only cache the "already granted" case.
      const chk = await fetch(`${sbUrl}/rest/v1/user_credits?user_id=eq.${enc}&select=free_vibe_granted_at&limit=1`, {
        headers,
        signal: AbortSignal.timeout(2500),
      });
      const chkRows = chk.ok ? await chk.json() : [];
      if (Array.isArray(chkRows) && chkRows[0]?.free_vibe_granted_at) _freeVibeGrantSettled.add(userId);
      return { granted: false };
    }

    // We won the claim. Add the grant on top of whatever balance exists.
    const row = claimed[0];
    const priorBalance = Number(row.ai_credits_balance || 0);
    const newBalance = Number((priorBalance + FREE_VIBE_CREDITS).toFixed(4));
    const spent = Number(row.ai_dollars_spent || 0);
    const persisted = await persistSupabaseAiBalance(userId, newBalance, spent);
    if (!persisted) {
      // Roll the claim back so the grant is retried on the next call instead of being lost.
      await fetch(`${sbUrl}/rest/v1/user_credits?user_id=eq.${enc}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ free_vibe_granted_at: null }),
        signal: AbortSignal.timeout(3500),
      }).catch(() => {});
      return { granted: false };
    }

    _freeVibeGrantSettled.add(userId);
    _localAccounts.set(userId, {
      userId,
      plan: 'Free Plan',
      balance: newBalance,
      monthlyCredits: FREE_VIBE_CREDITS,
      dollarsSpent: spent,
    });

    // Audit trail (best effort). Action-credit ledger value stays 0; description carries the AI grant.
    fetch(`${sbUrl}/rest/v1/credit_transactions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: userId,
        action_type: 'free_vibe_grant',
        credits_charged: 0,
        description: `Free plan one-time grant: ${FREE_VIBE_CREDITS} AI Vibe Coding credits`,
        created_at: Date.now(),
      }),
      signal: AbortSignal.timeout(3500),
    }).catch(() => {});

    console.log(`[accountingService] Granted ${FREE_VIBE_CREDITS} free vibe credits to ${userId} (balance ${newBalance})`);
    return { granted: true, balance: newBalance };
  } catch (err) {
    console.warn('[accountingService] grantFreeVibeCreditsOnce notice:', err.message);
    return { granted: false };
  }
}

/**
 * Helper: Insert or update an AI usage ledger record in Supabase REST `ai_usage_ledger`.
 */
async function upsertSupabaseLedgerRow(rowPayload) {
  const { sbUrl, sbKey } = getSupabaseRestCredentials();
  if (!sbUrl || !sbKey || !rowPayload?.request_id) return null;
  try {
    // Check if request_id already exists
    const checkRes = await fetch(
      `${sbUrl}/rest/v1/ai_usage_ledger?request_id=eq.${encodeURIComponent(rowPayload.request_id)}&select=id,status,actual_credits,actual_cost_usd,balance_credits_after&limit=1`,
      {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
        signal: AbortSignal.timeout(3500),
      }
    );
    const existing = checkRes.ok ? await checkRes.json() : [];
    if (Array.isArray(existing) && existing.length > 0) {
      const patchRes = await fetch(
        `${sbUrl}/rest/v1/ai_usage_ledger?request_id=eq.${encodeURIComponent(rowPayload.request_id)}`,
        {
          method: 'PATCH',
          headers: {
            apikey: sbKey,
            Authorization: `Bearer ${sbKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify(rowPayload),
          signal: AbortSignal.timeout(4000),
        }
      );
      if (patchRes.ok) {
        const rows = await patchRes.json();
        return Array.isArray(rows) ? rows[0] : null;
      }
      return existing[0];
    }

    const postRes = await fetch(`${sbUrl}/rest/v1/ai_usage_ledger`, {
      method: 'POST',
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(rowPayload),
      signal: AbortSignal.timeout(4000),
    });
    if (postRes.ok) {
      const rows = await postRes.json();
      return Array.isArray(rows) ? rows[0] : null;
    }
  } catch (err) {
    console.warn('[accountingService] Supabase REST ledger upsert notice:', err.message);
  }
  return null;
}

/**
 * Estimate worst-case credits needed for preflight reservation.
 * Formula: (estInputTokens * inputRate + maxOutputTokens * outputRate) / 1M * 100
 */
export async function estimateCreditsNeeded(modelId, promptText = '', maxOutputTokens = 8192) {
  const normId = normalizeModelId(modelId);
  const rates = await getModelRates(normId);

  // Approximate 1 token = 4 characters
  const estInputTokens = Math.max(100, Math.ceil((promptText.length || 1000) / 4));
  const estOutputTokens = Math.min(maxOutputTokens, 8192);

  const estCostUsd = ((estInputTokens * rates.inputCostPerMillion) + (estOutputTokens * rates.outputCostPerMillion)) / 1000000;
  const estCredits = Number((estCostUsd * 100).toFixed(4));

  // Minimum reservation is 0.01 credits
  return Math.max(0.01, estCredits);
}

/**
 * Atomic preflight reservation before sending request to provider.
 * Uses authoritative Supabase REST balance first so custom or remaining balances (e.g. 10 credits)
 * are never overwritten by plan defaults (600 credits).
 */
export async function reserveBudget({
  userId,
  requestId,
  modelId,
  promptText = '',
  maxOutputTokens = 8192,
  planHint = null,
}) {
  if (!userId) {
    throw Object.assign(new Error('userId is required for AI generation'), { status: 400 });
  }
  const normModel = normalizeModelId(modelId);
  const rates = await getModelRates(normModel);
  const estimatedCredits = await estimateCreditsNeeded(normModel, promptText, maxOutputTokens);
  const promptPreview = promptText.slice(0, 150);

  // 1. Authoritative Supabase REST status lookup
  const status = await getUserAiStatus(userId, planHint);
  const currentBalance = Number(status?.balanceCredits ?? 0);
  const activePlan = status?.plan || planHint || 'Free Plan';

  const isFreeAccount = isFreePlanName(activePlan);

  // Free accounts run on the one-time grant: Flash-tier models only, and no overdraft.
  if (isFreeAccount && !FREE_ALLOWED_MODEL_IDS.includes(normModel)) {
    const err = new Error(
      'This model is available on Starter, Pro and Agency plans. Free accounts can use Gemini Flash models with their free vibe-coding credits.'
    );
    err.status = 402;
    err.code = 'FREE_MODEL_LOCKED';
    err.balance = currentBalance;
    err.needed = estimatedCredits;
    throw err;
  }

  const insufficient = isFreeAccount
    ? currentBalance <= 0 || currentBalance < estimatedCredits
    : currentBalance <= 0 || currentBalance < Math.min(estimatedCredits, 0.01);

  if (insufficient) {
    const err = new Error(
      isFreeAccount
        ? `You've used your ${FREE_VIBE_CREDITS} free vibe-coding credits (${currentBalance.toFixed(2)} left, need about ${estimatedCredits.toFixed(2)}). Upgrade to Starter, Pro, or Agency to keep building with AI Web Studio.`
        : `Insufficient AI credits: have ${currentBalance.toFixed(2)}, need at least ${estimatedCredits.toFixed(2)}.`
    );
    err.status = 402;
    err.code = isFreeAccount ? 'FREE_VIBE_EXHAUSTED' : 'INSUFFICIENT_CREDITS';
    err.balance = currentBalance;
    err.needed = estimatedCredits;
    throw err;
  }

  // Record reservation in memory and Supabase REST ledger (do NOT deduct until settleUsage)
  const reservationRecord = {
    userId,
    requestId,
    modelId: normModel,
    provider: rates.provider,
    status: 'reserved',
    reservedCredits: estimatedCredits,
    reservedCostUsd: Number((estimatedCredits * 0.01).toFixed(8)),
    balanceBefore: currentBalance,
    promptPreview,
    createdAt: Date.now(),
  };
  _localLedger.set(requestId, reservationRecord);

  // Sync in-memory account cache with real Supabase balance
  _localAccounts.set(userId, {
    userId,
    plan: activePlan,
    balance: currentBalance,
    monthlyCredits: Number(status?.monthlyCredits || currentBalance),
    dollarsSpent: Number(status?.dollarsSpent || 0),
  });

  // Persist 'reserved' state to Supabase ai_usage_ledger asynchronously
  upsertSupabaseLedgerRow({
    user_id: userId,
    request_id: requestId,
    reservation_id: requestId,
    status: 'reserved',
    provider: rates.provider,
    model: normModel,
    prompt_preview: promptPreview,
    reserved_cost_usd: Number((estimatedCredits * 0.01).toFixed(8)),
    reserved_credits: estimatedCredits,
    actual_cost_usd: 0,
    actual_credits: 0,
    balance_credits_after: currentBalance,
  }).catch(() => {});

  return {
    ok: true,
    reservationId: requestId,
    reservedCredits: estimatedCredits,
    remainingBalance: currentBalance,
    plan: activePlan,
    provider: rates.provider,
    model: normModel,
  };
}

/**
 * Atomic settlement after generation finishes (or fails/cancels).
 * Strictly calculates real provider token cost (100 credits = $1.00 USD) and writes the new
 * balance permanently to Supabase REST (`user_credits`, `user_plans`, and `ai_usage_ledger`).
 */
export async function settleUsage({
  requestId,
  userId: explicitUserId = null,
  modelId,
  tokenUsage = {},
  latencyMs = 0,
  status = 'settled',
  errorMessage = null,
  metadata = {},
}) {
  if (!requestId) return null;
  const normModel = normalizeModelId(modelId);
  const costData = await calculateUsageCost(normModel, tokenUsage);

  const actualCostUsd = status === 'settled' ? costData.totalCostUsd : 0;
  // Minimum 0.0001 credit charge for any settled non-zero generation, exact to 4 decimals
  const actualCredits =
    status === 'settled'
      ? Math.max(0.0001, Number(costData.credits.toFixed(4)))
      : 0;

  const rec = _localLedger.get(requestId);
  const targetUserId = explicitUserId || rec?.userId || metadata?.userId || null;

  // Idempotency guard: if already settled in memory, return settled result without double-deducting
  if (rec && rec.status === 'settled' && status === 'settled') {
    const cachedUser = targetUserId ? _localAccounts.get(targetUserId) : null;
    return {
      ok: true,
      idempotent: true,
      status: 'settled',
      actualCostUsd: rec.actualCostUsd,
      actualCredits: rec.actualCredits,
      balanceAfter: rec.balanceAfter ?? cachedUser?.balance ?? 0,
      newBalance: rec.balanceAfter ?? cachedUser?.balance ?? 0,
      refundedDelta: 0,
      refundedCredits: 0,
      costData,
    };
  }

  // Fetch authoritative current balance from Supabase REST before deducting
  let currentBalance = rec?.balanceBefore ?? null;
  let currentDollarsSpent = 0;
  let activePlan = 'Starter Plan';

  if (targetUserId) {
    const sbData = await fetchSupabaseAiAccount(targetUserId);
    if (sbData?.credRow && typeof sbData.credRow.ai_credits_balance === 'number') {
      currentBalance = Number(sbData.credRow.ai_credits_balance);
      currentDollarsSpent = Number(sbData.credRow.ai_dollars_spent || 0);
    } else if (sbData?.planRow && typeof sbData.planRow.ai_credits_balance === 'number') {
      currentBalance = Number(sbData.planRow.ai_credits_balance);
    }
    if (sbData?.planRow?.plan_tier) {
      activePlan = sbData.planRow.plan_tier;
    }
  }

  if (currentBalance === null || Number.isNaN(currentBalance)) {
    const localUser = targetUserId ? _localAccounts.get(targetUserId) : null;
    currentBalance = localUser ? Number(localUser.balance) : 0;
    currentDollarsSpent = localUser ? Number(localUser.dollarsSpent || 0) : 0;
  }

  let newBalance = currentBalance;
  let newDollarsSpent = currentDollarsSpent;
  let refundedCredits = 0;

  if (status === 'settled') {
    newBalance = Math.max(0, Number((currentBalance - actualCredits).toFixed(4)));
    newDollarsSpent = Number((currentDollarsSpent + actualCostUsd).toFixed(6));
    if (targetUserId) {
      await persistSupabaseAiBalance(targetUserId, newBalance, newDollarsSpent);
    }
  } else {
    refundedCredits = rec?.reservedCredits || 0;
  }

  // Update in-memory cache to match Supabase
  if (targetUserId) {
    const existingLocal = _localAccounts.get(targetUserId);
    _localAccounts.set(targetUserId, {
      userId: targetUserId,
      plan: existingLocal?.plan || activePlan,
      balance: newBalance,
      monthlyCredits: existingLocal?.monthlyCredits || Math.max(newBalance, 10),
      dollarsSpent: newDollarsSpent,
    });
  }

  if (rec) {
    rec.status = status;
    rec.actualCredits = actualCredits;
    rec.actualCostUsd = actualCostUsd;
    rec.balanceAfter = newBalance;
    rec.inputTokens = costData.inputTokens;
    rec.outputTokens = costData.outputTokens;
    rec.thoughtTokens = costData.thoughtTokens;
    rec.cachedReadTokens = costData.cachedReadTokens;
    rec.totalTokens = costData.totalTokens;
    rec.latencyMs = latencyMs;
    rec.errorMessage = errorMessage;
    rec.settledAt = new Date().toISOString();
  } else if (targetUserId) {
    _localLedger.set(requestId, {
      userId: targetUserId,
      requestId,
      modelId: normModel,
      provider: costData.provider,
      status,
      reservedCredits: actualCredits,
      actualCredits,
      actualCostUsd,
      balanceAfter: newBalance,
      inputTokens: costData.inputTokens,
      outputTokens: costData.outputTokens,
      thoughtTokens: costData.thoughtTokens,
      cachedReadTokens: costData.cachedReadTokens,
      totalTokens: costData.totalTokens,
      latencyMs,
      errorMessage,
      createdAt: Date.now(),
      settledAt: new Date().toISOString(),
    });
  }

  // Persist settled audit row to Supabase REST `ai_usage_ledger`
  if (targetUserId) {
    await upsertSupabaseLedgerRow({
      user_id: targetUserId,
      request_id: requestId,
      reservation_id: requestId,
      status,
      provider: costData.provider,
      model: normModel,
      prompt_preview: rec?.promptPreview || '',
      input_tokens: costData.inputTokens,
      output_tokens: costData.outputTokens,
      thought_tokens: costData.thoughtTokens,
      cached_read_tokens: costData.cachedReadTokens,
      cache_write_tokens: costData.cacheWriteTokens,
      total_tokens: costData.totalTokens,
      reserved_cost_usd: Number(((rec?.reservedCredits || actualCredits) * 0.01).toFixed(8)),
      reserved_credits: Number((rec?.reservedCredits || actualCredits).toFixed(4)),
      actual_cost_usd: actualCostUsd,
      actual_credits: actualCredits,
      balance_credits_after: newBalance,
      latency_ms: Math.round(latencyMs || 0),
      error_message: errorMessage,
      metadata: { ...metadata, breakdown: costData.breakdown },
      settled_at: new Date().toISOString(),
    });
  }

  return {
    ok: true,
    idempotent: false,
    status,
    actualCostUsd,
    actualCredits,
    balanceAfter: newBalance,
    newBalance,
    refundedDelta: 0,
    refundedCredits,
    costData,
  };
}

/**
 * Synchronize or upgrade a user's plan and AI credit allowance in Supabase.
 * Note: Only resets balance to plan default when explicitly upgrading/changing plans
 * or provisioning a brand-new user.
 */
export async function syncUserAiPlan(userId, planName = 'Starter Plan', forceResetBalance = false) {
  const effectiveUserId = userId || 'dashboard';
  const planConfig = getPlanConfig(planName);
  const { sbUrl, sbKey } = getSupabaseRestCredentials();

  // First check if user already has a custom or active balance in Supabase REST
  if (!forceResetBalance && sbUrl && sbKey) {
    const existing = await fetchSupabaseAiAccount(effectiveUserId);
    if (existing && (existing.planRow || existing.credRow)) {
      const existingPlan = existing.planRow?.plan_tier || planName;
      const existingBal =
        existing.credRow && typeof existing.credRow.ai_credits_balance === 'number'
          ? Number(existing.credRow.ai_credits_balance)
          : existing.planRow && typeof existing.planRow.ai_credits_balance === 'number'
            ? Number(existing.planRow.ai_credits_balance)
            : null;
      const existingSpent = Number(existing.credRow?.ai_dollars_spent || 0);

      // If the user is already on this plan and has a valid balance in Supabase, preserve their exact Supabase balance!
      if (existingPlan === planName && existingBal !== null && (existingBal > 0 || existingSpent > 0 || existingPlan === 'Free Plan')) {
        let preservedBal = existingBal;
        // Free accounts: make sure the one-time free vibe grant has been applied (idempotent, additive).
        if (isFreePlanName(existingPlan)) {
          const grant = await grantFreeVibeCreditsOnce(effectiveUserId, existingPlan);
          if (grant.granted && typeof grant.balance === 'number') preservedBal = grant.balance;
        }
        const monthlyCreds = Number(
          existing.planRow?.monthly_ai_credits || (isFreePlanName(existingPlan) ? planConfig.monthlyCredits : preservedBal) || planConfig.monthlyCredits
        );
        _localAccounts.set(effectiveUserId, {
          userId: effectiveUserId,
          plan: existingPlan,
          balance: preservedBal,
          monthlyCredits: monthlyCreds,
          dollarsSpent: existingSpent,
        });
        return {
          userId: effectiveUserId,
          plan: existingPlan,
          monthlyCredits: monthlyCreds,
          monthlyAllowanceUsd: Number((monthlyCreds * 0.01).toFixed(2)),
          balanceCredits: Number(preservedBal.toFixed(4)),
          dollarsSpent: Number(existingSpent.toFixed(6)),
          isFree: existingPlan === 'Free Plan',
        };
      }
    }
  }

  // Provision or upgrade in Supabase REST.
  // Free plan: provision with a 0 AI balance; the one-time grant below ADDS the free vibe credits exactly once
  // (so toggling Free <-> paid can never re-grant them).
  const isFreeTarget = isFreePlanName(planName);
  const provisionBalance = isFreeTarget ? 0 : planConfig.monthlyCredits;
  let resultBalance = provisionBalance;
  if (sbUrl && sbKey && !isSbAiDegraded()) {
    try {
      const nowMs = Date.now();
      await fetch(`${sbUrl}/rest/v1/user_plans`, {
        method: 'POST',
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          user_id: effectiveUserId,
          plan_tier: planName,
          monthly_ai_credits: planConfig.monthlyCredits,
          monthly_ai_allowance_usd: planConfig.monthlyUsd,
          ai_credits_balance: provisionBalance,
          updated_at: nowMs,
        }),
        signal: AbortSignal.timeout(1000),
      });
      await persistSupabaseAiBalance(effectiveUserId, provisionBalance, 0, planName);
      if (isFreeTarget) {
        const grant = await grantFreeVibeCreditsOnce(effectiveUserId, planName);
        if (grant.granted && typeof grant.balance === 'number') resultBalance = grant.balance;
      }
    } catch (err) {
      tripSbAiCircuitBreaker(45000);
      console.warn('[accountingService] syncUserAiPlan REST error:', err.message);
    }
  }

  const localUser = {
    userId: effectiveUserId,
    plan: planName,
    balance: resultBalance,
    monthlyCredits: planConfig.monthlyCredits,
    dollarsSpent: 0,
  };
  _localAccounts.set(effectiveUserId, localUser);
  return {
    userId: effectiveUserId,
    plan: planName,
    monthlyCredits: planConfig.monthlyCredits,
    monthlyAllowanceUsd: planConfig.monthlyUsd,
    balanceCredits: resultBalance,
    dollarsSpent: 0,
    isFree: planName.toLowerCase().includes('free'),
  };
}

/**
 * Fetch authoritative user AI allowance & status from Supabase REST.
 * Never overwrites an existing user's custom balance (such as 10 AI credits) with plan defaults (600).
 */
export async function getUserAiStatus(userId, planHint = null) {
  const effectiveUserId = userId || 'dashboard';

  // 1. Primary path: Supabase REST API
  let sbData = await fetchSupabaseAiAccount(effectiveUserId);

  // Free accounts: self-heal the one-time free vibe grant (covers new + pre-existing Free users).
  // Cheap after the first call per account (in-memory settled set); atomic + idempotent in the DB.
  if (sbData?.planRow && isFreePlanName(sbData.planRow.plan_tier || 'Free Plan') && sbData.credRow) {
    const grant = await grantFreeVibeCreditsOnce(effectiveUserId, sbData.planRow.plan_tier || 'Free Plan');
    if (grant.granted) {
      sbData = (await fetchSupabaseAiAccount(effectiveUserId)) || sbData;
    }
  }

  if (sbData && (sbData.planRow || sbData.credRow)) {
    const planRow = sbData.planRow;
    const credRow = sbData.credRow;
    const activePlan = planRow?.plan_tier || planHint || 'Free Plan';
    const planConfig = getPlanConfig(activePlan);

    const rawCredBal =
      credRow && credRow.ai_credits_balance !== null && credRow.ai_credits_balance !== undefined
        ? Number(credRow.ai_credits_balance)
        : null;
    const rawPlanBal =
      planRow && planRow.ai_credits_balance !== null && planRow.ai_credits_balance !== undefined
        ? Number(planRow.ai_credits_balance)
        : null;
    const dollarsSpent = Number(credRow?.ai_dollars_spent || 0);

    // Always trust the stored balance (Free accounts hold their one-time free vibe credits here).
    let balanceCredits = 0;
    if (rawCredBal !== null && !Number.isNaN(rawCredBal)) {
      balanceCredits = rawCredBal;
    } else if (rawPlanBal !== null && !Number.isNaN(rawPlanBal)) {
      balanceCredits = rawPlanBal;
    } else if (!isFreePlanName(activePlan)) {
      balanceCredits = planConfig.monthlyCredits;
    }

    // Free accounts that have never spent credits yet get the full one-time 15 free vibe credits
    if (isFreePlanName(activePlan) && balanceCredits === 0 && dollarsSpent === 0) {
      balanceCredits = FREE_VIBE_CREDITS;
      persistSupabaseAiBalance(effectiveUserId, FREE_VIBE_CREDITS, 0, 'Free Plan').catch(() => {});
    }

    const monthlyCredits =
      planRow && Number(planRow.monthly_ai_credits) > 0
        ? Number(planRow.monthly_ai_credits)
        : Math.max(balanceCredits, planConfig.monthlyCredits);

    const monthlyAllowanceUsd =
      planRow && Number(planRow.monthly_ai_allowance_usd) > 0
        ? Number(planRow.monthly_ai_allowance_usd)
        : Number((monthlyCredits * 0.01).toFixed(2));

    // Update in-memory cache so any synchronous consumer stays in sync
    _localAccounts.set(effectiveUserId, {
      userId: effectiveUserId,
      plan: activePlan,
      balance: Number(balanceCredits.toFixed(4)),
      monthlyCredits,
      dollarsSpent: Number(dollarsSpent.toFixed(6)),
    });

    return {
      userId: effectiveUserId,
      plan: activePlan,
      monthlyCredits,
      monthlyAllowanceUsd,
      balanceCredits: Number(balanceCredits.toFixed(4)),
      dollarsSpent: Number(dollarsSpent.toFixed(6)),
      cycleStart: credRow?.ai_cycle_start || new Date().toISOString(),
      cycleEnd: credRow?.ai_cycle_end || new Date(Date.now() + 30 * 86400000).toISOString(),
      isFree: activePlan === 'Free Plan',
    };
  }

  // 2. Check local in-memory cache first if remote fetch timed out or was degraded
  if (_localAccounts.has(effectiveUserId)) {
    const cached = _localAccounts.get(effectiveUserId);
    return {
      userId: effectiveUserId,
      plan: cached.plan || planHint || 'Free Plan',
      monthlyCredits: cached.monthlyCredits || 0,
      monthlyAllowanceUsd: Number(((cached.monthlyCredits || 0) * 0.01).toFixed(2)),
      balanceCredits: typeof cached.balance === 'number' ? cached.balance : 0,
      dollarsSpent: cached.dollarsSpent || 0,
      cycleStart: new Date().toISOString(),
      cycleEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      isFree: (cached.plan || 'Free Plan') === 'Free Plan',
    };
  }

  // 3. If degraded, don't stall waiting on remote provisioning
  if (isSbAiDegraded()) {
    const fallbackPlan = planHint || 'Free Plan';
    const planCfg = getPlanConfig(fallbackPlan);
    const balanceCredits = fallbackPlan === 'Free Plan' ? 0 : planCfg.monthlyCredits;
    _localAccounts.set(effectiveUserId, {
      userId: effectiveUserId,
      plan: fallbackPlan,
      balance: balanceCredits,
      monthlyCredits: planCfg.monthlyCredits,
      dollarsSpent: 0,
    });
    return {
      userId: effectiveUserId,
      plan: fallbackPlan,
      monthlyCredits: planCfg.monthlyCredits,
      monthlyAllowanceUsd: planCfg.monthlyUsd,
      balanceCredits,
      dollarsSpent: 0,
      cycleStart: new Date().toISOString(),
      cycleEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      isFree: fallbackPlan === 'Free Plan',
    };
  }

  // 4. If user does not exist yet in Supabase, provision with Free Plan (or planHint if specified)
  const initialPlan = planHint || 'Free Plan';
  const synced = await syncUserAiPlan(effectiveUserId, initialPlan, true);
  return {
    ...synced,
    cycleStart: new Date().toISOString(),
    cycleEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
  };
}

/**
 * List audit usage history for admin/audit purposes from Supabase REST.
 */
export async function listAiUsageLedger(userId, limit = 50) {
  const { sbUrl, sbKey } = getSupabaseRestCredentials();
  if (sbUrl && sbKey) {
    try {
      const filter = userId ? `user_id=eq.${encodeURIComponent(userId)}&` : '';
      const res = await fetch(
        `${sbUrl}/rest/v1/ai_usage_ledger?${filter}order=created_at.desc&limit=${Number(limit) || 50}`,
        {
          headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
          signal: AbortSignal.timeout(4000),
        }
      );
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) {
          return rows.map((r) => ({
            id: r.id,
            userId: r.user_id,
            requestId: r.request_id,
            status: r.status,
            provider: r.provider,
            model: r.model,
            promptPreview: r.prompt_preview,
            inputTokens: r.input_tokens,
            outputTokens: r.output_tokens,
            thoughtTokens: r.thought_tokens,
            cachedReadTokens: r.cached_read_tokens,
            totalTokens: r.total_tokens,
            reservedCredits: Number(r.reserved_credits),
            actualCredits: Number(r.actual_credits),
            actualCostUsd: Number(r.actual_cost_usd),
            balanceCreditsAfter: Number(r.balance_credits_after),
            latencyMs: r.latency_ms,
            errorMessage: r.error_message,
            createdAt: r.created_at,
            settledAt: r.settled_at,
          }));
        }
      }
    } catch (err) {
      console.warn('[accountingService] listAiUsageLedger REST error:', err.message);
    }
  }

  return Array.from(_localLedger.values()).slice(-limit).reverse();
}
