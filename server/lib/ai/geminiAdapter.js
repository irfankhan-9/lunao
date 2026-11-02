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
- Modify ONLY the parts of CURRENT HTML needed to fulfill EDIT INSTRUCTION while preserving the rest of the existing HTML document intact, unless the user explicitly asks for a full redesign.`;

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

function resolveRealGeminiModel(requestedModel) {
  const norm = String(requestedModel || '').toLowerCase();
  if (norm.includes('3.1') || norm.includes('pro')) {
    return process.env.GEMINI_PRO_MODEL || 'gemini-3.1-pro-preview';
  }
  if (norm.includes('3.5')) {
    return 'gemini-3.5-flash';
  }
  return process.env.GEMINI_MODEL || 'gemini-3.8-flash';
}

/**
 * Stream an edit using Google Gemini.
 * Returns { html, tokenUsage, latencyMs }.
 */
export async function streamGeminiEdit(
  { html, instruction, history, model = 'gemini-3.8-flash', apiKey, maxOutputTokens = 65536 },
  onChunk,
  onThinking,
) {
  const client = getClient(apiKey);
  const startTime = Date.now();

  if (!client) {
    console.warn(`[geminiAdapter] No API client initialized. Cannot fulfill request.`);
    throw new Error('AI servers busy, try later.');
  }

  const actualModel = resolveRealGeminiModel(model);
  const prompt = buildGeminiPrompt(html, instruction, history);
  const isProReasoning = String(model).includes('pro') || String(model).includes('fable');

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI servers busy, try later.')), 150000)
    );

    const stream = await Promise.race([
      client.models.generateContentStream({
        model: actualModel,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.3,
          maxOutputTokens: Math.max(maxOutputTokens || 65536, 32768),
          thinkingConfig: {
            thinkingBudget: isProReasoning ? 256 : 0,
          },
        },
      }),
      timeoutPromise,
    ]);

    let fullHtml = '';
    let lastUsageMetadata = null;

    for await (const chunk of stream) {
      if (chunk.usageMetadata) {
        lastUsageMetadata = chunk.usageMetadata;
      }
      const text = chunk.text || '';
      if (text) {
        fullHtml += text;
        if (onChunk) onChunk(text);
      }
    }

    if (!fullHtml || fullHtml.length < 40) {
      throw new Error('AI servers busy, try later.');
    }

    const latencyMs = Date.now() - startTime;
    const fallbackPromptTokens = Math.max(100, Math.ceil((SYSTEM_PROMPT.length + prompt.length) / 4));
    const fallbackOutputTokens = Math.max(50, Math.ceil(fullHtml.length / 4));

    const promptTokens = Number(lastUsageMetadata?.promptTokenCount) || fallbackPromptTokens;
    const candidateTokens = Number(lastUsageMetadata?.candidatesTokenCount) || fallbackOutputTokens;
    const thoughtTokens = Number(lastUsageMetadata?.thoughtsTokenCount) || 0;
    const cachedTokens = Number(lastUsageMetadata?.cachedContentTokenCount) || 0;
    const totalTokens = Number(lastUsageMetadata?.totalTokenCount) || (promptTokens + candidateTokens + thoughtTokens);

    return {
      html: fullHtml,
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
  } catch (err) {
    console.warn(`[geminiAdapter] Generation failed on ${actualModel}: ${err.message}`);
    throw new Error('AI servers busy, try later.');
  }
}
