import { GoogleGenAI } from '@google/genai';
import { gemini as geminiCfg } from './config.js';
import { replaceBookingWithPhoneCta, hasBookingForm } from './aiStudioBookingGuard.js';

let _aiClient = null;

export function getGeminiClient(customApiKey = null) {
  const rawKey = customApiKey || process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY || geminiCfg.apiKey;
  const apiKey = rawKey && rawKey.trim().length > 0 ? rawKey.trim() : undefined;

  if (customApiKey) {
    return new GoogleGenAI({
      apiKey: customApiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
  }
  if (!_aiClient) {
    const opts = apiKey ? { apiKey } : {};
    _aiClient = new GoogleGenAI({
      ...opts,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
  }
  return _aiClient;
}

export function isAiEnabled() {
  return true;
}

// Preferred primary models per Gemini API skill guidelines.
const MODEL_PRIORITY = [
  process.env.GEMINI_MODEL || 'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
];

let _verifiedModel = null;

function resolveModelCandidates(requestedModel) {
  const norm = String(requestedModel || '').toLowerCase();
  let preferred = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  if (norm.includes('3.8')) {
    preferred = 'gemini-3.8-flash';
  } else if (norm.includes('3.1') && norm.includes('pro')) {
    preferred = 'gemini-3.8-flash';
  } else if (norm.includes('2.5') || norm.includes('flash')) {
    preferred = 'gemini-flash-latest';
  }
  const base = _verifiedModel
    ? [preferred, _verifiedModel, ...MODEL_PRIORITY]
    : [preferred, ...MODEL_PRIORITY];
  return Array.from(new Set(base.filter(Boolean)));
}

// Strip accidental markdown fences if the model wraps output and strictly validate HTML
export function cleanHtmlOutput(text) {
  let out = (text || '').trim();
  const fence = out.match(/```(?:html)?\s*([\s\S]*?)\s*```/i);
  if (fence && fence[1]) {
    out = fence[1].trim();
  }

  // If there is leading/trailing commentary around a valid HTML document, extract the HTML document
  const docStart = out.search(/<!doctype\s+html|<html[\s>]/i);
  const docEndMatch = out.match(/<\/html\s*>/i);
  if (docStart !== -1 && docEndMatch && docEndMatch.index !== undefined) {
    out = out.slice(docStart, docEndMatch.index + docEndMatch[0].length).trim();
  }

  const lower = out.toLowerCase();
  if (
    !out ||
    out.length < 150 ||
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

2. STRICT APPROVED PLACEHOLDERS:
Use ONLY these 4 placeholders:
- {{BUSINESS_NAME}} : Full business name. Use this everywhere the business name appears, including in <title>, header logo/text, hero headline, about section, footer copyright, and alt text.
- {{PHONE}} : Primary contact telephone number. Use in visible contact text and strictly in dial links: <a href="tel:{{PHONE}}">{{PHONE}}</a>.
- {{CITY}} : Target city and location (e.g., "Austin, TX" or "Chicago, IL").
- {{ADDRESS}} : Local street or downtown address.

3. EMAIL & SOCIAL MEDIA IDENTITY CONVENTION:
Use {{BUSINESS_NAME}} everywhere the business name appears, including email and social media identity text (e.g., contact@{{BUSINESS_NAME}}, https://instagram.com/{{BUSINESS_NAME}}).
NEVER create separate email or social media placeholders.
Do NOT invent email addresses, fake social handles, or links.

4. REMOVE HARDCODED DEMO DATA & UNSUPPORTED CLAIMS:
Replace all hardcoded business names, phone numbers, cities, addresses, fake reviews, ratings, and unsupported business claims with the standard placeholders or generic truthful statements.

5. PRESERVE ORIGINAL DESIGN & QUALITY:
Preserve the original design, styling, layout, typography, responsiveness, and interactivity while ensuring strict template-readiness.`;

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
 * Stream an AI edit using Gemini (with automatic candidate fallback).
 * Calls onChunk(textDelta, isThinking?) as tokens arrive.
 * Returns { html, metadata } with real usageMetadata token counts.
 */
export async function streamEdit({ html, instruction, history, apiKey, model: requestedModel }, onChunk) {
  const client = getGeminiClient(apiKey);
  if (!client) {
    throw new Error('AI servers busy, try later.');
  }

  const promptContent = buildUserContent(html, instruction, history);
  const startTime = Date.now();

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
    let lastUsageMetadata = null;
    for await (const chunk of stream) {
      if (chunk && chunk.usageMetadata) {
        lastUsageMetadata = chunk.usageMetadata;
      }
      const text = chunk.text || '';
      if (text) {
        full += text;
        if (onChunk) onChunk(text, false);
      }
    }
    return { full, usageMetadata: lastUsageMetadata };
  }

  const modelsToTry = resolveModelCandidates(requestedModel);
  let lastErr = null;

  for (const model of modelsToTry) {
    try {
      const { full, usageMetadata } = await attemptStream(model);
      const cleanedHtml = cleanHtmlOutput(full);
      _verifiedModel = model;

      const promptTokens =
        Number(usageMetadata?.promptTokenCount) ||
        Math.max(1, Math.ceil((SYSTEM_PROMPT.length + promptContent.length) / 4));
      const candidateTokens =
        Number(usageMetadata?.candidatesTokenCount) ||
        Math.max(1, Math.ceil(cleanedHtml.length / 4));
      const thoughtTokens = Number(usageMetadata?.thoughtsTokenCount) || 0;
      const outputTokens = candidateTokens + thoughtTokens;
      const totalTokens =
        Number(usageMetadata?.totalTokenCount) || promptTokens + outputTokens;

      return {
        html: cleanedHtml,
        metadata: {
          provider: 'Google AI Studio',
          model: requestedModel || 'Gemini 2.5 Flash',
          modelId: model,
          inputTokens: promptTokens,
          outputTokens,
          totalTokens,
          latencyMs: Math.max(1, Date.now() - startTime),
        },
      };
    } catch (err) {
      lastErr = err;
      const errMsg = err?.message || String(err);
      console.warn(`[geminiAi] streamEdit with ${model} failed (${errMsg.slice(0, 120)}), trying next candidate...`);
    }
  }

  throw new Error('AI servers busy, try later.');
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

CRITICAL PLACEHOLDER & REBRANDING RULES:
You MUST use standardized handlebar placeholders so the platform can dynamically brand the site for any local client.
Canonical placeholders:
  {{BUSINESS_NAME}}       — full official business name (title, hero headline, nav logo, footer copyright)
  {{BUSINESS_NAME_SHORT}} — short brand word for logos/badges
  {{CITY}}                — target city and region
  {{STATE}}               — state short code
  {{PHONE_DISPLAY}}       — human-readable phone (e.g. (512) 555-0199)
  {{PHONE_RAW}}           — pure digits only for <a href="tel:{{PHONE_RAW}}">
  {{EMAIL}}               — support email (<a href="mailto:{{EMAIL}}">)
  {{ADDRESS}}             — street address
  {{WEBSITE}}             — canonical website URL (<a href="{{WEBSITE}}">)
  {{SITE_URL}}            — deployed live site URL
  {{GOOGLE_RATING}}       — rating score float (e.g. 4.9)
  {{GOOGLE_REVIEW_COUNT}} — review volume (e.g. 342)
  {{YEARS_IN_BUSINESS}}   — founding year or years in service (e.g. 2015)
  {{INSTAGRAM_HANDLE}}    — handle without @ (<a href="https://instagram.com/{{INSTAGRAM_HANDLE}}">)
  {{FACEBOOK_URL}}        — complete URL (<a href="{{FACEBOOK_URL}}">)

SOCIAL MEDIA CONVENTION:
When specific social media handles are unknown for a business, use the business name formatted as a clean lowercase identifier for social handles.

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

export async function repairTemplateHtml({ html, instruction, apiKey }) {
  const client = getGeminiClient(apiKey);
  if (!client) {
    throw new Error('Google AI Studio Gemini is not configured.');
  }

  const promptContent = `CURRENT HTML:\n\`\`\`html\n${html}\n\`\`\`\n\nREPAIR INSTRUCTION:\n${instruction}\n\nReturn the complete updated HTML document only. Start at <!DOCTYPE html> and end at </html>.`;

  async function attemptRepair(modelName) {
    const res = await client.models.generateContent({
      model: modelName,
      contents: promptContent,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.2,
      },
    });
    return res.text || '';
  }

  let out = '';
  const modelsToTry = _verifiedModel ? [_verifiedModel, ...MODEL_PRIORITY.filter((m) => m !== _verifiedModel)] : MODEL_PRIORITY;
  let lastErr = null;
  for (const model of modelsToTry) {
    try {
      out = await attemptRepair(model);
      _verifiedModel = model;
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!out && lastErr) throw lastErr;
  return cleanHtmlOutput(out);
}

export default {
  getGeminiClient,
  isAiEnabled,
  streamEdit,
  generateTemplateHtml,
  repairTemplateHtml,
  cleanHtmlOutput,
};
