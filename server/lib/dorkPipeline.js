// Auto Email Sender — Google Dorking pipeline orchestrator.
//
// Pipeline phases:
//   1. Validate the user-typed city against the bundled cities DB.
//      If the city isn't an exact match, the UI already prompted the
//      user for confirmation and passes back the canonical name.
//   2. Paginate Google dork queries against the chosen city, extracting
//      emails from results. Pages exhausted? Pull the next nearest
//      city from `findNearestCities` and start paginating again.
//   3. Insert discovered leads into `email_leads` with
//      `discovery_source = 'dork_google'` (or `dork_google_nearby` if
//      the lead was pulled from a non-primary city).
//   4. Hand off to the existing `runEmailPipeline` for site generation
//      and email send. The inter-send gap is fixed at 1s for dork
//      campaigns via the `minInterSendMs` parameter (CSV campaigns keep
//      the default 2.5s).
//
// This file is intentionally separate from emailPipeline.js so the
// CSV path stays byte-for-byte untouched.

import { lookupCity, findNearestCities } from './cities.js';
import {
  composeDorkQuery,
  searchGoogleDork,
  extractLeadsFromDorkResults,
  isDorkLive,
} from './googleDork.js';
import { searchSerpApi, isSerpApiLive } from './serpApi.js';
import { db } from './db.js';
import { runEmailPipeline } from './emailPipeline.js';
import {
  createEmailCampaign,
  updateEmailCampaignStatus,
} from './emailCampaigns.js';

// Live-provider precedence: SerpAPI (third-party, no `cx` needed) → Google
// CSE JSON API (requires both an API key and a Programmable Search Engine
// `cx` ID) → DRY_RUN mock.
function pickDorkProvider() {
  if (isSerpApiLive()) return 'serpapi';
  if (isDorkLive()) return 'google_cse';
  return 'mock';
}

async function searchDork({ query, page, provider }) {
  if (provider === 'serpapi') {
    return searchSerpApi({ query, page });
  }
  // google_cse uses 1-indexed `start`, our SerpAPI layer converts to 0-index.
  return searchGoogleDork({ query, start: page });
}

const MAX_PAGES_PER_CITY = 10;       // Google returns 10 results/page
const MAX_QUERY_BUDGET = 100;        // hard cap per campaign
const MIN_INTER_SEND_MS_DORK = 1000; // 1s wait per spec

// Population-aware page budget per city. Big cities (≥ 500k pop) get more
// pages and more nearby fallback cities; small cities stay tighter so we
// don't burn the entire query budget on a single low-volume run.
const PRIMARY_POP_BIG = 500_000;
const PAGES_PER_CITY_BIG = 5;        // for pop >= PRIMARY_POP_BIG
const PAGES_PER_CITY_SMALL = 2;      // for pop <  PRIMARY_POP_BIG
const NEARBY_RADIUS_KM = 150;        // user-chosen
const NEARBY_COUNT_BIG = 15;         // # of fallback cities for big-city runs
const NEARBY_COUNT_SMALL = 10;       // # of fallback cities for small-city runs

function pagesForCity(city) {
  const pop = Number(city && city.population) || 0;
  return pop >= PRIMARY_POP_BIG ? PAGES_PER_CITY_BIG : PAGES_PER_CITY_SMALL;
}

function nearbyLimitForCity(city) {
  const pop = Number(city && city.population) || 0;
  return pop >= PRIMARY_POP_BIG ? NEARBY_COUNT_BIG : NEARBY_COUNT_SMALL;
}

/**
 * Run the auto-sender pipeline.
 *
 * @param {object} opts
 * @param {string} opts.ownerKey
 * @param {string} opts.niche
 * @param {string} opts.targetCity        User-typed city name
 * @param {number} opts.targetVolume      Number of leads the user requested
 * @param {string} opts.templateKey
 * @param {string[]} opts.accountIds      Selected Gmail accounts
 * @param {string} [opts.emailSubject]
 * @param {string} [opts.emailBody]
 * @param {function} opts.onEvent         SSE forwarder
 * @param {string} [opts.userId]
 */
