// Google Custom Search (Dork) discovery for the auto email-sender pipeline.
//
// Reads API key + Custom Search Engine id from environment:
//   GOOGLE_CSE_API_KEY  — required for live mode
//   GOOGLE_CSE_CX       — required for live mode
//   GOOGLE_CSE_DRY_RUN  — when "true", skip the network call and return a
//                         deterministic mock result so the rest of the
//                         pipeline can be tested without burning API quota.
//
// The dork query template is fixed here per the spec:
//   ({niche} OR {niche_variants}) {city}
//   "gmail.com"
//   -site:instagram.com -site:facebook.com -site:tiktok.com
//   -site:linkedin.com -site:booksy.com
// The Gmail filter is just our default — callers can pass a different
// `emailHint` (e.g. "outlook.com", "yahoo.com") if the niche is more
// strongly associated with a Microsoft Exchange shop.

const FETCH_TIMEOUT_MS = 8000;

// Public surface ----------------------------------------------------------------

export function isDorkLive() {
  return Boolean(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX)
    && process.env.GOOGLE_CSE_DRY_RUN !== 'true';
}

/**
 * Compose the dork query string for a given niche + city.
 * @param {object} opts
 * @param {string} opts.niche        e.g. "Gym"
 * @param {string[]} [opts.nicheVariants]  optional synonyms (e.g. ["Fitness", "Health Club"])
 * @param {string} opts.city
 * @param {string} [opts.emailHint]  default `"gmail.com"`
 * @param {string[]} [opts.excludeSites]  default the social+booksy list
 */
export function composeDorkQuery({
  niche,
  nicheVariants = [],
  city,
  emailHint = 'gmail.com',
  excludeSites = ['instagram.com', 'facebook.com', 'tiktok.com', 'linkedin.com', 'booksy.com'],
}) {
  const nichePart = nicheVariants.length > 0
    ? `(${niche} OR ${nicheVariants.join(' OR ')})`
    : niche;
  const exclude = excludeSites.map((s) => `-site:${s}`).join(' ');
  return `${nichePart} ${city} "${emailHint}" ${exclude}`.trim();
}

/**
 * Run a Google Custom Search query against the configured CSE.
 * @param {object} opts
 * @param {string} opts.query
 * @param {number} [opts.start]  1-indexed start offset (10 results per page)
 * @returns {Promise<{ ok: boolean, items: Array<{title, snippet, link, domain}>, totalResults?: number, error?: string }>}
 */
export async function searchGoogleDork({ query, start = 1 } = {}) {
  if (!query) return { ok: false, items: [], error: 'Empty query' };

  if (process.env.GOOGLE_CSE_DRY_RUN === 'true') {
    return mockDorkResults(query, start);
  }

  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!apiKey || !cx) {
    return {
      ok: false,
      items: [],
      error: 'Google CSE not configured (set GOOGLE_CSE_API_KEY and GOOGLE_CSE_CX)',
    };
  }

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', query);
  url.searchParams.set('start', String(start));
  url.searchParams.set('num', '10');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, items: [], error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items.map(normalizeItem) : [];
    const total = data.searchInformation?.totalResults
      ? parseInt(data.searchInformation.totalResults, 10)
      : undefined;
    return { ok: true, items, totalResults: total };
  } catch (err) {
    return { ok: false, items: [], error: err.name === 'AbortError' ? 'dork-timeout' : err.message };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeItem(item) {
  let domain = '';
  try {
    domain = new URL(item.link).hostname.replace(/^www\./, '');
  } catch { /* ignore */ }
  return {
    title: item.title || '',
    snippet: item.snippet || '',
    link: item.link || '',
    domain,
  };
}

/**
 * Pull email addresses out of dork results. Returns non-deduplicated rows.
 * Each row's `business_name` defaults to the email local-part (per spec).
 * Phone is hard-masked to "*****".
 * @param {Array<{title:string, snippet:string, link:string, domain:string}>} items
 * @param {object} [opts]
 * @param {string} [opts.city]  injected as the lead's city
 * @param {string} [opts.discoverySource]  'dork_google' | 'dork_google_nearby'
 */
export function extractLeadsFromDorkResults(items, opts = {}) {
  const city = opts.city || '';
  const discoverySource = opts.discoverySource || 'dork_google';
  const out = [];
  const emailRegex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  for (const it of items) {
    const haystack = `${it.title} ${it.snippet} ${it.link}`;
    const matches = haystack.match(emailRegex) || [];
    for (const m of matches) {
      const email = m.toLowerCase().trim();
      const local = email.split('@')[0] || '';
      out.push({
        business_name: localToBusinessName(local),
        email,
        phone: '*****',
        city,
        website: it.link || '',
        domain: it.domain || '',
        title: it.title || '',
        discovery_source: discoverySource,
      });
    }
  }
  return out;
}

/**
 * Convert an email local-part into a presentable business name.
 * Handles the common patterns:
 *   "blueherongym"        → "Blue Heron Gym"
 *   "blue.heron.gym"      → "Blue Heron Gym"
 *   "blue-heron-gym"      → "Blue Heron Gym"
 *   "blueheron_gym"       → "Blue Heron Gym"
 */
export function localToBusinessName(local) {
  if (!local) return '';
  const parts = local
    .split(/[._\-+]/)
    .flatMap((p) => p.split(/(?=[A-Z])/))
    .map((p) => p.toLowerCase().trim())
    .filter(Boolean);
  if (parts.length === 0) return local;
  return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
}

/**
 * Deduplicate a list of leads by email. Returns a new array.
 */
export function dedupeLeadsByEmail(leads) {
  const seen = new Set();
  const out = [];
  for (const l of leads) {
    const e = (l.email || '').toLowerCase();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    out.push(l);
  }
  return out;
}

// Mock for DRY_RUN mode so the rest of the pipeline can be tested without
// burning API quota. Returns a deterministic 6 fake results per page that
// pretend to come from a generic niche. Each snippet contains a real
// `@example.com` email so the regex extractor finds them.
function mockDorkResults(query, start) {
  const offset = (start - 1) * 10;
  const niche = (query.split(' ')[0] || 'business').replace(/[()]/g, '');
  const city = (query.split('"')[2] || 'Sample City').trim();
  const items = [];
  for (let i = 0; i < 6; i++) {
    const n = offset + i + 1;
    const local = `${niche.toLowerCase()}${n}`;
    items.push({
      title: `${niche} ${n} — ${local}@gmail.com contact in ${city}`,
      snippet: `Reach out to ${local}@gmail.com for ${city} inquiries. Phone: *****`,
      link: `https://example${n}.com/contact`,
      domain: `example${n}.com`,
    });
  }
  return { ok: true, items, totalResults: 60, mock: true };
}
