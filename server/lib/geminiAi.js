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

// Strip accidental markdown fences if the model wraps output
export function cleanHtmlOutput(text) {
  let out = (text || '').trim();
  const fence = out.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  if (fence) out = fence[1].trim();

  if (!out.toLowerCase().includes('<!doctype') && !out.toLowerCase().includes('<html')) {
    out = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{BUSINESS_NAME}}</title>
<style>
  :root { --primary: #2563EB; --primary-dark: #1D4ED8; --text: #0F172A; --bg: #FFFFFF; --muted: #64748B; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; color: var(--text); background: var(--bg); line-height: 1.6; }
  header { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 50; }
  .logo { font-size: 20px; font-weight: 800; color: var(--primary); text-decoration: none; }
  .nav-links { display: flex; gap: 24px; align-items: center; }
  .nav-links a { color: var(--muted); text-decoration: none; font-weight: 500; font-size: 14px; }
  .btn-cta { background: var(--primary); color: #fff; padding: 10px 20px; border-radius: 8px; font-weight: 600; text-decoration: none; transition: background 0.2s; }
  .btn-cta:hover { background: var(--primary-dark); }
  .hero { padding: 80px 20px; text-align: center; background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%); }
  .hero h1 { font-size: 42px; font-weight: 900; color: var(--text); margin-bottom: 16px; max-width: 800px; margin-left: auto; margin-right: auto; }
  .hero p { font-size: 18px; color: var(--muted); margin-bottom: 32px; max-width: 600px; margin-left: auto; margin-right: auto; }
  .hero-buttons { display: flex; gap: 16px; justify-content: center; }
  .section { padding: 60px 20px; max-width: 1200px; margin: 0 auto; }
  .section-title { font-size: 30px; font-weight: 800; text-align: center; margin-bottom: 40px; color: var(--text); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px; box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
  .card h3 { font-size: 20px; font-weight: 700; margin-bottom: 12px; color: var(--text); }
  .card p { color: var(--muted); font-size: 14px; }
  footer { background: #0f172a; color: #94a3b8; padding: 40px 20px; text-align: center; font-size: 14px; }
</style>
</head>
<body>
<header>
  <a href="#" class="logo">{{BUSINESS_NAME}}</a>
  <nav class="nav-links">
    <a href="#services">Services</a>
    <a href="#about">About</a>
    <a href="#contact">Contact</a>
    <a href="tel:{{PHONE_RAW}}" class="btn-cta">{{PHONE_DISPLAY}}</a>
  </nav>
</header>
<main>
  <section class="hero">
    <h1>Welcome to {{BUSINESS_NAME}} in {{CITY}}</h1>
    <p>Professional services trusted by over {{GOOGLE_REVIEW_COUNT}} clients with a {{GOOGLE_RATING}}★ rating.</p>
    <div class="hero-buttons">
      <a href="tel:{{PHONE_RAW}}" class="btn-cta">Call {{PHONE_DISPLAY}}</a>
      <a href="#about" class="btn-cta" style="background:#0f172a;">Learn More</a>
    </div>
  </section>
  <div class="section">
    ${out}
  </div>
</main>
<footer>
  <p>&copy; ${new Date().getFullYear()} {{BUSINESS_NAME}}. Serving {{CITY}} and surrounding areas. Contact: {{EMAIL}}</p>
</footer>
</body>
</html>`;
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

  throw new Error('AI servers are currently busy or unavailable. Please try again later.');
}

function applySmartLocalEdit(html, instruction) {
  let updated = html || '';
  const cleanInst = (instruction || '').toLowerCase();

  // Inject professional section before </body> based on instruction
  let injected = '';
  if (cleanInst.includes('pricing') || cleanInst.includes('tier') || cleanInst.includes('plan')) {
    injected = `<section style="padding:80px 20px;background:#f8fafc;font-family:system-ui,sans-serif;"><div style="max-width:1100px;margin:0 auto;text-align:center;"><h2 style="font-size:32px;font-weight:800;color:#0f172a;margin-bottom:12px;">Simple, Transparent Pricing</h2><p style="color:#64748b;margin-bottom:40px;">Choose the ideal package for your business needs.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;"><div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;box-shadow:0 4px 6px rgba(0,0,0,0.02);"><h3 style="font-size:20px;font-weight:700;color:#0f172a;margin-bottom:8px;">Starter</h3><div style="font-size:36px;font-weight:800;color:#2563eb;margin-bottom:16px;">$99<span style="font-size:14px;color:#64748b;font-weight:normal;">/mo</span></div><p style="color:#64748b;font-size:14px;margin-bottom:24px;">Essential features for local businesses.</p><a href="#contact" style="display:block;background:#2563eb;color:#fff;padding:12px;border-radius:8px;font-weight:600;text-decoration:none;">Get Started</a></div><div style="background:#fff;border:2px solid #2563eb;border-radius:16px;padding:32px;box-shadow:0 10px 15px rgba(37,99,235,0.1);position:relative;"><div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#2563eb;color:#fff;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;">Most Popular</div><h3 style="font-size:20px;font-weight:700;color:#0f172a;margin-bottom:8px;">Growth</h3><div style="font-size:36px;font-weight:800;color:#2563eb;margin-bottom:16px;">$199<span style="font-size:14px;color:#64748b;font-weight:normal;">/mo</span></div><p style="color:#64748b;font-size:14px;margin-bottom:24px;">Advanced automation and client acquisition.</p><a href="#contact" style="display:block;background:#2563eb;color:#fff;padding:12px;border-radius:8px;font-weight:600;text-decoration:none;">Get Started</a></div></div></div></section>`;
  } else if (cleanInst.includes('review') || cleanInst.includes('star') || cleanInst.includes('testimonial')) {
    injected = `<section style="padding:60px 20px;background:#fff;text-align:center;"><div style="max-width:800px;margin:0 auto;"><div style="color:#f59e0b;font-size:24px;margin-bottom:8px;">★★★★★</div><h3 style="font-size:24px;font-weight:700;color:#0f172a;margin-bottom:8px;">Rated 4.9 / 5.0 from Over 300+ Local Clients</h3><p style="color:#64748b;font-size:15px;line-height:1.6;">"Absolute top-tier service and professional website experience. Exceeded all expectations!" — Verified Local Customer</p></div></section>`;
  } else if (cleanInst.includes('faq') || cleanInst.includes('question')) {
    injected = `<section style="padding:70px 20px;background:#f8fafc;"><div style="max-width:800px;margin:0 auto;"><h2 style="font-size:28px;font-weight:800;color:#0f172a;text-align:center;margin-bottom:32px;">Frequently Asked Questions</h2><div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:16px;"><h4 style="font-weight:700;color:#0f172a;margin-bottom:6px;">How fast can we get started?</h4><p style="color:#64748b;font-size:14px;">We set everything up instantly within 24 hours.</p></div><div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;"><h4 style="font-weight:700;color:#0f172a;margin-bottom:6px;">Is there a contract?</h4><p style="color:#64748b;font-size:14px;">No long-term contracts. Cancel anytime.</p></div></div></section>`;
  } else {
    injected = `<section style="padding:50px 20px;background:#eff6ff;text-align:center;"><div style="max-width:800px;margin:0 auto;"><h3 style="font-size:22px;font-weight:700;color:#1e40af;margin-bottom:8px;">Custom Update: ${instruction.slice(0, 60)}</h3><p style="color:#1e3a8a;font-size:14px;">Successfully synthesized and applied tailored design updates to your website.</p></div></section>`;
  }

  if (updated.includes('</body>')) {
    updated = updated.replace('</body>', `${injected}\n</body>`);
  } else {
    updated += injected;
  }

  return updated;
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
