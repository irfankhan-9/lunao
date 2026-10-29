// Deployed-site store helpers for the Site Editor.
// Sites are the same on-disk artifacts the pipeline stages:
//   server/.sites/<slug>/index.html
// The editor lists them, loads one for editing, and writes edits back.
import fs from 'node:fs/promises';
import path from 'node:path';
import { SITES_DIR, siteBaseUrl } from './config.js';

// Only allow safe slug segments (defends against path traversal).
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/i;

export function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

function siteDir(slug) {
  if (!isValidSlug(slug)) throw new Error('Invalid site slug');
  return path.join(SITES_DIR, slug);
}

function siteFile(slug) {
  return path.join(siteDir(slug), 'index.html');
}

export function titleFromHtml(html) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  // Strip the " — Luxury Barbershop in City" style suffix for a clean label.
  return m[1].replace(/\s+/g, ' ').trim();
}

// Rough niche guess from compiled markup (best-effort, for list labels only).
export function nicheFromHtml(html) {
  // Prefer the <title> for a clean signal, falling back to the body.
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const h = `${titleMatch ? titleMatch[1] : ''} ${html}`.toLowerCase();
  // Order matters: check specific niches before the looser HVAC keywords.
  if (h.includes('barbershop') || h.includes('barber')) return 'Barber';
  if (h.includes('real estate') || h.includes('realty') || h.includes('brokerage')) return 'Real Estate';
  if (h.includes('roofing') || h.includes('roofer')) return 'Roofing';
  if (h.includes('dentist') || h.includes('dental')) return 'Dentist';
  if (h.includes('salon') || h.includes('hair studio')) return 'Salon';
  if (h.includes('fitness') || h.includes('gym')) return 'Gym';
  if (h.includes('hvac') || h.includes('heating') || h.includes('cooling') || h.includes('climate')) return 'HVAC';
  return 'Site';
}

// List every deployed site (folder with an index.html) with light metadata.
export async function listSites() {
  let entries = [];
  try {
    entries = await fs.readdir(SITES_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const sites = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidSlug(entry.name)) continue;
    const file = path.join(SITES_DIR, entry.name, 'index.html');
    let html = '';
    try {
      html = await fs.readFile(file, 'utf8');
    } catch {
      continue; // folder without an index.html
    }
    let updatedAt = null;
    try {
      updatedAt = (await fs.stat(file)).mtimeMs;
    } catch {
      /* ignore */
    }
    sites.push({
      slug: entry.name,
      title: titleFromHtml(html) || entry.name,
      niche: nicheFromHtml(html),
      url: `${siteBaseUrl()}/${entry.name}/`,
      updatedAt,
    });
  }
  // Most recently edited first.
  sites.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return sites;
}

export async function readSite(slug) {
  return fs.readFile(siteFile(slug), 'utf8');
}

export async function writeSite(slug, html) {
  const dir = siteDir(slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(siteFile(slug), html, 'utf8');
  return `${siteBaseUrl()}/${slug}/`;
}

export async function siteExists(slug) {
  try {
    await fs.access(siteFile(slug));
    return true;
  } catch {
    return false;
  }
}
