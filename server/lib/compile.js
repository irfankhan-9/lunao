// Template compilation engine.
//
// All template resolution goes through server/lib/templates.js so the
// picker UI, deploy pipeline, and preview iframe always agree on which
// raw HTML file gets used. This module is only responsible for:
//   - picking a raw HTML body from a resolved template
//   - filling {{PLACEHOLDER}} tokens with business data
//   - guaranteeing zero leftover brackets in the final output
import { resolveTemplate, loadRawHtml, recordTemplateUse } from './templates.js';
import { slugify } from './slug.js';
import { db } from './db.js';

// Build the full placeholder manifest from a (possibly sparse) business
// record. Sensible defaults are derived so a minimal CSV (name, phone,
// city) still produces a fully populated, bracket-free site.
export function buildPlaceholders(biz) {
  const name = biz.name || biz.business_name || 'Local Business';
  const city = biz.city || '';
  // Mask dork leads (`phone === '*'`) so PHONE_DISPLAY and PHONE_RAW both
  // render '*****' instead of digitsOnly('*') collapsing to an empty string.
  const phoneDisplay = biz.phone === '*' ? '*' : (biz.phone || biz.phone_display || '(512) 555-0199');
  const phoneRaw = biz.phone === '*' ? '*' : (biz.phone_raw || digitsOnly(phoneDisplay) || '5125550199');
  const firstWordOf = (str) => String(str || '').trim().split(/\s+/)[0] || '';

  // Use business name as default for social media handles when not provided
  const defaultSocialSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'localbusiness';
  const cleanDomain = name.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'localbusiness';

  const igHandle =
    biz.instagram_handle ||
    biz.instagram ||
    defaultSocialSlug;
  const fbUrl =
    biz.facebook_url ||
    biz.facebook ||
    `https://facebook.com/${defaultSocialSlug}`;
  const website =
    biz.website ||
    biz.site_url ||
    `https://${cleanDomain}.com`;
  const rating = String(biz.google_rating || biz.rating || '4.9');
  const splitCityState = (c) => {
    const parts = String(c || '').split(',').map((p) => p.trim());
    return { state: parts.length > 1 ? parts[parts.length - 1] : '' };
  };
  const { state: derivedState } = splitCityState(city);

  return {
    SLUG: biz.slug || slugify(name, city),
    BUSINESS_NAME: name,
    BUSINESS_NAME_SHORT: biz.business_name_short || biz.short || firstWordOf(name),
    CITY: city || 'Your City',
    STATE: biz.state || derivedState || '',
    YEARS_IN_BUSINESS: String(biz.years_in_business || biz.years || '2015'),
    PHONE: phoneDisplay,
    PHONE_DISPLAY: phoneDisplay,
    PHONE_RAW: phoneRaw,
    EMAIL:
      biz.email ||
      biz.contact_email ||
      `contact@${cleanDomain}.com`,
    ADDRESS: biz.address || (city ? `Downtown ${city.split(',')[0]}` : '3801 Capital of Texas Hwy'),
    GOOGLE_RATING: rating,
    GOOGLE_REVIEW_COUNT: String(biz.google_review_count || biz.reviews || '342'),
    INSTAGRAM_HANDLE: String(igHandle).replace(/^@/, ''),
    FACEBOOK_URL: fbUrl,
    WEBSITE: website,
    SITE_URL: website,
    TWITTER_HANDLE: biz.twitter_handle || biz.twitter || biz.x_handle || defaultSocialSlug,
    LINKEDIN_URL: biz.linkedin_url || biz.linkedin || `https://linkedin.com/company/${defaultSocialSlug}`,
    TIKTOK_HANDLE: biz.tiktok_handle || biz.tiktok || defaultSocialSlug,
    YOUTUBE_URL: biz.youtube_url || biz.youtube || `https://youtube.com/@${defaultSocialSlug}`,
    // HVAC & Architecture bespoke template placeholders
    CITY_NAME: city || 'Your City',
    PHONE_NUMBER: phoneDisplay,
    BOOKING_URL: biz.booking_url || '#booking',
    BUSINESS_DESCRIPTION: biz.business_description || biz.description || 'Premier residential and commercial HVAC engineering, inverter heat pumps, concealed high-velocity zoning, and hospital-grade indoor air quality purification.',
    HERO_IMAGE: biz.hero_image || 'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?auto=format&fit=crop&w=1920&q=85',
    LOGO: biz.logo || name,
    BEFORE_IMAGE_URL: biz.before_image_url || 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
    AFTER_IMAGE_URL: biz.after_image_url || 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80',
    GOOGLE_MAPS_URL: biz.google_maps_url || (city ? `https://maps.google.com/?q=${encodeURIComponent(name + ' ' + city)}` : 'https://maps.google.com'),
    INSTAGRAM_URL: biz.instagram_url || (String(igHandle).startsWith('http') ? igHandle : `https://instagram.com/${String(igHandle).replace(/^@/, '')}`),
    TIKTOK_URL: biz.tiktok_url || (biz.tiktok_handle ? (String(biz.tiktok_handle).startsWith('http') ? biz.tiktok_handle : `https://tiktok.com/@${String(biz.tiktok_handle).replace(/^@/, '')}`) : `https://tiktok.com/@${defaultSocialSlug}`),
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

// Broad regex to catch {{UPPER_SNAKE}}, {{lower_snake}}, or {{Mixed_Case}} placeholders.
const PLACEHOLDER_RE = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

function applyPlaceholders(html, placeholders) {
  // Case-insensitive lookup map
  const upperMap = {};
  for (const [k, v] of Object.entries(placeholders)) {
    upperMap[k.toUpperCase()] = v;
  }

  let result = html.replace(PLACEHOLDER_RE, (_match, rawKey) => {
    const key = rawKey.toUpperCase();
    if (key in upperMap) {
      return upperMap[key];
    }
    return fallbackFor(key);
  });

  // Ensure tel: links are cleanly formatted (no spaces or parentheses)
  result = result.replace(/href=["']tel:\s*([^"']+)["']/gi, (_match, rawTel) => {
    const trimmed = rawTel.trim();
    if (trimmed === '*' || trimmed === '*****') return 'href="tel:*"';
    const hasPlus = trimmed.startsWith('+');
    const digits = trimmed.replace(/\D/g, '');
    const cleanTel = (hasPlus ? '+' : '') + digits;
    return `href="tel:${cleanTel || '5550000'}"`;
  });

  return result;
}

// Compile a single personalized page.
// Returns { html, placeholders, resolved } where `resolved` is the full
// template descriptor (so the caller can stamp it onto the campaign row).
//
// `templateKey` is the unified template id (e.g. 'barber-dark-luxury' for
// built-ins, 'tmpl_xxx' for custom). For back-compat, a niche string
// ('Barber') also works via the templates.js fallback map.
// `directRawHtml` takes absolute precedence: when provided, the exact HTML
// vibe-coded or created by the user is rebranded directly without DB lookup.
export async function compileSite(biz, templateKey, ownerKey = null, directRawHtml = null) {
  const explicitRaw = directRawHtml || biz?.rawHtml || biz?.templateHtml || null;
  let resolved;
  let raw = '';

  if (explicitRaw && typeof explicitRaw === 'string' && explicitRaw.trim().length > 200) {
    resolved = {
      key: templateKey || 'custom-vibe-template',
      source: 'custom',
      name: biz?.templateName || 'Custom Vibe Template',
      niche: biz?.niche || 'General',
      rawHtml: explicitRaw,
      previewPath: `/api/templates/${encodeURIComponent(templateKey || 'custom-vibe-template')}/preview`,
    };
    raw = explicitRaw;
  } else {
    resolved = await resolveTemplate(templateKey, ownerKey);
    raw = await loadRawHtml(resolved);
  }

  if (!raw || raw.trim().length < 500) {
    throw new Error(`Template "${resolved?.key || templateKey}" raw HTML is invalid or empty (${raw ? raw.length : 0} bytes).`);
  }

  const placeholders = buildPlaceholders(biz);
  let html = applyPlaceholders(raw, placeholders);

  // Absolute safety rule: guarantee zero leftover {{...}} placeholders.
  const leftovers = html.match(PLACEHOLDER_RE);
  if (leftovers && leftovers.length) {
    html = html.replace(PLACEHOLDER_RE, (_m, k) => fallbackFor(k.toUpperCase()));
  }

  // Guarantee booking bridge script is injected for verified booking handling
  if (!html.includes('lunao-booking-bridge.js')) {
    if (html.includes('</body>')) {
      html = html.replace('</body>', '<script src="/lunao-booking-bridge.js"></script>\n</body>');
    } else {
      html += '\n<script src="/lunao-booking-bridge.js"></script>';
    }
  }

  // HARD GATE 1: Verify compiled HTML is a real, complete rebranded website
  if (!html || html.trim().length < 2000) {
    throw new Error(`Compiled HTML for "${placeholders.BUSINESS_NAME}" failed minimum size check (${html ? html.length : 0} bytes).`);
  }
  if (html.includes('Site Customization In Progress')) {
    throw new Error(`Compiled HTML for "${placeholders.BUSINESS_NAME}" contains forbidden 404 placeholder text.`);
  }
  if (!html.toLowerCase().includes(placeholders.BUSINESS_NAME.toLowerCase())) {
    throw new Error(`Compiled HTML for "${placeholders.BUSINESS_NAME}" failed rebranding verification: business name was not injected into template.`);
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
