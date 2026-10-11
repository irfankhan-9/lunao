import { GoogleGenAI } from '@google/genai';
import { gemini as geminiCfg } from './config.js';

let _aiClient = null;

export function getGeminiClient(customApiKey = null) {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY || geminiCfg.apiKey;
  if (!apiKey) return null;
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
  if (!_aiClient) {
    _aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return _aiClient;
}

export function isAiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY || geminiCfg.apiKey);
}

// Preferred primary model: gemini-2.5-flash as requested.
// Resilient fallback: gemini-3.8-flash, gemini-3.1-pro-preview if 2.5 is unavailable/retired in this runtime.
const MODEL_PRIORITY = [
  process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  'gemini-3.8-flash',
  'gemini-3.1-pro-preview',
];

let _verifiedModel = null;

// Strip accidental markdown fences if the model wraps output
export function cleanHtmlOutput(text) {
  let out = (text || '').trim();
  const fence = out.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  if (fence) out = fence[1].trim();
  return out;
}

const SYSTEM_PROMPT = `You are an elite front-end engineer editing a single self-contained HTML page for a local business website (the page already has inline <style> and any needed <script>).

CRITICAL — your job is to make MINIMAL, PRECISE changes while keeping everything else IDENTICAL.

ABSOLUTE RULES — never break these:
1. You will receive the CURRENT full HTML and an edit instruction.
2. Apply ONLY the requested change. Leave everything else exactly as-is.
3. NEVER remove, reorder, or restructure HTML elements, CSS classes, or JavaScript unless explicitly asked.
4. NEVER add placeholder tokens like {{BUSINESS_NAME}} or {{CITY}} unless the user EXPLICITLY asks for them.
5. NEVER wrap content in extra <div> wrappers or change the existing DOM structure.
6. NEVER change the <title> tag unless the user explicitly asks.
7. The page must remain fully self-contained (inline CSS/JS). Never remove inline styles.
8. If the user's instruction is vague (e.g. "make it better"), make only TINY improvements — one small CSS color tweak, or one copy change. Do NOT rewrite the whole page.
9. If you're unsure what something is in the HTML, leave it completely unchanged.

WHAT TO DO:
- Small text/color changes: modify only the specific inline style or CSS rule
- Content edits: change only the specific text node
- Adding sections: append new HTML at the end of <body> only
- Removing sections: only if explicitly asked

WHAT NOT TO DO:
- Do NOT rewrite the entire CSS
- Do NOT restructure the <header>, <nav>, <main>, or <footer>
- Do NOT add placeholder tokens ({{BRAND_NAME}}, {{CITY}}, etc.)
- Do NOT add new CSS variables unless adding a new feature

OUTPUT: The COMPLETE updated HTML document and NOTHING else.
No explanations. No markdown fences. No commentary. Start at <!DOCTYPE html> and end at </html>.`;

