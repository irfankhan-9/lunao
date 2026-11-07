// scripts/patch-supabase-sites.mjs
import { config } from 'dotenv';
config();
config({ path: '.env.local', override: true });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wqlbuadknltsjfzrltpe.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_KEY) {
  console.log('No Supabase key found in env, skipping remote DB patch.');
  process.exit(0);
}

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

const CSS_SNIPPET = `
    /* MOBILE CONCIERGE TOGGLE: Screens <= 900px render ONLY the single magic emoji ✨ */
    @media (max-width: 900px) {
      .atelier-concierge-fab-container {
        bottom: calc(18px + env(safe-area-inset-bottom, 0px)) !important;
        right: 16px !important;
      }
      .atelier-concierge-fab {
        width: 48px !important;
        height: 48px !important;
        min-width: 48px !important;
        max-width: 48px !important;
        padding: 0 !important;
        border-radius: 50% !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 0 !important;
        box-shadow: 0 8px 24px rgba(61, 43, 31, 0.2), 0 0 16px rgba(184, 134, 11, 0.28) !important;
        overflow: hidden !important;
      }
      .atelier-concierge-fab .fab-label-text,
      .atelier-concierge-fab .fab-chevron,
      .atelier-concierge-fab span:not(.brand-spinner-icon) {
        display: none !important;
        visibility: hidden !important;
        width: 0 !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        font-size: 0 !important;
        line-height: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      .atelier-concierge-fab .brand-spinner-icon {
        font-size: 1.45rem !important;
        line-height: 1 !important;
        margin: 0 !important;
        padding: 0 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
    }
`;

console.log('Fetching user_sites from Supabase...');
const res = await fetch(`${SUPABASE_URL}/rest/v1/user_sites?select=slug,compiled_html&limit=500`, { headers });
if (!res.ok) {
  console.error('Failed to query user_sites:', res.status, await res.text());
  process.exit(1);
}

const rows = await res.json();
console.log(`Found ${rows.length} sites in Supabase.`);

let patched = 0;
for (const row of rows) {
  let html = row.compiled_html || '';
  if (!html.includes('atelier-concierge-fab')) continue;

  let modified = false;
  if (html.includes('<span>CONCIERGE</span>')) {
    html = html.replace(/<span>CONCIERGE<\/span>/g, '<span class="fab-label-text">CONCIERGE</span>');
    modified = true;
  }

  if (!html.includes('/* MOBILE CONCIERGE TOGGLE: Screens <= 900px render ONLY the single magic emoji ✨ */')) {
    if (html.includes('.atelier-concierge-fab.active .fab-chevron {')) {
      html = html.replace(
        '.atelier-concierge-fab.active .fab-chevron {',
        `${CSS_SNIPPET}\n    .atelier-concierge-fab.active .fab-chevron {`
      );
      modified = true;
    } else if (html.includes('</style>')) {
      html = html.replace('</style>', `${CSS_SNIPPET}\n</style>`);
      modified = true;
    }
  }

  if (modified) {
    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/user_sites?slug=eq.${encodeURIComponent(row.slug)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ compiled_html: html }),
    });
    if (patchRes.ok) {
      patched++;
      if (patched <= 5 || row.slug.includes('cedar') || row.slug.includes('irfan')) {
        console.log(`Patched Supabase site: ${row.slug}`);
      }
    }
  }
}

console.log(`Successfully patched ${patched} sites in Supabase public.user_sites!`);
process.exit(0);
