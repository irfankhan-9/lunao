// Authoritative Source of Truth for Lunao AI Studio Credits
// Fixed Conversion: 100 Lunao AI credits = $1.00 USD internal provider cost ($0.01 = 1 credit).
//
// Monthly AI Allowances:
//   Starter ($97/mo):   $6.00  = 600 AI credits
//   Pro ($187/mo):      $13.00 = 1,300 AI credits
//   Agency ($297/mo):   $20.00 = 2,000 AI credits
//   Free ($0/mo):       $0.05  = 1 AI prompt, ONE-TIME grant per account (never monthly, never re-granted)

/** One-time AI Web Studio prompt every Free account receives (strictly 1 free AI prompt). */
export const FREE_VIBE_CREDITS = 1;

/** Free accounts may only use these low-cost Flash-tier models (mirrors server FREE_ALLOWED_MODEL_IDS). */
export const FREE_ALLOWED_MODEL_IDS = ['gemini-3.5-flash', 'gemini-3.8-flash'];

export interface PlanAiCredits {
  planKey: 'starter' | 'pro' | 'agency' | 'free';
  planName: string;
  monthlyCredits: number;
  dollarValue: number;
  creditCostUsd: number; // Exactly $0.01 across all plans
  subscriptionPriceUsd: number;
}

export const PLAN_AI_CREDITS: Record<string, PlanAiCredits> = {
  starter: {
    planKey: 'starter',
    planName: 'Starter Plan',
    monthlyCredits: 600,
    dollarValue: 6.00,
    creditCostUsd: 0.01,
    subscriptionPriceUsd: 97,
  },
  pro: {
    planKey: 'pro',
    planName: 'Pro Plan',
    monthlyCredits: 1300,
    dollarValue: 13.00,
    creditCostUsd: 0.01,
    subscriptionPriceUsd: 187,
  },
  growth: {
    planKey: 'pro',
    planName: 'Pro Plan',
    monthlyCredits: 1300,
    dollarValue: 13.00,
    creditCostUsd: 0.01,
    subscriptionPriceUsd: 187,
  },
  agency: {
    planKey: 'agency',
    planName: 'Agency Plan',
    monthlyCredits: 2000,
    dollarValue: 20.00,
    creditCostUsd: 0.01,
    subscriptionPriceUsd: 297,
  },
  free: {
    planKey: 'free',
    planName: 'Free Plan',
    monthlyCredits: FREE_VIBE_CREDITS,
    dollarValue: 0.05,
    creditCostUsd: 0.01,
    subscriptionPriceUsd: 0,
  },
};

export interface PromptMetadata {
  provider: string; // 'Google Gemini' | 'Anthropic Claude'
  model: string;    // Display name, e.g. 'Gemini 3.8 Flash'
  modelId?: string;
  inputTokens: number;
  outputTokens: number;
  thoughtTokens?: number;
  cachedReadTokens?: number;
  totalTokens: number;
  latencyMs: number;
  creditsDeducted: number;
  remainingCredits: number;
  costUsd: string;
  dollarValueRemaining: string;
  timestamp: number;
}

export function normalizePlanKey(planName?: string | null): 'starter' | 'pro' | 'agency' | 'free' {
  const p = String(planName || '').trim().toLowerCase();
  if (p.includes('agency')) return 'agency';
  if (p.includes('pro') || p.includes('growth')) return 'pro';
  if (p.includes('starter')) return 'starter';
  return 'free';
}

export function getPlanAiConfig(planName?: string | null): PlanAiCredits {
  const key = normalizePlanKey(planName);
  return PLAN_AI_CREDITS[key] || PLAN_AI_CREDITS.free;
}

/**
 * Paid plans are always eligible. Free accounts are eligible while they still hold
 * some of their one-time free vibe-coding credits (balance > 0).
 */
export function isVibeEligiblePlan(planName?: string | null): boolean {
  if (normalizePlanKey(planName) !== 'free') return true;
  return getVibeCreditBalance(planName) > 0;
}

export function isFreeVibePlan(planName?: string | null): boolean {
  return normalizePlanKey(planName) === 'free';
}

/** True when a model id (or display name) is allowed on the Free plan's free vibe credits. */
export function isModelAllowedOnFree(modelIdOrName?: string | null): boolean {
  const raw = String(modelIdOrName || '').toLowerCase();
  if (!raw) return true;
  if (FREE_ALLOWED_MODEL_IDS.includes(raw)) return true;
  return (raw.includes('flash') || raw.includes('3.5') || raw.includes('3.8')) && !raw.includes('pro') && !raw.includes('claude');
}

