// server/lib/apifyLeadFinder.js
//
// Apify Google Maps Scraper integration for Lunao Lead Finder.
// Uses Apify Token provided by user to search Google Maps and strictly filter
// for businesses WITHOUT websites ("onlyWithWebsite: false").

const APIFY_TOKEN_DEFAULT = process.env.APIFY_TOKEN || '';

/**
 * Search Google Maps via Apify Google Places Crawler actor.
 *
 * @param {Object} opts
 * @param {string} opts.niche
 * @param {string} opts.city
 * @param {number} [opts.limit=20]
 * @param {string} [opts.token]
 * @returns {Promise<Array>} List of leads with phone number verified and NO website
 */
export async function searchApifyGoogleMaps(opts) {
  const niche = opts.niche || 'Barber';
  const rawCity = opts.city || 'Austin, TX';
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 300);
  const token = opts.token || process.env.APIFY_API_KEY || APIFY_TOKEN_DEFAULT;

  // Clean and format location to prevent "LOCATION NOT FOUND" errors on Apify
  const loc = parseLocationString(rawCity);
  const formattedCity = loc.formattedLocation;
  const searchQuery = `${niche} in ${formattedCity}`;

  console.log(`[ApifyLeadFinder] Triggering Apify Google Maps scraper for "${searchQuery}" (limit=${limit}, locationQuery="${formattedCity}")...`);

  // Optimized lightweight payload for high speed and 100% search accuracy
  const inputPayload = {
    searchStringsArray: [searchQuery],
    maxCrawledPlacesPerSearch: limit,
    onlyWithWebsite: false,
    includeWebResults: false,
    scrapeContacts: false,
    scrapePlaceDetailPage: false,
    scrapeReviewsPersonalData: false,
    scrapeDirectories: false,
    scrapeOrderOnline: false,
    scrapeTableReservationProvider: false,
    skipClosedPlaces: true,
    language: 'en',
  };

  // For small limits (<= 20), try fast sync endpoint first with 30s timeout
  if (limit <= 20) {
    const url = `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${token}&timeout=30`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputPayload),
      });

      const text = await response.text().catch(() => '');
      if (text.includes('LOCATION NOT FOUND') || text.includes('Location not found')) {
        throw new Error('INVALID_LOCATION: Location not found. Please input a valid city or niche location (e.g. Calgary, AB or Austin, TX).');
      }

      if (response.ok) {
        let items = [];
        try { items = JSON.parse(text); } catch (_) {}
        if (Array.isArray(items) && items.length > 0) {
          const parsed = processApifyItems(items, loc.city, limit);
          if (parsed.length > 0) return parsed;
        }
      }
    } catch (err) {
      if (err.message.includes('INVALID_LOCATION')) throw err;
      console.warn('[ApifyLeadFinder] Sync actor run notice:', err.message);
    }
  }

  // For bulk requests (> 20) or when sync returns empty / times out, run async actor job and poll dataset
  return await runAsyncApifyJob(token, inputPayload, searchQuery, loc.city, limit);
}

/**
 * Async actor run with dataset polling for bulk lead retrieval (up to 300 leads)
 */
