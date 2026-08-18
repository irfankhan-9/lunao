// Template compilation engine.
//
// All template resolution goes through server/lib/templates.js so the
// picker UI, deploy pipeline, and preview iframe always agree on which
// raw HTML file gets used. This module is only responsible for:
//   - picking a raw HTML body from a resolved template
//   - filling {{PLACEHOLDER}} tokens with business data
//   - guaranteeing zero leftover brackets in the final output
import { resolveTemplate, loadRawHtml, recordTemplateUse } from './templates.js';
import { db } from './db.js';

// Build the full placeholder manifest from a (possibly sparse) business
// record. Sensible defaults are derived so a minimal CSV (name, phone,
// city) still produces a fully populated, bracket-free site.
export function buildPlaceholders(biz) {
  const name = biz.name || biz.business_name || 'Local Business';
  const city = biz.city || '';
  // Mask dork leads (`phone === '*'`) so PHONE_DISPLAY and PHONE_RAW both
  // render '*****' instead of digitsOnly('*') collapsing to an empty string.
  const phoneDisplay = biz.phone === '*' ? '*' : (biz.phone || biz.phone_display || '');
  const phoneRaw = biz.phone === '*' ? '*' : (biz.phone_raw || digitsOnly(phoneDisplay));
  const firstWordOf = (str) => String(str || '').trim().split(/\s+/)[0] || '';
  const igHandle =
    biz.instagram_handle ||
    biz.instagram ||
    name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const fbUrl =
    biz.facebook_url ||
    biz.facebook ||
    `https://facebook.com/${igHandle}`;
  const rating = String(biz.google_rating || biz.rating || '4.9');
  const splitCityState = (c) => {
    const parts = String(c || '').split(',').map((p) => p.trim());
    return { state: parts.length > 1 ? parts[parts.length - 1] : '' };
  };
  const { state: derivedState } = splitCityState(city);

  return {
    BUSINESS_NAME: name,
    BUSINESS_NAME_SHORT: biz.business_name_short || biz.short || firstWordOf(name),
    CITY: city || 'your city',
    STATE: biz.state || derivedState || '',
    YEARS_IN_BUSINESS: String(biz.years_in_business || biz.years || '2015'),
    PHONE_DISPLAY: phoneDisplay,
    PHONE_RAW: phoneRaw,
    EMAIL:
      biz.email ||
      `hello@${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`,
    ADDRESS: biz.address || (city ? `Downtown ${city.split(',')[0]}` : ''),
    GOOGLE_RATING: rating,
    GOOGLE_REVIEW_COUNT: String(biz.google_review_count || biz.reviews || '127'),
    INSTAGRAM_HANDLE: String(igHandle).replace(/^@/, ''),
    FACEBOOK_URL: fbUrl,
    // Niche-specific placeholders found in some templates (dentist/gym/realestate).
    DOCTOR_NAME: biz.doctor_name || biz.owner || `Dr. ${firstWordOf(name)}`,
    AVERAGE_RATING: biz.average_rating || rating,
    MEMBERS_COUNT: String(biz.members_count || '2,400'),
    TRAINERS_COUNT: String(biz.trainers_count || '18'),
  };
}

function digitsOnly(str) {
  return String(str || '').replace(/\D/g, '');
}

// Last-resort default for any UPPER_SNAKE placeholder not in the manifest,
// so a future template addition never produces a broken (bracketed) page.
function fallbackFor(key) {
  return key.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Only strict {{UPPER_SNAKE}} tokens are treated as placeholders. This
// ignores in-template JavaScript such as `{{${pName}}}` used by the live
// tooltip code.
const PLACEHOLDER_RE = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g;

function applyPlaceholders(html, placeholders) {
  return html.replace(PLACEHOLDER_RE, (_match, key) =>
    key in placeholders ? placeholders[key] : fallbackFor(key),
  );
}

// Compile a single personalized page.
// Returns { html, placeholders, resolved } where `resolved` is the full
// template descriptor (so the caller can stamp it onto the campaign row).
//
// `templateKey` is the unified template id (e.g. 'barber-dark-luxury' for
// built-ins, 'tmpl_xxx' for custom). For back-compat, a niche string
// ('Barber') also works via the templates.js fallback map.
export async function compileSite(biz, templateKey, ownerKey = null) {
  const resolved = await resolveTemplate(templateKey, ownerKey);
  const raw = await loadRawHtml(resolved);
  const placeholders = buildPlaceholders(biz);
  const html = applyPlaceholders(raw, placeholders);

  // Absolute safety rule: zero leftover {{UPPER_SNAKE}} placeholders.
  const leftovers = html.match(PLACEHOLDER_RE);
  if (leftovers && leftovers.length) {
    const unique = [...new Set(leftovers)];
    throw new Error(
      `Compilation incomplete for "${biz.name}". Unresolved placeholders: ${unique.join(', ')}`,
    );
  }

  // Bump usage counter (custom only — built-ins skip).
  recordTemplateUse(resolved.key);

  return { html, placeholders, resolved };
}

// Re-export for legacy callers (custom-templates routes, Site Lab, etc.)
// that import from compile.js directly.
export { resolveTemplate, loadRawHtml };
// Keep db exported in case other modules used it (no longer required by
// this file, but harmless to keep available).
export { db };