export function getVibeUserId(): string {
  if (typeof window === 'undefined') return 'dashboard';
  try {
    const existing = localStorage.getItem('lunao_owner_key');
    if (existing && existing.trim()) return existing.trim();
    const generated = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('lunao_owner_key', generated);
    return generated;
  } catch {
    return 'dashboard';
  }
}

export function getVibeCreditBalance(explicitPlan?: string | null): number {
  const userId = getVibeUserId();
  const activePlan =
    explicitPlan ||
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem(`lunao_u_${userId}_plan`) || localStorage.getItem('lunao_user_plan')
      : null) ||
    'Free Plan';
  const config = getPlanAiConfig(activePlan);
  const isFree = normalizePlanKey(activePlan) === 'free';
  const defaultBalance = isFree ? 1 : (config.monthlyCredits ?? 0);

  if (typeof window === 'undefined') return defaultBalance;
  try {
    const raw =
      localStorage.getItem(`lunao_u_${userId}_vibe_credits`) ??
      localStorage.getItem('lunao_vibe_credits');
    if (raw !== null) {
      const parsed = parseFloat(raw);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        if (isFree) {
          return parsed > 0 ? 1 : 0;
        }
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }

  return defaultBalance;
}

export function setVibeCreditBalance(newBalance: number): void {
  const clamped = Math.max(0, Math.round(newBalance * 10000) / 10000);
  try {
    const userId = getVibeUserId();
    localStorage.setItem(`lunao_u_${userId}_vibe_credits`, String(clamped));
    localStorage.setItem('lunao_vibe_credits', String(clamped));
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('lunao_vibe_credits_changed', {
        detail: { balance: clamped },
      })
    );
  }
}

export function resetVibeCreditsToPlan(planName?: string | null): number {
  const config = getPlanAiConfig(planName);
  const isFree = normalizePlanKey(planName) === 'free';
  try {
    if (typeof localStorage !== 'undefined') {
      const userId = getVibeUserId();
      localStorage.setItem(`lunao_u_${userId}_ai_dollars_spent`, '0');
      localStorage.setItem('lunao_ai_dollars_spent', '0');
      localStorage.removeItem('lunao_has_used_ai_credits');
    }
  } catch {
    /* ignore */
  }
  // Free plan: the 15 credits are a ONE-TIME server-side grant. Never write the plan default locally
  // (that would refill spent credits); the server response below is the only source of truth.
  if (!isFree) {
    setVibeCreditBalance(config.monthlyCredits);
  }

  // Immediately sync updated plan allowance to Supabase PostgreSQL for this user
  if (typeof window !== 'undefined') {
    const userId = getVibeUserId();
    fetch('/api/ai/sync-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-owner-key': userId,
        'x-user-plan': config.planName,
      },
      body: JSON.stringify({
        userId,
        plan: config.planName,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d?.status && typeof d.status.balanceCredits === 'number') {
          setVibeCreditBalance(d.status.balanceCredits);
        }
      })
      .catch(() => {});
  }

  return isFree ? getVibeCreditBalance(planName) : config.monthlyCredits;
}

export interface RawProviderMetadata {
  provider?: string;
  model?: string;
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  cachedReadTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  creditsDeducted?: number;
  remainingCredits?: number;
  actualCostUsd?: number;
  requestId?: string;
  userId?: string;
}

export function hasSufficientVibeCredits(planName?: string | null): {
  ok: boolean;
  balance: number;
  error?: string;
} {
  const userId = getVibeUserId();
  const currentPlan =
    planName ||
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem(`lunao_u_${userId}_plan`) || localStorage.getItem('lunao_user_plan')
      : null) ||
    'Free Plan';
  const isFree = normalizePlanKey(currentPlan) === 'free';
  const currentBalance = getVibeCreditBalance(currentPlan);
  if (currentBalance <= 0) {
    return {
      ok: false,
      balance: 0,
      error: isFree
        ? `You've used your 1 free AI prompt. Upgrade to Starter, Pro, or Agency to keep building with AI.`
        : 'Insufficient AI credits (0 remaining). Please upgrade your plan in Subscription Plans.',
    };
  }
  return {
    ok: true,
    balance: currentBalance,
  };
}