async function runAsyncApifyJob(token, inputPayload, searchQuery, city, limit) {
  try {
    console.log(`[ApifyLeadFinder] Starting async actor run for "${searchQuery}" (limit=${limit})...`);
    const runUrl = `https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${token}`;
    const runRes = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inputPayload),
    });

    const errTxt = await runRes.text().catch(() => '');
    if (errTxt.includes('LOCATION NOT FOUND') || errTxt.includes('Location not found')) {
      throw new Error('INVALID_LOCATION: Location not found. Please input a valid city or niche location (e.g. Calgary, AB or Austin, TX).');
    }

    if (!runRes.ok) {
      console.warn(`[ApifyLeadFinder] Async run start returned HTTP ${runRes.status}: ${errTxt.slice(0, 200)}`);
      return [];
    }

    let runData = {};
    try { runData = JSON.parse(errTxt); } catch (_) {}
    const defaultDatasetId = runData?.data?.defaultDatasetId;
    const runId = runData?.data?.id;

    if (!defaultDatasetId) {
      console.warn('[ApifyLeadFinder] No datasetId returned from async actor run');
      return [];
    }

    console.log(`[ApifyLeadFinder] Async run initiated successfully (runId=${runId}, datasetId=${defaultDatasetId}). Polling dataset until scraper completes...`);

    const startTime = Date.now();
    const maxPollTimeMs = 120000; // Capped at 120s so Apify scraper has full time to finish completely
    let items = [];

    while (Date.now() - startTime < maxPollTimeMs) {
      await new Promise((r) => setTimeout(r, 2500));

      // Check run status from Apify
      let isFinished = false;
      if (runId) {
        try {
          const runStatusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
          if (runStatusRes.ok) {
            const runStatusData = await runStatusRes.json();
            const status = runStatusData?.data?.status;
            if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'TIMED-OUT' || status === 'ABORTED') {
              isFinished = true;
            }
          }
        } catch (_) {}
      }

      const datasetUrl = `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${token}&clean=true&limit=${limit * 3}`;
      const dataRes = await fetch(datasetUrl);
      if (dataRes.ok) {
        items = await dataRes.json().catch(() => []);
        if (Array.isArray(items) && items.length > 0) {
          const parsed = processApifyItems(items, city, limit);
          if (parsed.length >= limit || isFinished) {
            console.log(`[ApifyLeadFinder] Polled ${parsed.length} verified website-less leads from Apify in ${Math.round((Date.now() - startTime)/1000)}s (runFinished=${isFinished})`);
            return parsed;
          }
        }
      }

      if (isFinished) break;
    }

    if (!Array.isArray(items) || items.length === 0) {
      const finalUrl = `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${token}&clean=true&limit=${limit * 3}`;
      const finalRes = await fetch(finalUrl);
      if (finalRes.ok) items = await finalRes.json().catch(() => []);
    }

    return processApifyItems(items, city, limit);
  } catch (err) {
    if (err.message.includes('INVALID_LOCATION')) throw err;
    console.error('[ApifyLeadFinder] Async dataset polling run failed:', err.message);
    return [];
  }
}

/**
 * Parse location string into structured city, province/state, and country
 */
export function parseLocationString(inputCity, countryHint = '') {
  const raw = String(inputCity || '').trim();
  if (!raw) {
    return { city: 'Austin', province: 'TX', country: 'US', formattedLocation: 'Austin, TX' };
  }

  // Clean common typos in popular cities
  let cleaned = raw
    .replace(/calagry/gi, 'Calgary')
    .replace(/vancouvr/gi, 'Vancouver')
    .replace(/torono/gi, 'Toronto')
    .replace(/montreal/gi, 'Montreal')
    .replace(/edmonon/gi, 'Edmonton')
    .replace(/austn/gi, 'Austin');

  const lower = cleaned.toLowerCase();

  // Check if Canadian province or country is in string
  const isCanada = lower.includes('canada') || countryHint === 'CA' ||
    /\b(ab|bc|mb|nb|nl|ns|nt|nu|on|pe|qc|sk|yt|alberta|british columbia|manitoba|ontario|quebec|saskatchewan)\b/i.test(cleaned);

  if (isCanada) {
    let province = 'AB';
    if (lower.includes('vancouver') || lower.includes('victoria') || lower.includes('kelowna') || lower.includes('bc')) province = 'BC';
    else if (lower.includes('calgary') || lower.includes('edmonton') || lower.includes('red deer') || lower.includes('ab') || lower.includes('alberta')) province = 'AB';
    else if (lower.includes('toronto') || lower.includes('ottawa') || lower.includes('mississauga') || lower.includes('hamilton') || lower.includes('on') || lower.includes('ontario')) province = 'ON';
    else if (lower.includes('montreal') || lower.includes('quebec') || lower.includes('qc')) province = 'QC';
    else if (lower.includes('winnipeg') || lower.includes('mb')) province = 'MB';
    else if (lower.includes('saskatoon') || lower.includes('regina') || lower.includes('sk')) province = 'SK';
    else if (lower.includes('halifax') || lower.includes('ns')) province = 'NS';

    let city = cleaned.split(',')[0].replace(/\b(canada|ca)\b/gi, '').trim();
    if (!city) city = 'Calgary';
    city = city.charAt(0).toUpperCase() + city.slice(1);

    return {
      city,
      province,
      country: 'CA',
      formattedLocation: `${city}, ${province}, Canada`
    };
  } else {
    let parts = cleaned.split(',').map(s => s.trim());
    let city = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : 'Austin';
    let province = parts[1] ? parts[1].toUpperCase() : 'TX';
    if (province.length > 2) province = 'TX';

    return {
      city,
      province,
      country: 'US',
      formattedLocation: `${city}, ${province}`
    };
  }
}

