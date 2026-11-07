// Accounting Service for AI Web Studio
// Manages atomic credit reservations, settlements, plan allowances, and ledger persistence.
import { getPgPool } from '../supabase.js';
import { calculateUsageCost, getModelRates, normalizeModelId } from './pricingRegistry.js';

// Local in-memory reserve fallback if PostgreSQL is temporarily unreachable
const _localAccounts = new Map();
const _localLedger = new Map();

export const PLAN_ALLOWANCES = {
  'Free Plan': { monthlyUsd: 0.00, monthlyCredits: 0, priceUsd: 0 },
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

  // Minimum reservation is 0.05 credits to avoid zero reservations on trivial prompts
  return Math.max(0.05, estCredits);
}

/**
 * Atomic preflight reservation before sending request to provider.
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

  const pool = getPgPool();
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT reserve_ai_budget($1, $2, $3, $4, $5, $6) AS result;`,
        [userId, requestId, estimatedCredits, normModel, rates.provider, promptPreview]
      );

      const result = res.rows[0]?.result;
      if (!result) {
        throw new Error('Database returned empty reservation result');
      }

      if (!result.ok) {
        const err = new Error(result.message || 'Insufficient AI credits.');
        err.status = 402;
        err.code = result.error || 'INSUFFICIENT_CREDITS';
        err.balance = Number(result.balance || 0);
        err.needed = Number(result.needed || estimatedCredits);
        throw err;
      }

      return {
        ok: true,
        reservationId: result.reservation_id,
        reservedCredits: Number(result.reserved_credits),
        remainingBalance: Number(result.remaining_balance),
        plan: result.plan,
        provider: rates.provider,
        model: normModel,
      };
    } catch (err) {
      if (err.status === 402) throw err;
      console.warn('[accountingService] DB reserve failed, falling back to local:', err.message);
    }
  }

  // Local fallback with plan-aware initialization
  return reserveBudgetLocal({ userId, requestId, modelId: normModel, rates, estimatedCredits, promptPreview, planHint });
}

function reserveBudgetLocal({ userId, requestId, modelId, rates, estimatedCredits, promptPreview, planHint }) {
  let user = _localAccounts.get(userId);
  if (!user) {
    const config = getPlanConfig(planHint || 'Pro Plan');
    const isFree = !planHint || planHint.toLowerCase().includes('free');
    const balance = isFree ? 0 : config.monthlyCredits;
    user = {
      userId,
      plan: planHint || 'Pro Plan',
      balance,
      monthlyCredits: config.monthlyCredits,
      dollarsSpent: 0,
    };
    _localAccounts.set(userId, user);
  } else if (planHint && user.plan !== planHint) {
    const config = getPlanConfig(planHint);
    user.plan = planHint;
    user.monthlyCredits = config.monthlyCredits;
    if (user.balance <= 0 && !planHint.toLowerCase().includes('free')) {
      user.balance = config.monthlyCredits;
    }
  }

  if (user.balance < estimatedCredits) {
    const err = new Error(`Insufficient AI credits: need ${estimatedCredits}, have ${user.balance}. Upgrade to continue.`);
    err.status = 402;
    err.code = 'INSUFFICIENT_CREDITS';
    err.balance = user.balance;
    err.needed = estimatedCredits;
    throw err;
  }

  // Do NOT deduct credits during preflight reservation.
  // Credits are strictly deducted after generation finishes in settleUsage based on real $ usage.
  _localLedger.set(requestId, {
    userId,
    requestId,
    modelId,
    provider: rates.provider,
    status: 'reserved',
    reservedCredits: estimatedCredits,
    promptPreview,
    createdAt: Date.now(),
  });

  return {
    ok: true,
    reservationId: requestId,
    reservedCredits: estimatedCredits,
    remainingBalance: user.balance,
    plan: user.plan,
    provider: rates.provider,
    model: modelId,
  };
}

/**
 * Atomic settlement after generation finishes (or fails/cancels).
 */