/**
 * Updates client balance strictly from real provider usageMetadata (inputTokens + outputTokens)
 * and syncs with the user's authoritative Supabase account.
 * Fixed rate: 100 Lunao AI Credits = $1.00 USD ($0.01 = 1 credit).
 */
export function deductVibeCreditsFromMetadata(
  rawMeta?: RawProviderMetadata | null,
  planName?: string | null,
  fallbackOutputChars = 0,
): PromptMetadata {
  const currentPlan =
    planName ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('lunao_user_plan') : null) ||
    'Starter Plan';
  const currentBalance = getVibeCreditBalance(currentPlan);

  const modelLabel = rawMeta?.model || 'Gemini 3.8 Flash';
  const hasRealTokens =
    Boolean(rawMeta) &&
    (Number(rawMeta?.inputTokens) > 0 || Number(rawMeta?.outputTokens) > 0 || fallbackOutputChars > 100);

  const inputTokens = hasRealTokens
    ? (Number(rawMeta?.inputTokens) || Math.max(150, Math.ceil(fallbackOutputChars / 8)))
    : 0;
  const outputTokens = hasRealTokens
    ? (Number(rawMeta?.outputTokens) || Math.max(100, Math.ceil(fallbackOutputChars / 4)))
    : 0;
  const thoughtTokens = hasRealTokens ? Number(rawMeta?.thoughtTokens || 0) : 0;
  const cachedReadTokens = hasRealTokens ? Number(rawMeta?.cachedReadTokens || 0) : 0;
  const totalTokens = hasRealTokens
    ? Number(rawMeta?.totalTokens) || inputTokens + outputTokens + thoughtTokens
    : 0;
  const latencyMs = hasRealTokens ? Number(rawMeta?.latencyMs || 0) : 0;

  let creditsDeducted = 0;
  let remainingCredits = currentBalance;

  if (hasRealTokens) {
    const norm = (rawMeta?.modelId || modelLabel).toLowerCase();
    let inRate = 0.075;
    let outRate = 0.30;
    if (norm.includes('3.1') || norm.includes('pro')) {
      inRate = 1.25;
      outRate = 5.00;
    } else if (norm.includes('haiku')) {
      inRate = 0.80;
      outRate = 4.00;
    } else if (norm.includes('sonnet') || norm.includes('fable')) {
      inRate = 3.00;
      outRate = 15.00;
    }
    const calculatedCostUsd = (inputTokens * inRate + (outputTokens + thoughtTokens) * outRate) / 1000000;
    const calculatedCredits = Math.max(0.01, Number((calculatedCostUsd * 100).toFixed(4)));

    const isFree = normalizePlanKey(currentPlan) === 'free';
    if (isFree) {
      creditsDeducted = Math.min(currentBalance, 1);
      remainingCredits = Math.max(0, currentBalance - creditsDeducted);
    } else {
      if (typeof rawMeta?.creditsDeducted === 'number' && rawMeta.creditsDeducted > 0) {
        creditsDeducted = Number(rawMeta.creditsDeducted.toFixed(4));
      } else {
        creditsDeducted = calculatedCredits;
      }

      if (typeof rawMeta?.remainingCredits === 'number' && rawMeta.remainingCredits >= 0) {
        remainingCredits = Math.max(0, Number(rawMeta.remainingCredits.toFixed(4)));
      } else {
        remainingCredits = Math.max(0, Number((currentBalance - creditsDeducted).toFixed(4)));
      }
    }

    setVibeCreditBalance(remainingCredits);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('lunao_has_used_ai_credits', 'true');
        const prevSpent = parseFloat(localStorage.getItem('lunao_ai_dollars_spent') || '0');
        const costNum = creditsDeducted * 0.01;
        localStorage.setItem('lunao_ai_dollars_spent', (prevSpent + costNum).toFixed(6));
      }
      const userId = getVibeUserId();
      fetch('/api/ai/deduct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-owner-key': userId,
          'x-user-plan': currentPlan,
        },
        body: JSON.stringify({
          userId,
          requestId: rawMeta?.requestId,
          creditsDeducted,
          remainingCredits,
          costUsd: (creditsDeducted * 0.01).toFixed(6),
          inputTokens,
          outputTokens,
          model: modelLabel,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d?.ok && typeof d.remainingCredits === 'number') {
            setVibeCreditBalance(d.remainingCredits);
          }
        })
        .catch(() => {});
    } catch {
      /* ignore background fetch errors */
    }
  }

  const costUsd = `$${(creditsDeducted * 0.01).toFixed(4)}`;
  const dollarValueRemaining = `$${(remainingCredits * 0.01).toFixed(2)}`;

  return {
    provider: rawMeta?.provider || (modelLabel.toLowerCase().includes('claude') ? 'Anthropic Claude' : 'Google Gemini'),
    model: modelLabel,
    modelId: rawMeta?.modelId,
    inputTokens,
    outputTokens,
    thoughtTokens,
    cachedReadTokens,
    totalTokens,
    latencyMs,
    creditsDeducted,
    remainingCredits,
    costUsd,
    dollarValueRemaining,
    timestamp: Date.now(),
  };
}

