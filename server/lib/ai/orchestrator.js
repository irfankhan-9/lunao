// Central AI Web Studio Orchestrator
// Coordinates preflight reservations, provider dispatch, streaming, HTML cleanup, and atomic settlement.
import { normalizeModelId, getModelRates } from './pricingRegistry.js';
import { reserveBudget, settleUsage } from './accountingService.js';
import { streamGeminiEdit } from './geminiAdapter.js';
import { streamAnthropicEdit } from './anthropicAdapter.js';
import { replaceBookingWithPhoneCta, hasBookingForm } from '../aiStudioBookingGuard.js';

export function cleanHtmlOutput(text) {
  let out = (text || '').trim();
  const fence = out.match(/```(?:html)?\s*([\s\S]*?)\s*```/i);
  if (fence && fence[1]) {
    out = fence[1].trim();
  }

  const docStart = out.search(/<!doctype\s+html|<html[\s>]/i);
  const docEndMatch = out.match(/<\/html\s*>/i);
  if (docStart !== -1 && docEndMatch && docEndMatch.index !== undefined) {
    out = out.slice(docStart, docEndMatch.index + docEndMatch[0].length).trim();
  }

  const lower = out.toLowerCase();
  if (
    !out ||
    out.length < 40 ||
    (!lower.includes('<!doctype') && !lower.includes('<html')) ||
    !lower.includes('</html>')
  ) {
    throw new Error('AI servers busy, try later.');
  }

  if (hasBookingForm(out)) {
    out = replaceBookingWithPhoneCta(out);
  }
  return out;
}

/**
 * Main streaming orchestrator for AI Web Studio.
 */
export async function orchestrateAiEditStream({
  html,
  instruction,
  history = [],
  model = 'gemini-3.5-flash',
  userId = 'default_owner',
  requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  planHint = null,
  anthropicApiKey,
  geminiApiKey,
  apiKey,
  maxOutputTokens = 8192,
  onStart,
  onChunk,
  onThinking,
}) {
  const normModel = normalizeModelId(model);
  const rates = await getModelRates(normModel);

  // 1. Preflight Atomic Reservation in Supabase / Local Account
  const reservation = await reserveBudget({
    userId,
    requestId,
    modelId: normModel,
    promptText: instruction,
    maxOutputTokens,
    planHint,
  });

  if (onStart) onStart();

  const isAnthropic = rates.provider === 'anthropic';
  const hasAnthropicKey = Boolean(
    (anthropicApiKey && String(anthropicApiKey).trim().length > 5) ||
    (process.env.ANTHROPIC_API_KEY && String(process.env.ANTHROPIC_API_KEY).trim().length > 5)
  );
  const effectiveApiKey = isAnthropic
    ? (anthropicApiKey || apiKey)
    : (geminiApiKey || apiKey);

  let streamResult = null;
  let errorOccurred = null;

  try {
    if (isAnthropic && hasAnthropicKey) {
      try {
        streamResult = await streamAnthropicEdit(
          { html, instruction, history, model: normModel, apiKey: effectiveApiKey, maxOutputTokens },
          onChunk,
          onThinking,
        );
      } catch (anthErr) {
        console.warn(`[orchestrator] Anthropic adapter notice on ${normModel}, routing via primary engine:`, anthErr.message);
        streamResult = await streamGeminiEdit(
          { html, instruction, history, model: normModel, apiKey: geminiApiKey || apiKey, maxOutputTokens },
          onChunk,
          onThinking,
        );
      }
    } else {
      streamResult = await streamGeminiEdit(
        { html, instruction, history, model: normModel, apiKey: geminiApiKey || apiKey, maxOutputTokens },
        onChunk,
        onThinking,
      );
    }
  } catch (err) {
    errorOccurred = err;
  }

  // 2. Failure Handling: zero credits deducted if generation failed
  if (errorOccurred || !streamResult || !streamResult.html) {
    const errorMsg = errorOccurred?.message || 'Generation failed to complete.';
    await settleUsage({
      requestId,
      modelId: normModel,
      latencyMs: streamResult?.latencyMs || 0,
      status: 'failed',
      errorMessage: errorMsg,
    });
    throw errorOccurred || new Error(errorMsg);
  }

  // 3. Validation & Sanitization: verify AI actually wrote valid HTML code
  let cleanedHtml = '';
  try {
    cleanedHtml = cleanHtmlOutput(streamResult.html);
    if (cleanedHtml.trim() === (html || '').trim()) {
      throw new Error('AI returned unchanged markup — no credits charged.');
    }
  } catch (cleanErr) {
    await settleUsage({
      requestId,
      modelId: normModel,
      latencyMs: streamResult.latencyMs,
      status: 'failed',
      errorMessage: cleanErr.message || 'Output HTML failed structure validation',
    });
    throw cleanErr;
  }

  // 4. Atomic Settlement with Real Token Usage & Model Rate Card (100 AI credits = $1.00 USD)
  const settlement = await settleUsage({
    requestId,
    modelId: normModel,
    tokenUsage: streamResult.tokenUsage,
    latencyMs: streamResult.latencyMs,
    status: 'settled',
    metadata: {
      modelDisplayName: rates.displayName,
      provider: rates.provider,
      inputCostPerMillion: rates.inputCostPerMillion,
      outputCostPerMillion: rates.outputCostPerMillion,
    },
  });

  const metadata = {
    provider: rates.provider === 'google' ? 'Google Gemini' : 'Anthropic Claude',
    model: rates.displayName,
    modelId: normModel,
    inputTokens: settlement?.costData?.inputTokens ?? streamResult.tokenUsage.inputTokens,
    outputTokens: settlement?.costData?.outputTokens ?? streamResult.tokenUsage.outputTokens,
    thoughtTokens: settlement?.costData?.thoughtTokens ?? streamResult.tokenUsage.thoughtTokens,
    cachedReadTokens: settlement?.costData?.cachedReadTokens ?? streamResult.tokenUsage.cachedReadTokens,
    totalTokens: settlement?.costData?.totalTokens ?? streamResult.tokenUsage.totalTokens,
    latencyMs: streamResult.latencyMs,
    creditsDeducted: settlement.actualCredits,
    remainingCredits: settlement.balanceAfter,
    actualCostUsd: settlement.actualCostUsd,
    inputRatePerMillion: rates.inputCostPerMillion,
    outputRatePerMillion: rates.outputCostPerMillion,
    requestId,
    userId,
    timestamp: Date.now(),
  };

  return {
    html: cleanedHtml,
    metadata,
  };
}
