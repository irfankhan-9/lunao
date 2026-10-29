// Single source of truth for Lunao AI Vibe Credits
// Plan Allocations:
//   Starter: 500 AI credits ($7 real money value)
//   Pro:     1,200 AI credits ($12 real money value)
//   Agency:  2,500 AI credits ($15 real money value)
//   Free:    0 AI credits (trial upgrade required)

export interface PlanAiCredits {
  planKey: 'starter' | 'pro' | 'agency' | 'free';
  planName: string;
  monthlyCredits: number;
  dollarValue: number;
  creditCostUsd: number;
}

export const PLAN_AI_CREDITS: Record<string, PlanAiCredits> = {
  starter: {
    planKey: 'starter',
    planName: 'Starter Plan',
    monthlyCredits: 500,
    dollarValue: 7,
    creditCostUsd: 7 / 500, // $0.014/credit
  },
  pro: {
    planKey: 'pro',
    planName: 'Pro Plan',
    monthlyCredits: 1200,
    dollarValue: 12,
    creditCostUsd: 12 / 1200, // $0.010/credit
  },
  growth: {
    planKey: 'pro',
    planName: 'Pro Plan',
    monthlyCredits: 1200,
    dollarValue: 12,
    creditCostUsd: 12 / 1200,
  },
  agency: {
    planKey: 'agency',
    planName: 'Agency Plan',
    monthlyCredits: 2500,
    dollarValue: 15,
    creditCostUsd: 15 / 2500, // $0.006/credit
  },
  free: {
    planKey: 'free',
    planName: 'Free Plan',
    monthlyCredits: 0,
    dollarValue: 0,
    creditCostUsd: 0,
  },
};

export interface PromptMetadata {
  provider: string; // 'Google AI Studio'
  model: string;    // 'Gemini 2.5 Flash'
  inputTokens: number;
  outputTokens: number;
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
  return PLAN_AI_CREDITS[key] || PLAN_AI_CREDITS.starter;
}

export function isVibeEligiblePlan(planName?: string | null): boolean {
  const key = normalizePlanKey(planName);
  return key === 'starter' || key === 'pro' || key === 'agency';
}

export function getVibeCreditBalance(explicitPlan?: string | null): number {
  if (typeof window === 'undefined') return 500;
  try {
    const raw = localStorage.getItem('lunao_vibe_credits');
    if (raw !== null) {
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
  } catch {
    /* fallback to plan default */
  }

  // Fallback to active plan default
  const activePlan = explicitPlan || (typeof localStorage !== 'undefined' ? localStorage.getItem('lunao_user_plan') : null) || 'Starter Plan';
  const config = getPlanAiConfig(activePlan);
  const defaultBalance = config.monthlyCredits;

  try {
    localStorage.setItem('lunao_vibe_credits', String(defaultBalance));
  } catch {
    /* ignore */
  }

  return defaultBalance;
}

export function setVibeCreditBalance(newBalance: number): void {
  const clamped = Math.max(0, Math.round(newBalance));
  try {
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
  setVibeCreditBalance(config.monthlyCredits);
  return config.monthlyCredits;
}

export interface RawProviderMetadata {
  provider?: string;
  model?: string;
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
}

export function hasSufficientVibeCredits(planName?: string | null): {
  ok: boolean;
  balance: number;
  error?: string;
} {
  const currentPlan =
    planName ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('lunao_user_plan') : null) ||
    'Starter Plan';
  const currentBalance = getVibeCreditBalance(currentPlan);
  if (currentBalance <= 0) {
    return {
      ok: false,
      balance: 0,
      error: 'Insufficient AI credits (0 remaining). Please top up or upgrade your plan.',
    };
  }
  return {
    ok: true,
    balance: currentBalance,
  };
}

/**
 * Intelligently calculates and deducts Lunao AI Credits at the end of a prompt
 * using the real token counts returned in the provider's usageMetadata, scaled
 * to each plan's real dollar allocation:
 *   Starter Plan: $7.00  = 500 AI Credits   ($0.014 / credit)
 *   Pro Plan:     $12.00 = 1,200 AI Credits ($0.010 / credit)
 *   Agency Plan:  $15.00 = 2,500 AI Credits ($0.006 / credit)
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
  const planConfig = getPlanAiConfig(currentPlan);
  const currentBalance = getVibeCreditBalance(currentPlan);

  const modelLabel = rawMeta?.model || 'Gemini 2.5 Flash';
  const normModel = modelLabel.toLowerCase();

  // Real token counts reported by Google AI Studio Gemini usageMetadata
  const inputTokens = Math.max(
    1,
    Number(rawMeta?.inputTokens) || 850,
  );
  const outputTokens = Math.max(
    1,
    Number(rawMeta?.outputTokens) || Math.max(400, Math.ceil(fallbackOutputChars / 4)),
  );
  const totalTokens = Number(rawMeta?.totalTokens) || inputTokens + outputTokens;
  const latencyMs = Number(rawMeta?.latencyMs) || 1200;

  // Real studio compute cost in USD per 1,000 tokens by model tier
  let inputRatePer1k = 0.008;
  let outputRatePer1k = 0.032;
  if (normModel.includes('3.1') || normModel.includes('pro')) {
    inputRatePer1k = 0.016;
    outputRatePer1k = 0.056;
  } else if (normModel.includes('3.8')) {
    inputRatePer1k = 0.011;
    outputRatePer1k = 0.040;
  }

  const realPromptCostUsd =
    (inputTokens / 1000) * inputRatePer1k +
    (outputTokens / 1000) * outputRatePer1k;

  // Convert real USD usage to plan-specific Lunao AI Credits:
  // credits = realPromptCostUsd / planConfig.creditCostUsd
  const creditCostUsd = planConfig.creditCostUsd > 0 ? planConfig.creditCostUsd : 7 / 500;
  const rawCredits = Math.round(realPromptCostUsd / creditCostUsd);
  const creditsDeducted = Math.min(currentBalance, Math.max(1, rawCredits));
  const remainingCredits = Math.max(0, currentBalance - creditsDeducted);

  setVibeCreditBalance(remainingCredits);

  const costUsd = `$${(creditsDeducted * creditCostUsd).toFixed(3)}`;
  const dollarValueRemaining = `$${(remainingCredits * creditCostUsd).toFixed(2)}`;

  return {
    provider: rawMeta?.provider || 'Google AI Studio',
    model: modelLabel,
    inputTokens,
    outputTokens,
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
  const prompt = params.prompt || '';
  const check = hasSufficientVibeCredits(params.plan);
  if (!check.ok) {
    return {
      success: false,
      error: check.error,
    };
  }
  const metadata = deductVibeCreditsFromMetadata(
    {
      provider: 'Google AI Studio',
      model: params.model || 'Gemini 2.5 Flash',
      inputTokens: Math.max(120, Math.ceil(prompt.length / 3.5)),
      outputTokens: 3200,
      latencyMs: 1850,
    },
    params.plan,
  );
  return {
    success: true,
    metadata,
  };
}