export async function runDorkPipeline({
  ownerKey,
  niche,
  targetCity,
  targetVolume,
  templateKey,
  accountIds,
  emailSubject,
  emailBody,
  onEvent = () => {},
  userId = null,
}) {
  const emit = (type, payload = {}) => onEvent({ type, ts: Date.now(), ...payload });

  if (!targetVolume || targetVolume <= 0) {
    throw new Error('targetVolume must be > 0');
  }
  if (!Array.isArray(accountIds) || accountIds.length === 0) {
    throw new Error('At least one Gmail account is required');
  }

  console.log(`[dork-pipeline] START owner=${ownerKey} niche=${niche} city=${targetCity} vol=${targetVolume}`);

  const provider = pickDorkProvider();
  console.log(`[dork-pipeline] using provider=${provider}`);

  // 1) Resolve the city.
  const lookup = lookupCity(targetCity);
  if (!lookup.exact && (!lookup.suggestions || lookup.suggestions.length === 0)) {
    throw new Error(`City not recognized: ${targetCity}`);
  }
  const primaryCity = lookup.exact
    ? lookup.match
    : lookup.suggestions[0]; // caller is expected to have prompted the user

  emit('dork:city-resolved', {
    requested: targetCity,
    resolved: { name: primaryCity.name, country: primaryCity.country, lat: primaryCity.lat, lon: primaryCity.lon },
    exact: lookup.exact,
    alternatives: lookup.suggestions ? lookup.suggestions.slice(0, 5) : [],
  });

  // 2) Build a queue of {city, page} entries. Start with the primary city.
  const queue = [{ city: primaryCity, page: 1, nearby: false }];
  const enqueuedKeys = new Set([`${primaryCity.name.toLowerCase()}::1`]);
  const seenEmails = new Set();
  const leads = [];
  let queryBudget = 0;
  const visitedCities = new Set([primaryCity.name.toLowerCase()]);

  const expandNearest = () => {
    const neighbors = findNearestCities({
      lat: primaryCity.lat,
      lon: primaryCity.lon,
      excludeNames: [primaryCity.name],
      limit: nearbyLimitForCity(primaryCity),
      maxRadiusKm: NEARBY_RADIUS_KM,
    });
    for (const n of neighbors) {
      const key = n.name.toLowerCase();
      if (visitedCities.has(key)) continue;
      visitedCities.add(key);
      const queueKey = `${key}::1`;
      queue.push({ city: n, page: 1, nearby: true });
      enqueuedKeys.add(queueKey);
    }
  };

  // Re-enqueue the next page for `c` if it still has budget and that
  // page hasn't already been queued. Used after every successful page
  // extraction so each city (primary + every nearby) consumes its full
  // population-derived `pagesForCity(c)` budget.
  const scheduleNextPage = (c, justFinishedPage) => {
    if (justFinishedPage >= pagesForCity(c)) return false;
    const nextPage = justFinishedPage + 1;
    const key = `${c.name.toLowerCase()}::${nextPage}`;
    if (enqueuedKeys.has(key)) return false;
    enqueuedKeys.add(key);
    const isPrimaryName = c.name.toLowerCase() === primaryCity.name.toLowerCase();
    queue.push({ city: c, page: nextPage, nearby: !isPrimaryName });
    return true;
  };

  // 3) Paginate the dork API until we have enough leads.
  while (leads.length < targetVolume && queue.length > 0 && queryBudget < MAX_QUERY_BUDGET) {
    const entry = queue.shift();
    const { city, page, nearby } = entry;
    const isPrimary = city.name.toLowerCase() === primaryCity.name.toLowerCase();
    const discoverySource = isPrimary ? 'dork_google' : 'dork_google_nearby';

    emit('dork:searching', {
      city: city.name,
      country: city.country,
      page,
      nearby: Boolean(nearby),
      targetRemaining: targetVolume - leads.length,
    });

    let search;
    try {
      const query = composeDorkQuery({ niche, city: city.name });
      search = await searchDork({ query, page, provider });
      queryBudget++;
    } catch (err) {
      console.error(`[dork-pipeline] search error: ${err.message}`);
      emit('dork:error', { city: city.name, page, error: err.message });
      continue;
    }

    if (!search.ok) {
      console.warn(`[dork-pipeline] search not ok for ${city.name} page ${page}: ${search.error}`);
      emit('dork:error', { city: city.name, page, error: search.error });
      continue;
    }

    const extracted = extractLeadsFromDorkResults(search.items, {
      city: city.name,
      discoverySource,
    });
    const before = leads.length;
    for (const l of extracted) {
      const e = (l.email || '').toLowerCase();
      if (!e || seenEmails.has(e)) continue;
      seenEmails.add(e);
      leads.push(l);
    }
    emit('dork:found', {
      city: city.name,
      page,
      newlyAdded: leads.length - before,
      totalSoFar: leads.length,
    });

    // Decide what to enqueue next. Always try to schedule the next page
    // for the current city so it consumes its full pop-aware budget.
    // Only fall back to nearest-city expansion when the current city's
    // budget is exhausted AND no other cities are pending.
    if (leads.length >= targetVolume) break;

    const stillHasBudget = scheduleNextPage(city, page);
    if (!stillHasBudget && queue.length === 0) {
      expandNearest();
      emit('dork:expand', { fromCity: city.name, candidates: queue.length });
    }
  }

  // Truncate to target volume.
  const trimmed = leads.slice(0, targetVolume);

  console.log(`[dork-pipeline] discovery complete: ${trimmed.length}/${targetVolume} leads across ${visitedCities.size} cities, ${queryBudget} queries`);

  emit('dork:discovery-complete', {
    requested: targetVolume,
    discovered: trimmed.length,
    cities: Array.from(visitedCities),
    queriesUsed: queryBudget,
    dorkLive: provider !== 'mock',
    dorkProvider: provider,
  });

  if (trimmed.length === 0) {
    throw new Error('No leads found — try a different city or niche');
  }

  // 4) Create the campaign row. createEmailCampaign sets every lead's
  //    discovery_source to 'csv' (its default); we override below by
  //    matching on email after insert.
  const campaign = createEmailCampaign({
    userId,
    niche,
    templateKey,
    leadSource: 'dork',
    targetVolume: trimmed.length,
    city: primaryCity.name,
    category: niche,
    emailSubject,
    emailBody,
    csvSnapshot: null,
    leads: trimmed.map((l) => ({
      name: l.business_name,
      email: l.email,
      phone: l.phone,
      city: l.city,
      website: l.website || '',
    })),
  });

  console.log(`[dork-pipeline] created campaign ${campaign.id} with ${trimmed.length} leads`);
  emit('dork:campaign-created', { campaignId: campaign.id, total: trimmed.length });

  // 5) Override each lead's discovery_source to reflect its actual origin.
  const lookupStmt = db.prepare(
    'SELECT id, email FROM email_leads WHERE campaign_id = ? AND email = ?',
  );
  const updateStmt = db.prepare(
    'UPDATE email_leads SET discovery_source = ? WHERE id = ?',
  );
  for (const l of trimmed) {
    const row = lookupStmt.get(campaign.id, (l.email || '').toLowerCase());
    if (row) {
      updateStmt.run(l.discovery_source, row.id);
    }
  }

  updateEmailCampaignStatus(campaign.id, 'running');

  // 6) Delegate to the existing email pipeline. The spec requests a 1s
  //    inter-send gap for dork campaigns (CSV campaigns keep the
  //    default 2.5s). The pipeline honors the override via its
  //    `minInterSendMs` parameter (added in this PR).
  await runEmailPipeline({
    campaignId: campaign.id,
    accountIds,
    onEvent,
    minInterSendMs: MIN_INTER_SEND_MS_DORK,
  });

  return campaign;
}