function buildUserContent(html, instruction, history = []) {
  const convo = (history || [])
    .filter((m) => m && m.role && m.content)
    .slice(-6)
    .map((m) => `${m.role === 'assistant' ? 'You previously' : 'User asked'}: ${m.content}`)
    .join('\n');

  return [
    convo ? `Recent conversation context:\n${convo}\n` : '',
    'CURRENT HTML:',
    '```html',
    html,
    '```',
    '',
    `EDIT INSTRUCTION: ${instruction}`,
    '',
    'Return the complete updated HTML document only. No markdown fences, no explanations.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Stream an AI edit using Gemini 2.5 Flash (with 3.8 Flash fallback).
 * Calls onChunk(textDelta, isThinking?) as tokens arrive.
 */
export async function streamEdit({ html, instruction, history, apiKey }, onChunk) {
  const client = getGeminiClient(apiKey);
  if (!client) {
    throw new Error('Google AI Studio Gemini is not configured. GEMINI_API_KEY environment variable is required on the server.');
  }

  const promptContent = buildUserContent(html, instruction, history);

  // Helper to attempt streaming with a given model name
  async function attemptStream(modelName) {
    const stream = await client.models.generateContentStream({
      model: modelName,
      contents: promptContent,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.4,
      },
    });

    let full = '';
    for await (const chunk of stream) {
      const text = chunk.text || '';
      if (text) {
        full += text;
        if (onChunk) onChunk(text, false);
      }
    }
    return full;
  }

  const modelsToTry = _verifiedModel ? [_verifiedModel, ...MODEL_PRIORITY.filter((m) => m !== _verifiedModel)] : MODEL_PRIORITY;
  let lastErr = null;

  for (const model of modelsToTry) {
    try {
      const full = await attemptStream(model);
      _verifiedModel = model;
      return cleanHtmlOutput(full);
    } catch (err) {
      lastErr = err;
      const errMsg = err?.message || String(err);
      console.warn(`[geminiAi] streamEdit with ${model} failed (${errMsg.slice(0, 120)}), trying next candidate...`);
    }
  }

  throw lastErr || new Error('All Gemini model candidates failed.');
}

/**
 * Generate a complete HTML template from a free-text prompt using Gemini.
 * Returns { rawHtml, previewHtml }.
 */
export async function generateTemplateHtml(prompt, niche = 'Local Business', apiKey = null) {
  const client = getGeminiClient(apiKey);
  if (!client) {
    throw new Error('Google AI Studio Gemini is not configured. GEMINI_API_KEY environment variable is required on the server.');
  }

  const systemPrompt = `You are an elite front-end web developer building a complete, production-ready, self-contained single-file HTML website template for a local ${niche} business.

CRITICAL PLACEHOLDER RULES:
You MUST use standardized handlebar placeholders so the platform can dynamically brand the site for any local client.
Use these canonical placeholders:
  {{BUSINESS_NAME}}   — full business name
  {{BUSINESS_NAME_SHORT}} — short brand name for badges/logos
  {{CITY}}            — city and region
  {{STATE}}           — state code
  {{PHONE_DISPLAY}}   — formatted phone number (e.g. (512) 555-0199)
  {{PHONE_RAW}}       — digits only for tel: links (e.g. 5125550199)
  {{EMAIL}}           — support email
  {{ADDRESS}}         — street address
  {{GOOGLE_RATING}}   — rating score float (e.g. 4.9)
  {{GOOGLE_REVIEW_COUNT}} — review volume (e.g. 342)
  {{INSTAGRAM_HANDLE}}— handle without @
  {{FACEBOOK_URL}}    — complete URL

FILE STRUCTURE & DESIGN:
1. Output a COMPLETE single-file HTML document (<!DOCTYPE html> ... </html>).
2. All CSS inside one <style> tag in <head>. Responsive for mobile (375px) and desktop.
3. Clean modern design suitable for ${niche}.
4. Real Unsplash photography URLs for hero and services.
5. NO markdown fences (\`\`\`html). Output strictly the raw HTML starting with <!DOCTYPE html>.
6. NO conversational text outside the HTML document.`;

  async function attemptGenerate(modelName) {
    const res = await client.models.generateContent({
      model: modelName,
      contents: `Create a high-converting website template for a ${niche} business with the following prompt:\n\n${prompt}\n\nReturn the raw HTML document starting with <!DOCTYPE html> and ending with </html>.`,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.5,
      },
    });
    return res.text || '';
  }

  let rawHtml = '';
  const modelsToTry = _verifiedModel ? [_verifiedModel, ...MODEL_PRIORITY.filter((m) => m !== _verifiedModel)] : MODEL_PRIORITY;
  let lastErr = null;

  for (const model of modelsToTry) {
    try {
      rawHtml = await attemptGenerate(model);
      _verifiedModel = model;
      break;
    } catch (err) {
      lastErr = err;
      const errMsg = err?.message || String(err);
      console.warn(`[geminiAi] generateTemplateHtml with ${model} failed (${errMsg.slice(0, 120)}), trying next candidate...`);
    }
  }

  if (!rawHtml && lastErr) {
    throw lastErr;
  }

  rawHtml = cleanHtmlOutput(rawHtml);

  // Demo placeholders for iframe preview
  const DEMO_PLACEHOLDERS = {
    BUSINESS_NAME: `${niche} Elite Lounge`,
    BUSINESS_NAME_SHORT: niche.split(' ')[0] || 'Elite',
    CITY: 'Austin, TX',
    STATE: 'TX',
    YEARS_IN_BUSINESS: '2015',
    PHONE_DISPLAY: '(512) 555-0199',
    PHONE_RAW: '5125550199',
    EMAIL: 'contact@example.com',
    ADDRESS: '3801 Capital of Texas Hwy, Austin, TX',
    GOOGLE_RATING: '4.9',
    GOOGLE_REVIEW_COUNT: '342',
    INSTAGRAM_HANDLE: 'elite_business',
    FACEBOOK_URL: 'https://facebook.com/elitebusiness',
    SITE_URL: 'https://example.com',
  };

  const previewHtml = rawHtml.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_match, key) =>
    key in DEMO_PLACEHOLDERS ? DEMO_PLACEHOLDERS[key] : key,
  );

  return { rawHtml, previewHtml };
}

export default {
  getGeminiClient,
  isAiEnabled,
  streamEdit,
  generateTemplateHtml,
  cleanHtmlOutput,
};
