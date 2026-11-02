// Anthropic Claude Adapter for AI Web Studio
// Models: claude-haiku-5-5, claude-sonnet-5-5, claude-fable-5-1
import Anthropic from '@anthropic-ai/sdk';
import { anthropic as anthropicCfg } from '../config.js';

let _anthropicClient = null;

function getClient(customApiKey) {
  const apiKey = (customApiKey || process.env.ANTHROPIC_API_KEY || anthropicCfg.apiKey || '').trim();
  if (!apiKey || apiKey.length < 5 || apiKey.includes('YOUR_KEY')) return null;

  if (customApiKey) {
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
- Always use a prominent direct phone call-to-action button (<a href="tel:{{PHONE_RAW}}" class="btn-cta">Call {{PHONE_DISPLAY}}</a>).`;

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

/**
 * Stream an edit using Anthropic Claude.
 * Returns { html, tokenUsage, latencyMs }.
 */
export async function streamAnthropicEdit(
  { html, instruction, history, model = 'claude-sonnet-5-5', apiKey, maxOutputTokens = 8192 },
  onChunk,
  onThinking,
) {
  const client = getClient(apiKey);
  const startTime = Date.now();

  if (!client) {
    console.warn(`[anthropicAdapter] No API client initialized. Cannot fulfill request.`);
    throw new Error('AI servers busy, try later.');
  }

  // Model resolution: map to closest available Anthropic API engine
  let actualModel = 'claude-3-5-sonnet-latest';
  if (model.includes('haiku')) {
    actualModel = 'claude-3-5-haiku-latest';
  } else if (model.includes('fable') || model.includes('sonnet')) {
    actualModel = 'claude-3-5-sonnet-latest';
  }

  const messages = buildClaudeMessages(html, instruction, history);

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI servers busy, try later.')), 150000)
    );

    const stream = await Promise.race([
      client.messages.stream({
        model: actualModel,
        max_tokens: Math.min(maxOutputTokens, 8192),
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages,
      }),
      timeoutPromise,
    ]);

    let fullHtml = '';
    stream.on('text', (text) => {
      fullHtml += text;
      if (onChunk) onChunk(text);
    });

    const finalMessage = await stream.finalMessage();
    const latencyMs = Date.now() - startTime;

    if (!fullHtml || fullHtml.length < 100) {
      throw new Error('AI servers busy, try later.');
    }

    const usage = finalMessage.usage || {};
    const inputTokens = Number(usage.input_tokens) || 0;
    const outputTokens = Number(usage.output_tokens) || 0;
    const cachedReadTokens = Number(usage.cache_read_input_tokens || 0);
    const cacheWriteTokens = Number(usage.cache_creation_input_tokens || 0);
    const totalTokens = inputTokens + outputTokens;

    return {
      html: fullHtml,
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
    console.warn(`[anthropicAdapter] Generation failed on ${actualModel}: ${err.message}`);
    throw new Error('AI servers busy, try later.');
  }
}
