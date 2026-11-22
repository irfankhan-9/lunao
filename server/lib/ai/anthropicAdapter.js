// Anthropic Claude Adapter for AI Web Studio
// Models: claude-haiku-5-5, claude-sonnet-5-5, claude-fable-5-1
import Anthropic from '@anthropic-ai/sdk';
import { anthropic as anthropicCfg } from '../config.js';

let _anthropicClient = null;

function getClient(customApiKey) {
  let apiKey = (customApiKey || '').trim();
  // If the passed key is an Anthropic Key ID (apikey_...) rather than a secret key (sk-ant-...),
  // or if customApiKey is not provided, use the server's authenticated Anthropic key.
  if (!apiKey.startsWith('sk-ant-') || apiKey.length < 10) {
    apiKey = (process.env.ANTHROPIC_API_KEY || anthropicCfg.apiKey || '').trim();
  }
  if (!apiKey || apiKey.length < 5 || apiKey.includes('YOUR_KEY')) return null;

  if (customApiKey && customApiKey.startsWith('sk-ant-')) {
    return new Anthropic({ apiKey: customApiKey });
  }
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({ apiKey });
  }
  return _anthropicClient;
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

4. BEAUTIFUL ANIMATIONS & MODERN VISUAL POLISH:
- Make sure the generated website is exceptionally beautiful, modern, and engaging with tasteful, fluid animations.
- Include smooth CSS transitions, subtle hover micro-interactions on cards and buttons, gentle fade-in and slide-up keyframe animations for hero elements, floating subtle badge effects, and smooth scroll behavior.
- Ensure all animations are performance-optimized, clean, and elegant using pure modern CSS (cubic-bezier easing, hardware-accelerated transforms).`;

function buildClaudeMessages(html, instruction, history = []) {
  const messages = [];

  for (const h of history || []) {
    if (h && h.role && h.content) {
      messages.push({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: String(h.content),
      });
    }
  }

  messages.push({
    role: 'user',
    content: [
      'CURRENT HTML:',
      '```html',
      html || '',
      '```',
      '',
      `EDIT INSTRUCTION: ${instruction}`,
      '',
      'Return the complete updated single-file HTML document only. No markdown fences, no explanations.',
    ].join('\n'),
  });

  return messages;
}

function resolveAnthropicCandidates(requestedModel) {
  const norm = String(requestedModel || '').toLowerCase();
  const envModel = process.env.ANTHROPIC_MODEL ? process.env.ANTHROPIC_MODEL.trim() : '';

  let list;
  if (norm.includes('haiku')) {
    list = ['claude-haiku-5-5', 'claude-haiku-4-5', envModel, 'claude-sonnet-4-5'];
  } else if (norm.includes('fable')) {
    list = ['claude-fable-5-1', envModel || 'claude-sonnet-4-5', 'claude-sonnet-5-5'];
  } else {
    list = [envModel || 'claude-sonnet-4-5', 'claude-sonnet-5-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'];
  }
  return Array.from(new Set(list.filter(Boolean)));
}

function classifyAnthropicError(err) {
  const msg = String(err?.message || err || '');
  const status = Number(err?.status || err?.statusCode || 0);
  const lower = msg.toLowerCase();

  if (status === 401 || status === 403 || lower.includes('authentication') || lower.includes('api key')) {
    return Object.assign(new Error('Anthropic API key is invalid or unauthorized.'), {
      code: 'AUTH_CONFIG_ERROR',
      statusCode: status || 401,
    });
  }
  if (status === 429 || lower.includes('rate_limit') || lower.includes('rate limit')) {
    return Object.assign(new Error('Claude rate limit reached. Retrying with fallback engine.'), {
      code: 'RATE_LIMITED',
      statusCode: 429,
    });
  }
  if (status === 404 || lower.includes('not_found')) {
    return Object.assign(new Error(msg || 'Requested Claude model is unavailable.'), {
      code: 'MODEL_UNAVAILABLE',
      statusCode: 404,
    });
  }
  if (lower.includes('timeout') || lower.includes('aborted')) {
    return Object.assign(new Error('Claude generation timed out.'), {
      code: 'STREAM_TIMEOUT',
      statusCode: 504,
    });
  }
  return Object.assign(new Error(msg || 'Claude generation failed.'), {
    code: err?.code || 'GENERATION_ERROR',
    statusCode: status || 500,
  });
}

/**
 * Stream an edit using Anthropic Claude.
 * Returns { html, tokenUsage, latencyMs, finishReason, modelUsed }.
 */
