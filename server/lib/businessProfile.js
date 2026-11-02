// Per-tenant business profile store for the Lunao Owner PWA.
//
// The agency creates a site for a business → compiles the HTML template into
// server/.sites/<slug>/index.html → owner redeems an invite code → PWA
// requests /api/pwa/me. This module reads/writes the per-tenant profile in
// the `business_profiles` table, and on first read for a slug, lazily
// backfills it from the compiled HTML's <meta> tags so legacy sites (which
// have no row yet) still light up the PWA without a migration.
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from './db.js';
import { SITES_DIR, siteBaseUrl } from './config.js';

const DEFAULT_THEME = {
  accent: '#059669',
  accentDark: '#047857',
  accentSoft: '#ecfdf5',
  accentBorder: '#a7f3d0',
  radius: 'lg',
};

function rowToProfile(row) {
  if (!row) return null;
  return {
    slug: row.slug,
    name: row.name,
    niche: row.niche || '',
    tagline: row.tagline || '',
    phone: row.phone || '',
    phoneRaw: row.phone_raw || '',
    email: row.email || '',
    address: row.address || '',
    city: row.city || '',
    state: row.state || '',
    timezone: row.timezone || '',
    logoUrl: row.logo_url || null,
    websiteUrl: row.website_url || `${siteBaseUrl()}/${row.slug}/`,
    socialLinks: {
      instagram: row.social_instagram || '',
      facebook: row.social_facebook || '',
      googleMaps: row.social_google_maps || '',
    },
    theme: {
      accent: row.theme_accent || DEFAULT_THEME.accent,
      accentDark: row.theme_accent_dark || DEFAULT_THEME.accentDark,
      accentSoft: row.theme_accent_soft || DEFAULT_THEME.accentSoft,
      accentBorder: row.theme_accent_border || DEFAULT_THEME.accentBorder,
      surface: '#ffffff',
      radius: row.theme_radius || DEFAULT_THEME.radius,
    },
    features: {
      booking: !!row.feature_booking,
      chatbot: !!row.feature_chatbot,
      email: !!row.feature_email,
      automations: !!row.feature_automations,
    },
  };
}

function profileToRow(p) {
  return {
    slug: p.slug,
    name: p.name || p.slug,
    niche: p.niche || null,
    tagline: p.tagline || null,
    phone: p.phone || null,
    phone_raw: p.phoneRaw || null,
    email: p.email || null,
    address: p.address || null,
    city: p.city || null,
    state: p.state || null,
    timezone: p.timezone || null,
    logo_url: p.logoUrl || null,
    website_url: p.websiteUrl || null,
    social_instagram: p.socialLinks?.instagram || null,
    social_facebook: p.socialLinks?.facebook || null,
    social_google_maps: p.socialLinks?.googleMaps || null,
    theme_accent: p.theme?.accent || DEFAULT_THEME.accent,
    theme_accent_dark: p.theme?.accentDark || DEFAULT_THEME.accentDark,
    theme_accent_soft: p.theme?.accentSoft || DEFAULT_THEME.accentSoft,
    theme_accent_border: p.theme?.accentBorder || DEFAULT_THEME.accentBorder,
    theme_radius: p.theme?.radius || DEFAULT_THEME.radius,
    feature_booking: p.features?.booking ? 1 : 0,
    feature_chatbot: p.features?.chatbot ? 1 : 0,
    feature_email: p.features?.email ? 1 : 0,
    feature_automations: p.features?.automations ? 1 : 0,
  };
}

// Read a single meta tag value from HTML. Returns the first match, or ''.
function readMeta(html, name) {
  // Match both <meta name="..." content="..."> and <meta content="..." name="...">
  const re = new RegExp(
    `<meta\\s+[^>]*?(?:name=["']${name}["']|content=["']([^"']*)["'][^>]*?name=["']${name}["'])[^>]*?(?:content=["']([^"']*)["']|name=["']${name}["'])[^>]*?>`,
    'i',
  );
  const m = html.match(re);
  if (!m) {
    // Simpler fallback: <meta name="x" content="y">
    const simple = new RegExp(
      `<meta\\s+name=["']${name}["']\\s+content=["']([^"']*)["']`,
      'i',
    );
    const s = html.match(simple);
    return s ? s[1] : '';
  }
  // Find the value of the content attribute
  const contentMatch = html
    .slice(m.index, m.index + m[0].length)
    .match(/content=["']([^"']*)["']/i);
  return contentMatch ? contentMatch[1] : '';
}

function readTitle(html) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : '';
}