export function deductVibeCreditsForPrompt(params: {
  prompt: string;
  model?: string;
  plan?: string | null;
  baseDeduction?: number;
}): { success: boolean; metadata?: PromptMetadata; error?: string } {
  const check = hasSufficientVibeCredits(params.plan);
  if (!check.ok) {
    return {
      success: false,
      error: check.error,
    };
  }
  // Never deduct mocked credits without real provider token usage metadata
  const metadata = deductVibeCreditsFromMetadata(null, params.plan);
  return {
    success: true,
    metadata,
  };
}

/**
 * Synchronize client balance with authoritative Supabase account for this user.
 * Fetches ONE time per user and caches permanently in localStorage.
 * Subsequent visits/renders instantly read from the localStorage cache with 0 network latency.
 */
export async function syncAllowanceWithServer(force = false): Promise<{
  balanceCredits: number;
  monthlyCredits: number;
  plan: string;
} | null> {
  if (typeof window === 'undefined') return null;
  try {
    const userId = getVibeUserId();
    const localPlan =
      localStorage.getItem(`lunao_u_${userId}_plan`) ||
      localStorage.getItem('lunao_user_plan') ||
      'Free Plan';
    const isFree = normalizePlanKey(localPlan) === 'free';
    const syncCacheKey = `lunao_u_${userId}_ai_synced`;
    const hasSyncedOnce = localStorage.getItem(syncCacheKey) === 'true';
    const cachedBalanceRaw =
      localStorage.getItem(`lunao_u_${userId}_vibe_credits`) ??
      localStorage.getItem('lunao_vibe_credits');

    // Serve from localStorage cache if already fetched once
    if (!force && hasSyncedOnce && cachedBalanceRaw !== null) {
      const parsed = parseFloat(cachedBalanceRaw);
      const cachedBal = !Number.isNaN(parsed) && parsed >= 0 ? (isFree ? (parsed > 0 ? 1 : 0) : parsed) : (isFree ? 1 : 0);
      return {
        balanceCredits: cachedBal,
        monthlyCredits: isFree ? 1 : (getPlanAiConfig(localPlan).monthlyCredits || 600),
        plan: localPlan,
      };
    }

    const qs = new URLSearchParams({ userId, plan: localPlan });
    const res = await fetch(`/api/ai/allowance?${qs.toString()}`, {
      headers: {
        'x-owner-key': userId,
        'x-user-plan': localPlan,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.ok && data.status) {
      const activePlan = data.status.plan || localPlan;
      const config = getPlanAiConfig(activePlan);
      const isFreeActive = normalizePlanKey(activePlan) === 'free';
      const dollarsSpent = Number(data.status.dollarsSpent || 0);
      let balance = Number(data.status.balanceCredits);
      if (Number.isNaN(balance) || balance < 0) {
        balance = 0;
      }
      if (isFreeActive) {
        // Free tier: 1 prompt if never spent; 0 if already spent
        balance = dollarsSpent > 0 || balance <= 0 ? 0 : 1;
      }
      if (dollarsSpent > 0) {
        localStorage.setItem(`lunao_u_${userId}_ai_dollars_spent`, dollarsSpent.toFixed(6));
        localStorage.setItem('lunao_ai_dollars_spent', dollarsSpent.toFixed(6));
        localStorage.setItem('lunao_has_used_ai_credits', 'true');
      }
      setVibeCreditBalance(balance);
      localStorage.setItem(syncCacheKey, 'true');
      return {
        balanceCredits: balance,
        monthlyCredits: isFreeActive ? 1 : Number(data.status.monthlyCredits ?? config.monthlyCredits),
        plan: activePlan,
      };
    }
  } catch {
    /* ignore network error */
  }
  return null;
}