export async function streamAnthropicEdit(
  { html, instruction, history, model = 'claude-sonnet-5-5', apiKey, maxOutputTokens = 32768, signal, onReset },
  onChunk,
  onThinking,
) {
  const client = getClient(apiKey);
  const startTime = Date.now();

  if (!client) {
    console.warn(`[anthropicAdapter] No API client initialized. Cannot fulfill request.`);
    throw Object.assign(new Error('Anthropic API key is not configured.'), {
      code: 'AUTH_CONFIG_ERROR',
      statusCode: 401,
    });
  }

  const candidates = resolveAnthropicCandidates(model);
  const messages = buildClaudeMessages(html, instruction, history);
  const targetMaxTokens = Math.min(Math.max(Number(maxOutputTokens) || 16384, 16384), 32768);
  let lastErr = null;

  for (const actualModel of candidates) {
    if (signal?.aborted) {
      throw Object.assign(new Error('Generation cancelled.'), { code: 'ABORTED', statusCode: 499 });
    }

    const tokenBudgets = [targetMaxTokens, 8192];
    for (const maxTokens of tokenBudgets) {
      let emittedForCandidate = false;
      let idleTimer = null;
      let stream = null;

      try {
        const abortCtrl = new AbortController();
        const onExternalAbort = () => abortCtrl.abort();
        signal?.addEventListener?.('abort', onExternalAbort, { once: true });

        const resetIdleTimer = (rejectFn) => {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            try { stream?.abort?.(); } catch {}
            abortCtrl.abort();
            rejectFn(new Error('Claude stream idle timeout exceeded.'));
          }, 30000);
        };

        let fullHtml = '';
        const finalMessage = await new Promise((resolve, reject) => {
          resetIdleTimer(reject);
          try {
            stream = client.messages.stream(
              {
                model: actualModel,
                max_tokens: maxTokens,
                system: SYSTEM_PROMPT,
                messages,
              },
              { signal: abortCtrl.signal },
            );

            stream.on('text', (text) => {
              resetIdleTimer(reject);
              emittedForCandidate = true;
              fullHtml += text;
              if (onChunk) onChunk(text);
            });

            if (onThinking) {
              stream.on('thinking', (thinkingDelta) => {
                resetIdleTimer(reject);
                if (thinkingDelta) onThinking(String(thinkingDelta));
              });
            }

            stream.on('error', (streamErr) => reject(streamErr));
            stream.finalMessage().then(resolve, reject);
          } catch (initErr) {
            reject(initErr);
          }
        }).finally(() => {
          if (idleTimer) clearTimeout(idleTimer);
          signal?.removeEventListener?.('abort', onExternalAbort);
        });

        let usage = finalMessage?.usage || {};
        let inputTokens = Number(usage.input_tokens) || 0;
        let outputTokens = Number(usage.output_tokens) || 0;

        // 1-shot continuation if stopped due to max_tokens before </html>
        if (
          finalMessage?.stop_reason === 'max_tokens' &&
          !fullHtml.toLowerCase().includes('</html>') &&
          fullHtml.length >= 250
        ) {
          try {
            const tail = fullHtml.slice(-1800);
            const contMsg = await client.messages.create(
              {
                model: actualModel,
                max_tokens: 4096,
                system: 'Continue the HTML document from the exact tail provided until </html>. Output raw HTML only, no markdown fences.',
                messages: [
                  { role: 'user', content: `Continue immediately after:\n${tail}` },
                ],
              },
              { signal },
            );
            const extra = (contMsg?.content || [])
              .filter((b) => b?.type === 'text' && b.text)
              .map((b) => b.text)
              .join('')
              .replace(/^```(?:html)?\s*/i, '')
              .replace(/\s*```$/i, '');
            if (extra) {
              fullHtml += extra;
              if (onChunk) onChunk(extra);
            }
            outputTokens += Number(contMsg?.usage?.output_tokens) || 0;
          } catch (contErr) {
            console.warn(`[anthropicAdapter] Continuation notice on ${actualModel}:`, contErr.message);
          }
        }

        const latencyMs = Date.now() - startTime;
        if (!fullHtml || fullHtml.trim().length < 40) {
          throw new Error(`Empty response from ${actualModel}`);
        }

        const cachedReadTokens = Number(usage.cache_read_input_tokens || 0);
        const cacheWriteTokens = Number(usage.cache_creation_input_tokens || 0);
        const totalTokens = inputTokens + outputTokens;

        return {
          html: fullHtml,
          modelUsed: actualModel,
          finishReason: finalMessage?.stop_reason || 'end_turn',
          tokenUsage: {
            inputTokens,
            outputTokens,
            thoughtTokens: 0,
            cachedReadTokens,
            cacheWriteTokens,
            totalTokens,
          },
          latencyMs,
        };
      } catch (err) {
        if (idleTimer) clearTimeout(idleTimer);
        if (signal?.aborted) {
          throw Object.assign(new Error('Generation cancelled.'), { code: 'ABORTED', statusCode: 499 });
        }
        if (emittedForCandidate && onReset) {
          onReset();
        }
        const msg = String(err?.message || '');
        const isMaxTokenErr =
          Number(err?.status || err?.statusCode) === 400 &&
          msg.toLowerCase().includes('max_tokens');
        lastErr = classifyAnthropicError(err);
        console.warn(`[anthropicAdapter] ${actualModel} failed (${lastErr.code}): ${msg.slice(0, 140)}`);

        if (lastErr.code === 'AUTH_CONFIG_ERROR') {
          throw lastErr;
        }
        if (!isMaxTokenErr) {
          break;
        }
      }
    }
  }

  throw lastErr || Object.assign(new Error('Anthropic models unavailable.'), {
    code: 'MODEL_UNAVAILABLE',
    statusCode: 503,
  });
}