export async function settleUsage({
  requestId,
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
  const actualCredits = status === 'settled' ? costData.credits : 0;

  const pool = getPgPool();
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT settle_ai_usage($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) AS result;`,
        [
          requestId,
          actualCostUsd,
          actualCredits,
          costData.inputTokens,
          costData.outputTokens,
          costData.thoughtTokens,
          costData.cachedReadTokens,
          costData.cacheWriteTokens,
          costData.totalTokens,
          latencyMs,
          status,
          errorMessage,
          JSON.stringify({ ...metadata, breakdown: costData.breakdown }),
        ]
      );

      const result = res.rows[0]?.result;
      if (result) {
        return {
          ok: result.ok !== false,
          idempotent: Boolean(result.idempotent),
          status: result.status,
          actualCostUsd: Number(result.actual_cost_usd ?? actualCostUsd),
          actualCredits: Number(result.actual_credits ?? actualCredits),
          balanceAfter: Number(result.new_balance ?? result.balance_after),
          refundedDelta: Number(result.refunded_delta ?? 0),
          refundedCredits: Number(result.refunded_credits ?? (result.refunded_delta ?? 0)),
          newBalance: Number(result.new_balance ?? result.balance_after),
          costData,
        };
      }
    } catch (err) {
      console.warn('[accountingService] DB settle failed, falling back to local:', err.message);
    }
  }

  // Local fallback
  const rec = _localLedger.get(requestId);
  if (rec) {
    const user = _localAccounts.get(rec.userId);
    if (rec.status !== 'reserved') {
      return {
        ok: true,
        idempotent: true,
        status: rec.status,
        actualCredits: rec.actualCredits,
        actualCostUsd: rec.actualCostUsd,
        balanceAfter: user ? user.balance : 0,
        newBalance: user ? user.balance : 0,
        costData,
      };
    }
    if (user) {
      let refundedCredits = 0;
      if (status === 'settled') {
        user.balance = Math.max(0, Number((user.balance - actualCredits).toFixed(4)));
        user.dollarsSpent = Number((user.dollarsSpent + actualCostUsd).toFixed(6));
      } else {
        // Zero credits deducted on error/cancellation
        refundedCredits = rec.reservedCredits;
      }
      rec.status = status;
      rec.actualCredits = actualCredits;
      rec.actualCostUsd = actualCostUsd;
      return {
        ok: true,
        status,
        actualCostUsd,
        actualCredits,
        balanceAfter: user.balance,
        newBalance: user.balance,
        refundedDelta: 0,
        refundedCredits,
        costData,
      };
    }
  }

  return { ok: false, error: 'Record not found' };
}

/**
 * Synchronize or upgrade a user's plan and AI credit allowance in Supabase PostgreSQL.
 */
export async function syncUserAiPlan(userId, planName = 'Starter Plan') {
  const effectiveUserId = userId || 'dashboard';
  const planConfig = getPlanConfig(planName);
  const pool = getPgPool();

  if (pool) {
    try {
      const res = await pool.query(
        'SELECT sync_user_ai_plan($1, $2) AS result;',
        [effectiveUserId, planName]
      );
      const result = res.rows[0]?.result;
      if (result && result.ok) {
        return {
          userId: effectiveUserId,
          plan: result.plan,
          monthlyCredits: Number(result.monthly_credits),
          monthlyAllowanceUsd: Number(result.monthly_allowance_usd),
          balanceCredits: Number(result.balance_credits),
          dollarsSpent: 0,
          isFree: result.plan === 'Free Plan',
        };
      }
    } catch (err) {
      console.warn('[accountingService] syncUserAiPlan DB error:', err.message);
    }
  }

  const localUser = {
    userId: effectiveUserId,
    plan: planName,
    balance: planConfig.monthlyCredits,
    monthlyCredits: planConfig.monthlyCredits,
    dollarsSpent: 0,
  };
  _localAccounts.set(effectiveUserId, localUser);
  return {
    userId: effectiveUserId,
    plan: planName,
    monthlyCredits: planConfig.monthlyCredits,
    monthlyAllowanceUsd: planConfig.monthlyUsd,
    balanceCredits: planConfig.monthlyCredits,
    dollarsSpent: 0,
    isFree: planName.toLowerCase().includes('free'),
  };
}

/**
 * Fetch authoritative user AI allowance & status from Supabase PostgreSQL.
 * Automatically provisions new users in Supabase so every user has a synced row.
 */
export async function getUserAiStatus(userId, planHint = null) {
  const effectiveUserId = userId || 'dashboard';
  const pool = getPgPool();
  if (pool) {
    try {
      let planRes = await pool.query('SELECT * FROM user_plans WHERE user_id = $1 LIMIT 1;', [effectiveUserId]);
      let credRes = await pool.query('SELECT * FROM user_credits WHERE user_id = $1 LIMIT 1;', [effectiveUserId]);

      let planRow = planRes.rows[0];
      let credRow = credRes.rows[0];

      // Auto-provision user in Supabase if not yet created
      if (!planRow || !credRow) {
        const synced = await syncUserAiPlan(effectiveUserId, planHint || 'Free Plan');
        return {
          ...synced,
          cycleStart: new Date().toISOString(),
          cycleEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
        };
      }

      // If planHint explicitly changed tier, sync it
      if (planHint) {
        const hintConfig = getPlanConfig(planHint);
        const currentConfig = getPlanConfig(planRow.plan_tier);
        if (hintConfig.monthlyCredits !== currentConfig.monthlyCredits) {
          const synced = await syncUserAiPlan(effectiveUserId, planHint);
          return {
            ...synced,
            cycleStart: credRow?.ai_cycle_start || new Date().toISOString(),
            cycleEnd: credRow?.ai_cycle_end || new Date(Date.now() + 30 * 86400000).toISOString(),
          };
        }
      }

      const planConfig = getPlanConfig(planRow.plan_tier);
      const rawBal = credRow ? credRow.ai_credits_balance : null;
      const dollarsSpent = Number(credRow?.ai_dollars_spent || 0);
      const balanceCredits =
        planRow.plan_tier === 'Free Plan'
          ? 0
          : rawBal !== null && rawBal !== undefined && (Number(rawBal) > 0 || dollarsSpent > 0)
            ? Number(rawBal)
            : planConfig
              ? planConfig.monthlyCredits
              : 0;

      return {
        userId: effectiveUserId,
        plan: planRow.plan_tier,
        monthlyCredits: Number(planRow.monthly_ai_credits ?? planConfig.monthlyCredits),
        monthlyAllowanceUsd: Number(planRow.monthly_ai_allowance_usd ?? planConfig.monthlyUsd),
        balanceCredits: Number(balanceCredits.toFixed(4)),
        dollarsSpent: Number(dollarsSpent.toFixed(6)),
        cycleStart: credRow?.ai_cycle_start || new Date().toISOString(),
        cycleEnd: credRow?.ai_cycle_end || new Date(Date.now() + 30 * 86400000).toISOString(),
        isFree: planRow.plan_tier === 'Free Plan',
      };
    } catch (err) {
      console.warn('[accountingService] getUserAiStatus DB error:', err.message);
    }
  }

  const localUser = _localAccounts.get(effectiveUserId);
  if (localUser) {
    return {
      userId: effectiveUserId,
      plan: localUser.plan,
      monthlyCredits: localUser.monthlyCredits,
      monthlyAllowanceUsd: Number((localUser.monthlyCredits * 0.01).toFixed(2)),
      balanceCredits: localUser.balance,
      dollarsSpent: localUser.dollarsSpent,
      cycleStart: new Date().toISOString(),
      cycleEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      isFree: localUser.plan === 'Free Plan',
    };
  }

  const fallbackConfig = getPlanConfig(planHint || 'Free Plan');
  return {
    userId: effectiveUserId,
    plan: planHint || 'Free Plan',
    monthlyCredits: fallbackConfig.monthlyCredits,
    monthlyAllowanceUsd: fallbackConfig.monthlyUsd,
    balanceCredits: fallbackConfig.monthlyCredits,
    dollarsSpent: 0,
    cycleStart: new Date().toISOString(),
    cycleEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    isFree: fallbackConfig.monthlyCredits === 0,
  };
}

/**
 * List audit usage history for admin/audit purposes.
 */
export async function listAiUsageLedger(userId, limit = 50) {
  const pool = getPgPool();
  if (pool) {
    try {
      const q = userId
        ? 'SELECT * FROM ai_usage_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2;'
        : 'SELECT * FROM ai_usage_ledger ORDER BY created_at DESC LIMIT $1;';
      const args = userId ? [userId, limit] : [limit];
      const { rows } = await pool.query(q, args);
      return rows.map(r => ({
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
    } catch (err) {
      console.warn('[accountingService] listAiUsageLedger DB error:', err.message);
    }
  }

  return Array.from(_localLedger.values()).slice(-limit).reverse();
}
