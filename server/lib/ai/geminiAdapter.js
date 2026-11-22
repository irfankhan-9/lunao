// Google Gemini Adapter for AI Web Studio
// Models: gemini-3.5-flash, gemini-3.8-flash (default), gemini-3.1-pro-preview
import { GoogleGenAI } from '@google/genai';
import { gemini as geminiCfg } from '../config.js';

let _geminiClient = null;

function getClient(customApiKey) {
  const rawKey = customApiKey || process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY || geminiCfg.apiKey;
  const apiKey = rawKey && typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!apiKey || apiKey.length < 5) return null;

  if (customApiKey) {
    return new GoogleGenAI({
      apiKey: customApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  if (!_geminiClient) {
    _geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return _geminiClient;
}

const SYSTEM_PROMPT = `You are Lunao AI, an elite principal front-end architect and conversion-rate optimization expert designing high-ticket B2B local business websites.

STRICT TEMPLATE ARCHITECTURE & REBRANDING RULES:
Every website you build, edit, or customize is part of the Lunao automated template & rebranding engine.
You MUST strictly adhere to the following rules:

1. SINGLE COMPLETE HTML FILE:
Every website must be one complete HTML file with embedded CSS and JavaScript.
- Start at <!DOCTYPE html> and end at </html>.
- All styles inside a single <style> tag in <head>. Responsive mobile-first CSS (breakpoints at 640px and 1024px).
- All icons as inline SVGs. Google Fonts loaded via <link rel="stylesheet"> from fonts.googleapis.com.
- Do NOT use external CSS stylesheets.
- NO markdown fences (\`\`\`html or \`\`\`). NO explanations or commentary outside the HTML document.

2. STRICT APPROVED CANONICAL PLACEHOLDERS:
Use ONLY these exact uppercase handlebar tags:
- {{BUSINESS_NAME}} : Full business name.
- {{BUSINESS_NAME_SHORT}} : Compact single-word brand name for badges and nav logos.
- {{PHONE_DISPLAY}} : Human-friendly phone format for display (e.g. "(512) 555-0199").
- {{PHONE_RAW}} : Digits only for dial links: <a href="tel:{{PHONE_RAW}}">.
- {{CITY}} : Target city / location (e.g. "Austin, TX").
- {{ADDRESS}} : Street or downtown address.
- {{EMAIL}} : Business contact email.

3. AI WEBSITE STUDIO TEMPORARY BOOKING RESTRICTION:
- Online booking forms are temporarily disabled.
- Do NOT generate booking forms, date/time pickers, or reservation inputs.
- Always use a prominent direct phone call-to-action button (<a href="tel:{{PHONE_RAW}}" class="btn-cta">Call {{PHONE_DISPLAY}}</a>).

4. TARGETED EDITS & SPEED:
- Modify ONLY the parts of CURRENT HTML needed to fulfill EDIT INSTRUCTION while preserving the rest of the existing HTML document intact, unless the user explicitly asks for a full redesign.

5. BEAUTIFUL ANIMATIONS & MODERN VISUAL POLISH:
- Make sure the generated website is exceptionally beautiful, modern, and engaging with tasteful, fluid animations.
- Include smooth CSS transitions, subtle hover micro-interactions on cards and buttons, gentle fade-in and slide-up keyframe animations for hero elements, floating subtle badge effects, and smooth scroll behavior.
- Ensure all animations are performance-optimized, clean, and elegant using pure modern CSS (cubic-bezier easing, hardware-accelerated transforms).`;

function buildGeminiPrompt(html, instruction, history = []) {
  const convo = (history || [])
    .filter(m => m && m.role && m.content)
    .slice(-6)
    .map(m => `${m.role === 'assistant' ? 'You previously' : 'User asked'}: ${m.content}`)
    .join('\n');

  return [
    convo ? `Recent conversation context:\n${convo}\n` : '',
    'CURRENT HTML:',
    '```html',
    html || '',
    '```',
    '',
    `EDIT INSTRUCTION: ${instruction}`,
    '',
    'Return the complete updated single-file HTML document only. No markdown fences, no explanations.',
  ].filter(Boolean).join('\n');
}

function resolveGeminiCandidates(requestedModel) {
  const norm = String(requestedModel || '').toLowerCase();
  const envModel = process.env.GEMINI_MODEL ? process.env.GEMINI_MODEL.trim() : '';
  const envProModel = process.env.GEMINI_PRO_MODEL ? process.env.GEMINI_PRO_MODEL.trim() : '';

  let list;
  if (norm.includes('3.1') || norm.includes('pro')) {
    list = [
      envProModel || 'gemini-3.1-pro-preview',
      'gemini-3-flash-preview',
      envModel || 'gemini-3-flash-preview',
      'gemini-flash-latest',
      'gemini-2.5-pro',
    ];
  } else if (norm.includes('lite')) {
    list = [
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview',
      envModel || 'gemini-3-flash-preview',
      'gemini-flash-latest',
      'gemini-2.5-flash-lite',
    ];
  } else {
    list = [
      envModel || 'gemini-3-flash-preview',
      'gemini-3-flash-preview',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash-lite',
    ];
  }

  return Array.from(new Set(list.filter(Boolean)));
}

function classifyGeminiError(err) {
  const msg = String(err?.message || err || '');
  const status = Number(err?.status || err?.statusCode || err?.code || 0);
  const lower = msg.toLowerCase();

  if (status === 401 || status === 403 || lower.includes('api key') || lower.includes('permission') || lower.includes('unauthorized')) {
    return Object.assign(new Error('AI service authentication is not configured properly.'), {
      code: 'AUTH_CONFIG_ERROR',
      statusCode: status || 401,
      retryable: false,
    });
  }
  if (status === 429 || lower.includes('quota') || lower.includes('rate limit') || lower.includes('resource_exhausted')) {
    return Object.assign(new Error('AI model rate limit reached. Please retry in a moment or switch models.'), {
      code: 'RATE_LIMITED',
      statusCode: 429,
      retryable: true,
    });
  }
  if (lower.includes('timeout') || lower.includes('aborted') || lower.includes('timed out')) {
    return Object.assign(new Error('AI generation timed out before completing. Please retry.'), {
      code: 'STREAM_TIMEOUT',
      statusCode: 504,
      retryable: true,
    });
  }
  if (status === 404 || lower.includes('not found') || lower.includes('is not supported')) {
    return Object.assign(new Error(msg || 'Requested AI model is unavailable.'), {
      code: 'MODEL_UNAVAILABLE',
      statusCode: 404,
      retryable: true,
    });
  }
  if (status >= 500 || lower.includes('overloaded') || lower.includes('unavailable') || lower.includes('econnreset') || lower.includes('socket')) {
    return Object.assign(new Error('AI servers are temporarily busy. Please try again.'), {
      code: 'MODEL_UNAVAILABLE',
      statusCode: status || 503,
      retryable: true,
    });
  }
  return Object.assign(new Error(msg || 'AI generation failed. Please try again.'), {
    code: err?.code || 'GENERATION_ERROR',
    statusCode: status || 500,
    retryable: true,
  });
}

function extractGeminiChunkParts(chunk) {
  let text = '';
  let thought = '';
  const candidate = chunk?.candidates?.[0];
  const parts = candidate?.content?.parts;
  const finishReason = candidate?.finishReason || null;

  if (Array.isArray(parts) && parts.length > 0) {
    for (const part of parts) {
      if (!part || typeof part.text !== 'string' || !part.text) continue;
      if (part.thought) {
        thought += part.text;
      } else {
        text += part.text;
      }
    }
  } else {
    try {
      text = chunk?.text || '';
    } catch {
      text = '';
    }
  }

  return { text, thought, finishReason };
}

async function consumeStreamWithIdleTimeout(stream, { idleTimeoutMs = 25000, signal, onChunk, onThinking }) {
  let fullHtml = '';
  let lastUsageMetadata = null;
  let lastFinishReason = null;

  const iterator = stream[Symbol.asyncIterator]();
  while (true) {
    if (signal?.aborted) {
      throw new Error('Request aborted by client.');
    }

    let idleTimer = null;
    const nextPromise = iterator.next();
    const timeoutPromise = new Promise((_, reject) => {
      idleTimer = setTimeout(() => {
        reject(new Error('AI stream idle timeout exceeded.'));
      }, idleTimeoutMs);
    });

    let step;
    try {
      step = await Promise.race([nextPromise, timeoutPromise]);
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
    }

    if (step.done) break;
    const chunk = step.value;
    if (chunk?.usageMetadata) {
      lastUsageMetadata = chunk.usageMetadata;
    }

    const { text, thought, finishReason } = extractGeminiChunkParts(chunk);
    if (finishReason) {
      lastFinishReason = finishReason;
    }
    if (thought && onThinking) {
      onThinking(thought);
    }
    if (text) {
      fullHtml += text;
      if (onChunk) onChunk(text);
    }
  }

  return { fullHtml, lastUsageMetadata, lastFinishReason };
}

async function attemptGeminiContinuation({ client, modelName, partialHtml, onChunk, signal }) {
  const lower = partialHtml.toLowerCase();
  if (lower.includes('</html>')) return { extraHtml: '', usageMetadata: null };
  if (!lower.includes('<html') && !lower.includes('<!doctype')) return { extraHtml: '', usageMetadata: null };
  if (partialHtml.length < 250) return { extraHtml: '', usageMetadata: null };

  const tail = partialHtml.slice(-1800);
  const contPrompt = [
    'The previous HTML website generation hit the output token limit right before finishing.',
    'Continue IMMEDIATELY from the exact last character of the snippet below and finish all remaining sections, closing </body> and </html> tags.',
    'Do NOT repeat anything already present in the snippet. Do NOT output markdown fences or explanations.',
    '',
    'TAIL OF GENERATED HTML:',
    tail,
  ].join('\n');

  let timer = null;
  try {
    const resp = await Promise.race([
      client.models.generateContent({
        model: modelName,
        contents: contPrompt,
        config: {
          temperature: 0.2,
          maxOutputTokens: 4096,
        },
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Continuation timeout')), 15000);
      }),
    ]);
    if (signal?.aborted) return { extraHtml: '', usageMetadata: null };
    let extra = '';
    try {
      extra = resp?.text || '';
    } catch {
      extra = '';
    }
    extra = extra.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '');
    if (extra && onChunk) {
      onChunk(extra);
    }
    return { extraHtml: extra, usageMetadata: resp?.usageMetadata || null };
  } catch (contErr) {
    console.warn(`[geminiAdapter] Continuation attempt notice on ${modelName}:`, contErr.message);
    return { extraHtml: '', usageMetadata: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Stream an edit using Google Gemini.
 * Full-lifecycle fallback wraps both stream initiation and chunk reading.
 * Returns { html, tokenUsage, latencyMs, finishReason, modelUsed }.
 */
export async function streamGeminiEdit(
  { html, instruction, history, model = 'gemini-3.8-flash', apiKey, maxOutputTokens = 32768, signal, onReset },
  onChunk,
  onThinking,
) {
  const client = getClient(apiKey);
  const startTime = Date.now();

  if (!client) {
    console.warn(`[geminiAdapter] No API client initialized. Cannot fulfill request.`);
    throw Object.assign(new Error('Gemini API key is not configured on the server.'), {
      code: 'AUTH_CONFIG_ERROR',
      statusCode: 401,
    });
  }

  const candidates = resolveGeminiCandidates(model);
  const prompt = buildGeminiPrompt(html, instruction, history);
  const isProReasoning = String(model).toLowerCase().includes('pro') || String(model).toLowerCase().includes('fable');
  const requestedTokens = Math.min(Math.max(Number(maxOutputTokens) || 32768, 16384), 65536);

  let lastClassifiedErr = null;

  for (let idx = 0; idx < candidates.length; idx++) {
    const candidate = candidates[idx];
    if (signal?.aborted) {
      throw Object.assign(new Error('Generation cancelled.'), { code: 'ABORTED', statusCode: 499 });
    }

    // Try with thinkingConfig first; if model rejects thinkingConfig or token limit, adjust once on same candidate.
    const configsToTry = [
      {
        maxOutputTokens: requestedTokens,
        thinkingConfig: isProReasoning ? { thinkingBudget: 512 } : { thinkingBudget: 0 },
      },
      {
        maxOutputTokens: Math.min(requestedTokens, 8192),
        thinkingConfig: null,
      },
    ];

    for (const cfg of configsToTry) {
      let emittedForCandidate = false;
      let openTimer = null;

      try {
        const genConfig = {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.3,
          maxOutputTokens: cfg.maxOutputTokens,
        };
        if (cfg.thinkingConfig) {
          genConfig.thinkingConfig = cfg.thinkingConfig;
        }

        const stream = await Promise.race([
          client.models.generateContentStream({
            model: candidate,
            contents: prompt,
            config: genConfig,
          }),
          new Promise((_, reject) => {
            openTimer = setTimeout(() => reject(new Error('AI stream open timeout exceeded.')), 25000);
          }),
        ]);
        if (openTimer) {
          clearTimeout(openTimer);
          openTimer = null;
        }

        const { fullHtml: streamedHtml, lastUsageMetadata, lastFinishReason } = await consumeStreamWithIdleTimeout(
          stream,
          {
            idleTimeoutMs: 25000,
            signal,
            onThinking,
            onChunk: (delta) => {
              emittedForCandidate = true;
              if (onChunk) onChunk(delta);
            },
          },
        );

        let fullHtml = streamedHtml;
        let finalUsage = lastUsageMetadata;

        // If truncated right before </html>, run a quick 1-shot continuation
        if (
          (lastFinishReason === 'MAX_TOKENS' || !fullHtml.toLowerCase().includes('</html>')) &&
          fullHtml.length >= 250 &&
          (fullHtml.toLowerCase().includes('<!doctype') || fullHtml.toLowerCase().includes('<html'))
        ) {
          const cont = await attemptGeminiContinuation({
            client,
            modelName: candidate,
            partialHtml: fullHtml,
            onChunk: (delta) => {
              emittedForCandidate = true;
              if (onChunk) onChunk(delta);
            },
            signal,
          });
          if (cont.extraHtml) {
            fullHtml += cont.extraHtml;
          }
        }

        if (!fullHtml || fullHtml.trim().length < 40) {
          throw new Error(`Empty response from ${candidate} (finishReason=${lastFinishReason || 'unknown'})`);
        }

        const latencyMs = Date.now() - startTime;
        const fallbackPromptTokens = Math.max(100, Math.ceil((SYSTEM_PROMPT.length + prompt.length) / 4));
        const fallbackOutputTokens = Math.max(50, Math.ceil(fullHtml.length / 4));

        const promptTokens = Number(finalUsage?.promptTokenCount) || fallbackPromptTokens;
        const candidateTokens = Number(finalUsage?.candidatesTokenCount) || fallbackOutputTokens;
        const thoughtTokens = Number(finalUsage?.thoughtsTokenCount) || 0;
        const cachedTokens = Number(finalUsage?.cachedContentTokenCount) || 0;
        const totalTokens = Number(finalUsage?.totalTokenCount) || (promptTokens + candidateTokens + thoughtTokens);

        return {
          html: fullHtml,
          modelUsed: candidate,
          finishReason: lastFinishReason || 'STOP',
          tokenUsage: {
            inputTokens: promptTokens,
            outputTokens: candidateTokens,
            thoughtTokens,
            cachedReadTokens: cachedTokens,
            cacheWriteTokens: 0,
            totalTokens,
          },
          latencyMs,
        };
      } catch (candErr) {
        if (openTimer) clearTimeout(openTimer);
        if (signal?.aborted) {
          throw Object.assign(new Error('Generation cancelled.'), { code: 'ABORTED', statusCode: 499 });
        }

        // If we already sent partial chunks for this candidate before failing, reset client buffer before retrying.
        if (emittedForCandidate && onReset) {
          onReset();
        }

        const errMsg = String(candErr?.message || '');
        const isConfigParamErr =
          Number(candErr?.status || candErr?.statusCode) === 400 &&
          (errMsg.toLowerCase().includes('thinking') || errMsg.toLowerCase().includes('max_output_tokens') || errMsg.toLowerCase().includes('maxoutputtokens'));

        lastClassifiedErr = classifyGeminiError(candErr);
        console.warn(
          `[geminiAdapter] candidate ${candidate} failed (${lastClassifiedErr.code}): ${errMsg.slice(0, 140)}`,
        );

        // Auth errors won't recover on another model
        if (lastClassifiedErr.code === 'AUTH_CONFIG_ERROR') {
          throw lastClassifiedErr;
        }

        // Only retry the second config on the same candidate if it was a config/param error
        if (!isConfigParamErr) {
          break;
        }
      }
    }
  }

  throw lastClassifiedErr || Object.assign(new Error('All Gemini models failed to respond.'), {
    code: 'MODEL_UNAVAILABLE',
    statusCode: 503,
  });
}
