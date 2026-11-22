// Central AI Web Studio Orchestrator
// Coordinates preflight reservations, provider dispatch, streaming, HTML cleanup, and atomic settlement.
import { normalizeModelId, getModelRates } from './pricingRegistry.js';
import { reserveBudget, settleUsage } from './accountingService.js';
import { streamGeminiEdit } from './geminiAdapter.js';
import { streamAnthropicEdit } from './anthropicAdapter.js';
import { replaceBookingWithPhoneCta, hasBookingForm } from '../aiStudioBookingGuard.js';

export function cleanAndRepairHtmlOutput(text) {
  let out = (text || '').trim();

  // 1. Strip closed markdown fences first, then any unclosed leading/trailing fences
  const closedFence = out.match(/```(?:html)?\s*([\s\S]*?)\s*```/i);
  if (closedFence && closedFence[1]) {
    out = closedFence[1].trim();
  } else {
    out = out
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  const docStart = out.search(/<!doctype\s+html|<html[\s>]/i);
  if (docStart !== -1) {
    out = out.slice(docStart).trim();
  }

  const docEndMatch = out.match(/<\/html\s*>/i);
  if (docEndMatch && docEndMatch.index !== undefined) {
    out = out.slice(0, docEndMatch.index + docEndMatch[0].length).trim();
  }

  let lower = out.toLowerCase();
  let wasRepaired = false;

  const hasDocRoot = lower.includes('<!doctype') || lower.includes('<html') || lower.includes('<body');
  const hasBodyStructure =
    lower.includes('<body') ||
    lower.includes('<section') ||
    lower.includes('<main') ||
    lower.includes('<div') ||
    lower.includes('<header');

  // 2. Deterministic repair if stream truncated right before closing tags
  if (hasDocRoot && hasBodyStructure && out.length >= 120 && !lower.includes('</html>')) {
    // Trim a partial incomplete opening tag at the exact tail (e.g. "<div class=\"foo")
    out = out.replace(/<[a-zA-Z!/?][^>]*$/s, '').trim();
    lower = out.toLowerCase();

    const lastStyleOpen = lower.lastIndexOf('<style');
    const lastStyleClose = lower.lastIndexOf('</style>');
    if (lastStyleOpen !== -1 && lastStyleOpen > lastStyleClose) {
      out += '\n</style>';
      lower = out.toLowerCase();
    }

    const lastScriptOpen = lower.lastIndexOf('<script');
    const lastScriptClose = lower.lastIndexOf('</script>');
    if (lastScriptOpen !== -1 && lastScriptOpen > lastScriptClose) {
      out += '\n</script>';
      lower = out.toLowerCase();
    }

    if (lower.includes('<body') && !lower.includes('</body>')) {
      out += '\n</body>';
    }
    out += '\n</html>';
    lower = out.toLowerCase();
    wasRepaired = true;
  }

  if (
    !out ||
    out.length < 40 ||
    (!lower.includes('<!doctype') && !lower.includes('<html')) ||
    !lower.includes('</html>')
  ) {
    throw Object.assign(new Error('AI returned incomplete HTML markup. Please retry.'), {
      code: 'INCOMPLETE_HTML',
      statusCode: 502,
    });
  }

  if (hasBookingForm(out)) {
    out = replaceBookingWithPhoneCta(out);
  }
  return { html: out, wasRepaired };
}

export function cleanHtmlOutput(text) {
  return cleanAndRepairHtmlOutput(text).html;
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
  maxOutputTokens = 32768,
  signal,
  onStart,
  onChunk,
  onThinking,
  onReset,
}) {
  const normModel = normalizeModelId(model);
  const rates = await getModelRates(normModel);

  // 1. Preflight Atomic Reservation in Supabase / Local Account
  await reserveBudget({
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
          { html, instruction, history, model: normModel, apiKey: effectiveApiKey, maxOutputTokens, signal, onReset },
          onChunk,
          onThinking,
        );
      } catch (anthErr) {
        if (signal?.aborted) throw anthErr;
        console.warn(`[orchestrator] Anthropic adapter notice on ${normModel}, routing via primary engine:`, anthErr.message);
        if (onReset) onReset();
        streamResult = await streamGeminiEdit(
          { html, instruction, history, model: normModel, apiKey: geminiApiKey || apiKey, maxOutputTokens, signal, onReset },
          onChunk,
          onThinking,
        );
      }
    } else {
      streamResult = await streamGeminiEdit(
        { html, instruction, history, model: normModel, apiKey: geminiApiKey || apiKey, maxOutputTokens, signal, onReset },
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
    settleUsage({
      requestId,
      userId,
      modelId: normModel,
      latencyMs: streamResult?.latencyMs || 0,
      status: 'failed',
      errorMessage: errorMsg,
      backgroundPersist: true,
    }).catch(() => {});
    throw errorOccurred || Object.assign(new Error(errorMsg), { code: 'GENERATION_ERROR', statusCode: 500 });
  }

  // 3. Validation, Repair & Sanitization: verify AI actually wrote valid HTML code
  let cleanedHtml = '';
  let wasRepaired = false;
  try {
    const cleaned = cleanAndRepairHtmlOutput(streamResult.html);
    cleanedHtml = cleaned.html;
    wasRepaired = cleaned.wasRepaired;
    if (cleanedHtml.trim() === (html || '').trim()) {
      throw Object.assign(new Error('AI returned unchanged markup — no credits charged. Try a more specific edit instruction.'), {
        code: 'UNCHANGED_MARKUP',
        statusCode: 422,
      });
    }
  } catch (cleanErr) {
    settleUsage({
      requestId,
      userId,
      modelId: normModel,
      latencyMs: streamResult.latencyMs,
      status: 'failed',
      errorMessage: cleanErr.message || 'Output HTML failed structure validation',
      backgroundPersist: true,
    }).catch(() => {});
    throw cleanErr;
  }

  // 4. Fast Non-Blocking Settlement: compute cost & balance immediately so 'done' is never delayed by Supabase
  let settlement = null;
  try {
    settlement = await settleUsage({
      requestId,
      userId,
      modelId: normModel,
      tokenUsage: streamResult.tokenUsage,
      latencyMs: streamResult.latencyMs,
      status: 'settled',
      backgroundPersist: true,
      metadata: {
        userId,
        modelDisplayName: rates.displayName,
        provider: rates.provider,
        modelUsed: streamResult.modelUsed,
        finishReason: streamResult.finishReason,
        wasRepaired,
        inputCostPerMillion: rates.inputCostPerMillion,
        outputCostPerMillion: rates.outputCostPerMillion,
      },
    });
  } catch (settleErr) {
    console.warn(`[orchestrator] Settlement notice (non-fatal) for ${requestId}:`, settleErr.message);
  }

  console.log(
    `[orchestrator] requestId=${requestId} model=${streamResult.modelUsed || normModel} latencyMs=${streamResult.latencyMs} finishReason=${streamResult.finishReason || 'unknown'} chars=${cleanedHtml.length} repaired=${wasRepaired}`,
  );

  const metadata = {
    provider: rates.provider === 'google' ? 'Google Gemini' : 'Anthropic Claude',
    model: rates.displayName,
    modelId: normModel,
    modelUsed: streamResult.modelUsed || normModel,
    finishReason: streamResult.finishReason || 'STOP',
    wasRepaired,
    inputTokens: settlement?.costData?.inputTokens ?? streamResult.tokenUsage.inputTokens,
    outputTokens: settlement?.costData?.outputTokens ?? streamResult.tokenUsage.outputTokens,
    thoughtTokens: settlement?.costData?.thoughtTokens ?? streamResult.tokenUsage.thoughtTokens,
    cachedReadTokens: settlement?.costData?.cachedReadTokens ?? streamResult.tokenUsage.cachedReadTokens,
    totalTokens: settlement?.costData?.totalTokens ?? streamResult.tokenUsage.totalTokens,
    latencyMs: streamResult.latencyMs,
    creditsDeducted: settlement?.actualCredits ?? 0,
    remainingCredits: settlement?.balanceAfter ?? 0,
    actualCostUsd: settlement?.actualCostUsd ?? 0,
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
