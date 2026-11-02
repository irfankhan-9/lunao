// Pricing Registry for Multi-Provider AI Studio Models
// Canonical 100 Lunao AI credits = $1.00 USD internal provider cost ($0.01 = 1 credit).
import { getPgPool } from '../supabase.js';

export const CANONICAL_MODELS = {
  // Google Gemini
  'gemini-3.5-flash': {
    modelId: 'gemini-3.5-flash',
    provider: 'google',
    displayName: 'Gemini 3.5 Flash',
    description: 'Ultra-fast multimodal generation with exceptional latency and high accuracy.',
    speedTier: 'Fast',
    reasoningTier: 'Standard',
    isRecommended: false,
    inputCostPerMillion: 0.075,
    outputCostPerMillion: 0.30,
    cachedReadCostPerMillion: 0.01875,
    cacheWriteCostPerMillion: 0.0,
    contextThreshold: 128000,
    inputCostPerMillionTiered: 0.15,
    outputCostPerMillionTiered: 0.60,
  },
  'gemini-3.8-flash': {
    modelId: 'gemini-3.8-flash',
    provider: 'google',
    displayName: 'Gemini 3.8 Flash',
    description: 'Flagship workhorse for real-time frontend synthesis & live DOM compilation.',
    speedTier: 'Fastest',
    reasoningTier: 'High',
    isRecommended: true,
    inputCostPerMillion: 0.075,
    outputCostPerMillion: 0.30,
    cachedReadCostPerMillion: 0.01875,
    cacheWriteCostPerMillion: 0.0,
    contextThreshold: 128000,
    inputCostPerMillionTiered: 0.15,
    outputCostPerMillionTiered: 0.60,
    // Versioned rate change on Jan 1, 2027
    effective2027: {
      inputCostPerMillion: 0.15,
      outputCostPerMillion: 0.60,
      cachedReadCostPerMillion: 0.0375,
      cacheWriteCostPerMillion: 0.0,
      inputCostPerMillionTiered: 0.30,
      outputCostPerMillionTiered: 1.20,
    },
  },
  'gemini-3.1-pro-preview': {
    modelId: 'gemini-3.1-pro-preview',
    provider: 'google',
    displayName: 'Gemini 3.1 Pro Preview',
    description: 'Heavyweight reasoning model for complex architectural refactoring and rich micro-interactions.',
    speedTier: 'Balanced',
    reasoningTier: 'Deep Reasoning',
    isRecommended: false,
    inputCostPerMillion: 1.25,
    outputCostPerMillion: 5.00,
    cachedReadCostPerMillion: 0.3125,
    cacheWriteCostPerMillion: 0.0,
    contextThreshold: 128000,
    inputCostPerMillionTiered: 2.50,
    outputCostPerMillionTiered: 10.00,
  },
  // Anthropic Claude
  'claude-haiku-5-5': {
    modelId: 'claude-haiku-5-5',
    provider: 'anthropic',
    displayName: 'Claude Haiku 5.5',
    description: 'Rapid response Claude engine for instant text tweaks, SEO meta, and copy polish.',
    speedTier: 'Fast',
    reasoningTier: 'Standard',
    isRecommended: false,
    inputCostPerMillion: 0.80,
    outputCostPerMillion: 4.00,
    cachedReadCostPerMillion: 0.08,
    cacheWriteCostPerMillion: 1.00,
    contextThreshold: 200000,
    inputCostPerMillionTiered: 0.80,
    outputCostPerMillionTiered: 4.00,
  },
  'claude-sonnet-5-5': {
    modelId: 'claude-sonnet-5-5',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 5.5',
    description: 'State-of-the-art coding intelligence with deep semantic understanding of CSS & DOM layout.',
    speedTier: 'Balanced',
    reasoningTier: 'Advanced',
    isRecommended: false,
    inputCostPerMillion: 3.00,
    outputCostPerMillion: 15.00,
    cachedReadCostPerMillion: 0.30,
    cacheWriteCostPerMillion: 3.75,
    contextThreshold: 200000,
    inputCostPerMillionTiered: 3.00,
    outputCostPerMillionTiered: 15.00,
  },
  'claude-fable-5-1': {
    modelId: 'claude-fable-5-1',
    provider: 'anthropic',
    displayName: 'Claude Fable 5.1',
    description: 'Editorial storytelling and brand voice tuning for high-converting marketing copy.',
    speedTier: 'Balanced',
    reasoningTier: 'Advanced',
    isRecommended: false,
    inputCostPerMillion: 3.00,
    outputCostPerMillion: 15.00,
    cachedReadCostPerMillion: 0.30,
    cacheWriteCostPerMillion: 3.75,
    contextThreshold: 200000,
    inputCostPerMillionTiered: 3.00,
    outputCostPerMillionTiered: 15.00,
  },
};