// Extract business profile fields from the compiled site HTML. The agency's
// compile pipeline already injects a number of <meta name="business-*">
// tags. The title and <h1> also serve as fallback name/niche signals.
export function extractProfileFromHtml(slug, html) {
  if (!html) return null;
  const name =
    readMeta(html, 'business-name') ||
    readMeta(html, 'og:title') ||
    readTitle(html);
  const phone = readMeta(html, 'business-phone');
  const email = readMeta(html, 'business-email');
  const address = readMeta(html, 'business-address');
  const city = readMeta(html, 'business-city');
  const state = readMeta(html, 'business-state');
  const niche =
    readMeta(html, 'business-niche') ||
    readMeta(html, 'og:type') ||
    'Local Business';
  const tagline = readMeta(html, 'business-tagline') || readMeta(html, 'description');
  const logo = readMeta(html, 'business-logo') || readMeta(html, 'og:image');
  const website = readMeta(html, 'business-website') || readMeta(html, 'og:url');
  const accent = readMeta(html, 'theme-color') || readMeta(html, 'business-accent');

  // Best-effort phone-raw conversion (digits only).
  const phoneRaw = phone ? phone.replace(/\D/g, '') : '';

  return {
    slug,
    name: name || slug,
    niche,
    tagline,
    phone,
    phoneRaw,
    email,
    address,
    city,
    state,
    timezone: '',
    logoUrl: logo || null,
    websiteUrl: website || `${siteBaseUrl()}/${slug}/`,
    socialLinks: {
      instagram: readMeta(html, 'business-instagram'),
      facebook: readMeta(html, 'business-facebook'),
      googleMaps: readMeta(html, 'business-google-maps'),
    },
    theme: {
      accent: accent || DEFAULT_THEME.accent,
      accentDark: DEFAULT_THEME.accentDark,
      accentSoft: DEFAULT_THEME.accentSoft,
      accentBorder: DEFAULT_THEME.accentBorder,
      surface: '#ffffff',
      radius: DEFAULT_THEME.radius,
    },
    features: {
      booking: 1,
      chatbot: 1,
      email: 1,
      automations: 1,
    },
  };
}

// Read the compiled HTML for a slug if it exists.
async function readCompiledHtml(slug) {
  try {
    const file = path.join(SITES_DIR, slug, 'index.html');
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

// Read the profile for a slug, lazily backfilling from compiled HTML.
// Returns null only if no profile and no compiled HTML exist.
export async function getProfile(slug) {
  if (!slug) return null;
  const row = db
    .prepare('SELECT * FROM business_profiles WHERE slug = ?')
    .get(slug);
  if (row) return rowToProfile(row);

  // Backfill from compiled HTML.
  const html = await readCompiledHtml(slug);
  if (!html) return null;

  const profile = extractProfileFromHtml(slug, html);
  if (!profile) return null;
  const now = Date.now();
  const rowData = profileToRow(profile);
  rowData.created_at = now;
  rowData.updated_at = now;
  upsertRow(rowData);
  return profile;
}

// Upsert the profile row directly from a profile-shaped object.
function upsertRow(rowData) {
  const cols = Object.keys(rowData);
  const placeholders = cols.map(() => '?').join(', ');
  const sql = `INSERT INTO business_profiles (${cols.join(', ')}) VALUES (${placeholders})
               ON CONFLICT(slug) DO UPDATE SET ${cols
                 .filter((c) => c !== 'slug' && c !== 'created_at')
                 .map((c) => `${c} = excluded.${c}`)
                 .join(', ')}`;
  db.prepare(sql).run(...cols.map((c) => rowData[c]));
}

// Update an existing profile with new fields (owner-editable subset).
export function upsertProfile(slug, updates) {
  const existing = db
    .prepare('SELECT * FROM business_profiles WHERE slug = ?')
    .get(slug);
  const base = existing ? rowToProfile(existing) : { slug };
  const merged = {
    ...base,
    ...updates,
    slug,
    socialLinks: { ...(base.socialLinks || {}), ...(updates.socialLinks || {}) },
    theme: { ...(base.theme || {}), ...(updates.theme || {}) },
    features: { ...(base.features || {}), ...(updates.features || {}) },
  };
  const rowData = profileToRow(merged);
  rowData.updated_at = Date.now();
  if (!existing) rowData.created_at = Date.now();
  upsertRow(rowData);
  return getProfile(slug);
}

// Look up the slug that owns a profile (used by integrations to find a
// user_id for connected email / telnyx accounts).
export function getOwnerKeyForSlug(slug) {
  const row = db
    .prepare('SELECT slug FROM business_profiles WHERE slug = ?')
    .get(slug);
  return row ? `slug:${row.slug}` : null;
}
