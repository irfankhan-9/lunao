// smsLeads.js
//
// SMS Lead Discovery — Google Places API for Lunao's SMS campaigns.
//
// Self-contained: contains its own copy of Places API search/detail calls so
// it does NOT import from placesApi.js (which uses TypeScript syntax that
// would require a tsx loader). Differences from the email campaign's
// placesApi.js:
//   1. Filters by country=CA when the caller passes it (Free/Starter).
//   2. Requires a phone number to be present (website filter inverted).
//   3. Exposes 13 Canadian provinces used by the wizard's lead finder.

const PLACES_API_BASE = 'https://places.googleapis.com/v1/places:searchText';

export const CA_PROVINCES = [
  { code: 'AB', name: 'Alberta' },
  { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' },
  { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' },
  { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' },
  { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' },
  { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' },
  { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
];

export const SMS_NICHE_SEARCH_TERMS = {
  'Barber': 'barbershop barbers',
  'Salon': 'hair salon beauty salon',
  'Dentist': 'dentist dental clinic',
  'HVAC': 'hvac heating cooling contractor',
  'Gym': 'gym fitness center',
  'Roofing': 'roofing contractor roofer',
  'Real Estate': 'real estate agent realtor',
  'Plumber': 'plumber plumbing service',
  'Electrician': 'electrician electrical contractor',
  'Restaurant': 'restaurant',
  'Cafe': 'cafe coffee shop',
  'Auto Repair': 'auto repair mechanic',
  'Landscaping': 'landscaping lawn care',
  'Cleaning': 'house cleaning service',
};

// =============================================================================
// Places API helpers (plain JS, no TypeScript annotations)
// =============================================================================

async function placesSearch(query, apiKey, limit, lat, lon) {
  let allPlaces = [];
  let pageToken = null;
  const targetCount = Math.min(Math.max(1, limit || 20), 100);

  while (allPlaces.length < targetCount) {
    const pageSize = Math.min(20, targetCount - allPlaces.length);
    const body = {
      textQuery: query,
      pageSize,
    };
    if (pageToken) {
      body.pageToken = pageToken;
    }
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      body.locationBias = {
        circle: { center: { latitude: lat, longitude: lon }, radius: 50000 },
      };
    }
    const res = await fetch(PLACES_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.addressComponents,nextPageToken',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(function() { return ''; });
      console.warn('Places search HTTP ' + res.status + ': ' + text.slice(0, 200));
      if (allPlaces.length > 0) break;
      throw new Error('Places search failed (' + res.status + '): ' + text.slice(0, 200));
    }
    const data = await res.json();
    const places = Array.isArray(data.places) ? data.places : [];
    allPlaces.push(...places);

    if (!data.nextPageToken || places.length === 0) break;
    pageToken = data.nextPageToken;
  }

  return allPlaces;
}

async function placesDetails(placeId, apiKey) {
  const fields = 'displayName,formattedAddress,nationalPhoneNumber,websiteUri,googleMapsUri,addressComponents';
  const res = await fetch('https://places.googleapis.com/v1/places/' + placeId, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fields,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(function() { return ''; });
    throw new Error('Places details failed (' + res.status + '): ' + text.slice(0, 200));
  }
  return res.json();
}

// =============================================================================
// Address component helpers
// =============================================================================

function getCountryCode(components) {
  if (!Array.isArray(components)) return null;
  for (let i = 0; i < components.length; i++) {
    const c = components[i];
    if (Array.isArray(c.types) && c.types.indexOf('country') !== -1) {
      return c.shortText || c.short_name || null;
    }
  }
  return null;
}

function getAdmin(components) {
  if (!Array.isArray(components)) return '';
  for (let i = 0; i < components.length; i++) {
    const c = components[i];
    if (!Array.isArray(c.types)) continue;
    if (c.types.indexOf('administrative_area_level_1') !== -1 ||
        c.types.indexOf('state') !== -1) {
      return (c.text || c.longText || c.long_name || '').toString();
    }
  }
  return '';
}

function getCity(components) {
  if (!Array.isArray(components)) return '';
  var targets = ['locality', 'sublocality', 'postal_town'];
  for (var ti = 0; ti < targets.length; ti++) {
    var t = targets[ti];
    for (var ci = 0; ci < components.length; ci++) {
      var c = components[ci];
      if (!Array.isArray(c.types)) continue;
      if (c.types.indexOf(t) !== -1) {
        var v = c.text || c.longText || c.long_name;
        if (v) return String(v);
      }
    }
  }
  return '';
}

var _sleep = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };

/**
 * Discover SMS leads from Google Places.
 *
 * @param {Object} opts
 * @param {string} opts.apiKey      - Google's Places API key (server-side)
 * @param {string} opts.niche       - Display name (mapped via SMS_NICHE_SEARCH_TERMS)
 * @param {string} opts.city        - Human city name used to build the text query
 * @param {number} [opts.lat]      - Optional lat for the locationBias circle
 * @param {number} [opts.lon]      - Optional lon for the locationBias circle
 * @param {string} [opts.country]   - ISO-2 code; results not in this country are filtered out
 * @param {number} [opts.limit=20] - Max results to return
 * @param {function} [opts.onProgress] - ({ stage, leads, total, current }) => void
 * @returns {Promise<Array>}
 */
export async function discoverSmsLeadsFromPlaces(opts) {
  var apiKey = opts.apiKey;
  var niche = opts.niche;
  var city = opts.city;
  var lat = opts.lat;
  var lon = opts.lon;
  var country = opts.country;
  var limit = opts.limit || 20;
  var onProgress = opts.onProgress;

  if (!apiKey) throw new Error('Google Places API key not configured');
  if (!niche || !city) throw new Error('Both niche and city are required');

  var loc = parseLocationString(city, country);
  var targetCountry = country || loc.country;

  var nicheTerm = SMS_NICHE_SEARCH_TERMS[niche] || niche;
  var searchTerm = nicheTerm + ' in ' + city;

  console.log('[discoverSmsLeadsFromPlaces] Querying Google Places API for:', searchTerm, '(limit=' + limit + ', targetCountry=' + targetCountry + ')');

  var places = await placesSearch(searchTerm, apiKey, limit, lat, lon);
  var results = [];

  for (var i = 0; i < places.length; i++) {
    var p = places[i];

    // SMS requirement: a phone number is mandatory.
    var phone = (p.nationalPhoneNumber || '').toString();
    if (!phone) continue;

    var website = (p.websiteUri || p.website || '').toString().trim();

    // Country filter
    if (targetCountry) {
      var cc = getCountryCode(p.addressComponents);
      if (cc && cc.toUpperCase() !== targetCountry.toUpperCase()) continue;
    }

    var placeName = (p.displayName && p.displayName.text) || p.name || '';
    var googleUrl = p.googleMapsUri || ('https://www.google.com/maps/place/?q=place_id:' + p.id);

    results.push({
      name: placeName,
      phone: phone,
      website: website,
      googleUrl: googleUrl,
      address: (p.formattedAddress || '').toString(),
      city: getCity(p.addressComponents) || loc.city,
      province: getAdmin(p.addressComponents) || loc.province,
      country: (getCountryCode(p.addressComponents) || targetCountry || '').toString(),
      placeId: p.id,
    });

    if (typeof onProgress === 'function') {
      onProgress({ stage: 'scanning', leads: results.length, total: places.length, current: i + 1 });
    }
  }

  console.log('[discoverSmsLeadsFromPlaces] Google Places API returned', results.length, 'valid leads for', searchTerm);

  if (typeof onProgress === 'function') {
    onProgress({ stage: 'done', leads: results.length, total: places.length });
  }

  return results;
}

// =============================================================================
// Canadian area code classifier
// =============================================================================

var CA_AREA_CODES = {
  '204':true,'226':true,'236':true,'249':true,'250':true,'289':true,'306':true,
  '343':true,'365':true,'367':true,'368':true,'403':true,'416':true,'418':true,
  '431':true,'437':true,'438':true,'450':true,'474':true,'506':true,'514':true,
  '519':true,'548':true,'579':true,'581':true,'587':true,'604':true,'613':true,
  '639':true,'647':true,'672':true,'683':true,'705':true,'709':true,'778':true,
  '780':true,'782':true,'807':true,'819':true,'825':true,'867':true,'873':true,
  '902':true,'905':true,'942':true,
};

/**
 * Classify a raw phone number string by country.
 * Returns one of: 'CA', 'US', 'INTL', null.
 */
export function detectCountryFromPhone(raw) {
  var s = String(raw || '').trim();
  var plus = s.charAt(0) === '+' ? '+' : '';
  var digits = s.replace(/\D/g, '');
  var norm = plus + digits;

  if (norm.indexOf('+1') === 0 && digits.length === 11) {
    var area = digits.slice(1, 4);
    return CA_AREA_CODES[area] ? 'CA' : 'US';
  }
  if (norm.indexOf('+') === 0 && digits.length >= 7) {
    if (digits.indexOf('1') === 0 && digits.length === 11) {
      var area2 = digits.slice(1, 4);
      return CA_AREA_CODES[area2] ? 'CA' : 'US';
    }
    return 'INTL';
  }
  if (digits.length === 10 && /^[2-9]/.test(digits)) {
    var area3 = digits.slice(0, 3);
    return CA_AREA_CODES[area3] ? 'CA' : 'US';
  }
  if (digits.length === 11 && digits.indexOf('1') === 0) {
    var area4 = digits.slice(1, 4);
    return CA_AREA_CODES[area4] ? 'CA' : 'US';
  }
  if (digits.length >= 7) return 'INTL';
  return null;
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