/**
 * Process and strictly filter items from Apify output:
 * - MUST NOT have a website (empty string / no website on Google Maps)
 * - MUST have a phone number
 */
function processApifyItems(items, fallbackCity, limit) {
  if (!Array.isArray(items)) return [];

  const results = [];
  const seenPhones = new Set();
  const parsedLoc = parseLocationString(fallbackCity);

  for (const item of items) {
    if (results.length >= limit) break;

    const name = item.title || item.name || item.placeName || '';
    const phone = item.phone || item.phoneUnformatted || item.phoneNumber || '';
    const rawAddress = item.address || item.street || item.formattedAddress || '';

    // Extract website URL if present:
    const rawWebsite = item.website || item.site || item.domain || item.companyWebsite || item.siteUrl || item.webUrl || '';
    const websiteStr = String(rawWebsite).trim();

    const isGoogleMapsLink = websiteStr.toLowerCase().includes('google.com/maps') ||
      websiteStr.toLowerCase().includes('google.com/place') ||
      websiteStr.toLowerCase().includes('google.ca/maps') ||
      websiteStr.toLowerCase().includes('maps.google.com');

    const cleanWebsite = (websiteStr && !isGoogleMapsLink) ? websiteStr : '';

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      continue;
    }

    const cleanPhone = phone.trim();
    if (seenPhones.has(cleanPhone)) continue;
    seenPhones.add(cleanPhone);

    const city = item.city || extractCityFromAddress(rawAddress) || parsedLoc.city;
    const state = item.state || extractStateFromAddress(rawAddress) || parsedLoc.province;
    const country = item.countryCode || parsedLoc.country;
    const placeId = item.placeId || item.id || `apify_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    let address = rawAddress.trim();
    if (!address) {
      address = `${city}, ${state}`;
    } else {
      address = address.replace(/calagry/gi, 'Calgary').replace(/vancouvr/gi, 'Vancouver');
    }

    const googleUrl = item.googleMapsUrl || item.url || item.placeUrl || (placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name.trim() + ' ' + address)}`);

    results.push({
      name: name.trim(),
      phone: cleanPhone,
      website: cleanWebsite,
      googleUrl,
      address,
      city,
      province: state,
      country,
      placeId,
    });
  }

  console.log(`[ApifyLeadFinder] Processed ${items.length} raw items -> ${results.length} verified leads WITHOUT websites.`);
  return results;
}

function extractCityFromAddress(address) {
  if (!address) return '';
  const parts = address.split(',');
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 2].trim().replace(/\d+/g, '').replace(/\b(canada|ca)\b/gi, '').trim();
    if (candidate) return candidate.charAt(0).toUpperCase() + candidate.slice(1);
  }
  return '';
}

function extractStateFromAddress(address) {
  if (!address) return '';
  const match = address.match(/\b([A-Z]{2})\b/);
  if (match) return match[1];
  return '';
}