export const DEFAULT_MODEL_ID = 'gemini-3.8-flash';

export function normalizeModelId(requested) {
  if (!requested) return DEFAULT_MODEL_ID;
  const raw = String(requested).trim().toLowerCase();
  if (CANONICAL_MODELS[raw]) return raw;
  if (raw.includes('3.8')) return 'gemini-3.8-flash';
  if (raw.includes('3.5') || raw.includes('flash')) return 'gemini-3.5-flash';
  if (raw.includes('3.1') || raw.includes('pro')) return 'gemini-3.1-pro-preview';
  if (raw.includes('haiku')) return 'claude-haiku-5-5';
  if (raw.includes('sonnet')) return 'claude-sonnet-5-5';
  if (raw.includes('fable')) return 'claude-fable-5-1';
  return DEFAULT_MODEL_ID;
}

/**
 * Retrieve rate card for a model at a given point in time (defaults to Date.now()).
 * Accurately handles effective date thresholds (e.g. Gemini 3.8 Flash rate change on Jan 1, 2027).
 */
export async function getModelRates(modelId, targetDate = new Date()) {
  const normId = normalizeModelId(modelId);
  const targetTime = targetDate instanceof Date ? targetDate.getTime() : new Date(targetDate).getTime();

  // Try DB query first
  const pool = getPgPool();
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM ai_model_pricing 
         WHERE model_id = $1 
           AND effective_from <= $2 
           AND (effective_until IS NULL OR effective_until >= $2)
         ORDER BY effective_from DESC 
         LIMIT 1`,
        [normId, new Date(targetTime).toISOString()]
      );

      if (rows && rows.length > 0) {
        const r = rows[0];
        return {
          modelId: r.model_id,
          provider: r.provider,
          displayName: r.display_name,
          description: r.description,
          speedTier: r.speed_tier,
          reasoningTier: r.reasoning_tier,
          isRecommended: r.is_recommended,
          inputCostPerMillion: Number(r.input_cost_per_million),
          outputCostPerMillion: Number(r.output_cost_per_million),
          cachedReadCostPerMillion: Number(r.cached_read_cost_per_million || 0),
          cacheWriteCostPerMillion: Number(r.cache_write_cost_per_million || 0),
          contextThreshold: Number(r.context_threshold || 128000),
          inputCostPerMillionTiered: Number(r.input_cost_per_million_tiered || r.input_cost_per_million),
          outputCostPerMillionTiered: Number(r.output_cost_per_million_tiered || r.output_cost_per_million),
          effectiveFrom: r.effective_from,
          effectiveUntil: r.effective_until,
        };
      }
    } catch (err) {
      console.warn('[pricingRegistry] DB lookup failed, falling back to static:', err.message);
    }
  }

  // Static fallback
  const base = CANONICAL_MODELS[normId] || CANONICAL_MODELS[DEFAULT_MODEL_ID];
  const jan1_2027 = new Date('2027-01-01T00:00:00Z').getTime();

  if (normId === 'gemini-3.8-flash' && targetTime >= jan1_2027 && base.effective2027) {
    return {
      ...base,
      ...base.effective2027,
      effectiveFrom: '2027-01-01T00:00:00Z',
      effectiveUntil: null,
    };
  }

  return {
    ...base,
    effectiveFrom: '2020-01-01T00:00:00Z',
    effectiveUntil: normId === 'gemini-3.8-flash' ? '2026-12-31T23:59:59Z' : null,
  };
}

/**
 * Calculate actual USD cost & credit consumption from token metadata.
 * Sub-cent precise decimal calculation:
 *   cost_usd = sum(tokens * rate / 1,000,000)
 *   credits  = cost_usd * 100
 */
export async function calculateUsageCost(modelId, tokenUsage = {}, targetDate = new Date()) {
  const rates = await getModelRates(modelId, targetDate);

  const inputTokens = Math.max(0, parseInt(tokenUsage.inputTokens || tokenUsage.promptTokens || 0, 10));
  const candidateTokens = Math.max(0, parseInt(tokenUsage.outputTokens || tokenUsage.candidatesTokens || 0, 10));
  const thoughtTokens = Math.max(0, parseInt(tokenUsage.thoughtTokens || tokenUsage.thoughtsTokens || 0, 10));
  const outputTokens = candidateTokens + thoughtTokens;
  const cachedReadTokens = Math.max(0, parseInt(tokenUsage.cachedReadTokens || tokenUsage.cachedTokens || 0, 10));
  const cacheWriteTokens = Math.max(0, parseInt(tokenUsage.cacheWriteTokens || 0, 10));
  const totalTokens = Math.max(inputTokens + outputTokens, parseInt(tokenUsage.totalTokens || 0, 10));

  // Determine tiered rates if context length exceeds threshold
  const isOverContextThreshold = inputTokens > rates.contextThreshold;
  const activeInputRate = isOverContextThreshold ? rates.inputCostPerMillionTiered : rates.inputCostPerMillion;
  const activeOutputRate = isOverContextThreshold ? rates.outputCostPerMillionTiered : rates.outputCostPerMillion;

  // Sub-cent USD calculations
  const inputCostUsd = (inputTokens * activeInputRate) / 1000000;
  const outputCostUsd = (outputTokens * activeOutputRate) / 1000000;
  const cachedReadCostUsd = (cachedReadTokens * rates.cachedReadCostPerMillion) / 1000000;
  const cacheWriteCostUsd = (cacheWriteTokens * rates.cacheWriteCostPerMillion) / 1000000;

  const totalCostUsd = inputCostUsd + outputCostUsd + cachedReadCostUsd + cacheWriteCostUsd;

  // 100 Lunao AI credits = $1.00 USD (exact 1 credit = $0.01)
  const credits = totalCostUsd * 100;

  return {
    modelId: rates.modelId,
    provider: rates.provider,
    totalCostUsd: Number(totalCostUsd.toFixed(8)),
    credits: Number(credits.toFixed(4)),
    inputTokens,
    outputTokens,
    thoughtTokens,
    cachedReadTokens,
    cacheWriteTokens,
    totalTokens,
    rates,
    breakdown: {
      inputCostUsd: Number(inputCostUsd.toFixed(8)),
      outputCostUsd: Number(outputCostUsd.toFixed(8)),
      cachedReadCostUsd: Number(cachedReadCostUsd.toFixed(8)),
      cacheWriteCostUsd: Number(cacheWriteCostUsd.toFixed(8)),
      isOverContextThreshold,
    },
  };
}

/**
 * Return list of all available models grouped for the frontend Studio UI.
 */
export async function listStudioModels() {
  const models = [];
  for (const id of Object.keys(CANONICAL_MODELS)) {
    const rate = await getModelRates(id);
    models.push({
      id: rate.modelId,
      provider: rate.provider,
      providerLabel: rate.provider === 'google' ? 'Google Gemini' : 'Anthropic Claude',
      displayName: rate.displayName,
      description: rate.description,
      speedTier: rate.speedTier,
      reasoningTier: rate.reasoningTier,
      isRecommended: rate.isRecommended,
      contextThreshold: rate.contextThreshold,
    });
  }
  return models;
}
