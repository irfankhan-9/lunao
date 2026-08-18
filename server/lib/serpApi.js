// SerpAPI adapter for the auto email-sender pipeline.
//
// Reads API key from the environment:
//   SERPAPI_API_KEY     — required for live mode (preferred)
//   SERPAPI_DRY_RUN     — when "true", fall through to mock results.
//
// Endpoint: https://serpapi.com/search.json?engine=google&...
// Pagination: 0-based `start` parameter, increments of 10. `num=10` is the
// default page size and `num` is now capped at 10 by Google.
//
// Response shape we consume:
//   { organic_results: [ { title, snippet, link, displayed_link } ], ... }
//
// We adapt this to the same `{ items: [{title, snippet, link, domain}] }`
// shape that the rest of the pipeline (extractLeadsFromDorkResults, the
// DRY_RUN mock, the legacy Google CSE path) already consumes, so callers
// don't care which provider answered.

const FETCH_TIMEOUT_MS = 12_000;

export function isSerpApiLive() {
  return Boolean(process.env.SERPAPI_API_KEY)
    && process.env.SERPAPI_DRY_RUN !== 'true';
}

/**
 * Search Google via SerpAPI and return the same shape used by the rest of
 * the pipeline:
 *   { ok, items: [{title, snippet, link, domain}], totalResults?, error? }
 *
 * @param {object} opts
 * @param {string} opts.query
 * @param {number} [opts.page]   1-indexed page number (we convert to start)
 */
export async function searchSerpApi({ query, page = 1 } = {}) {
  if (!query) return { ok: false, items: [], error: 'Empty query' };

  if (process.env.SERPAPI_DRY_RUN === 'true') {
    return { ok: false, items: [], error: 'SERPAPI_DRY_RUN=1; caller should use googleDork mock', mock: false };
  }

  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    return { ok: false, items: [], error: 'SerpAPI not configured (set SERPAPI_API_KEY)' };
  }

  const start = Math.max(0, (page - 1) * 10);
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('num', '10');
  url.searchParams.set('start', String(start));
  // No `location` param — we want geo-unbiased results so "Liverpool" can
  // mean the UK or anywhere else. Google decides based on its own ranking.

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, items: [], error: `SerpAPI HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = await res.json();
    if (data.error) {
      return { ok: false, items: [], error: `SerpAPI: ${data.error}` };
    }
    const organic = Array.isArray(data.organic_results) ? data.organic_results : [];
    const items = organic.map(normalizeSerpItem);
    // SerpAPI doesn't return an exact total for Google free-form search; use
    // `search_information.total_results` when present.
    const totalStr = data.search_information?.total_results;
    const total = totalStr ? parseInt(String(totalStr).replace(/,/g, ''), 10) : undefined;
    return { ok: true, items, totalResults: Number.isFinite(total) ? total : undefined };
  } catch (err) {
    return { ok: false, items: [], error: err.name === 'AbortError' ? 'serpapi-timeout' : err.message };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeSerpItem(item) {
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