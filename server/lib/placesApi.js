// Places API Integration for Email Campaign Lead Discovery
//
// Uses Google Places Text Search API (v1) with X-Goog-FieldMask to fetch up to
// 20 local businesses AND their official websiteUri + phone number in a SINGLE
// ~500ms HTTP request (avoiding N+1 Place Details calls).

import { addEmailLead } from './emailCampaigns.js';
import { googleMaps } from './config.js';
import { db } from './db.js';
import { lookupCity } from './cities.js';

const PLACES_API_BASE = 'https://places.googleapis.com/v1/places:searchText';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Global shared lead cache so repeated or high-volume (300-500 lead) runs
// in the same city reuse previously crawled leads at $0 Google Places API cost.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS places_lead_cache (
      searched_city_norm TEXT NOT NULL,
      niche_norm TEXT NOT NULL,
      place_id TEXT NOT NULL,
      business_name TEXT NOT NULL,
      resolved_city TEXT,
      state TEXT,
      phone TEXT,
      website TEXT,
      root_domain TEXT,
      email TEXT,
      email_host TEXT,
      discovery_method TEXT,
      source_query TEXT,
      source_page INTEGER DEFAULT 1,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (searched_city_norm, niche_norm, place_id)
    );
    CREATE INDEX IF NOT EXISTS idx_places_lead_cache_lookup
      ON places_lead_cache (searched_city_norm, niche_norm, updated_at);
  `);
} catch (err) {
  console.warn('[placesApi] places_lead_cache init notice:', err.message);
}

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.location',
  'places.addressComponents',
].join(',');

// Non-email social/booking aggregator domains that never expose a business's own contact email
const NON_WEBSITE_HOSTS = new Set([
  'instagram.com',
  'facebook.com',
  'm.facebook.com',
  'tiktok.com',
  'linktr.ee',
  'fresha.com',
  'getsquire.com',
  'booksire.com',
  'yelp.com',
  'wa.me',
  'whatsapp.com',
  'api.whatsapp.com',
]);

export function extractNormalizedDomain(rawUrl) {
  if (!rawUrl) return '';
  try {
    const withProto = /^https?:\/\//i.test(String(rawUrl).trim())
      ? String(rawUrl).trim()
      : `https://${String(rawUrl).trim()}`;
    const u = new URL(withProto);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isSkippableSocialOrAggregatorUrl(rawUrl) {
  const host = extractNormalizedDomain(rawUrl);
  if (!host) return true;
  for (const blocked of NON_WEBSITE_HOSTS) {
    if (host === blocked || host.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

// 25+ rich intra-city sub-niche & directional query variations per niche so
// high-volume runs (300-500 leads) discover distinct pockets of the SAME city
// without ever intentionally querying a different city.
const NICHE_PAGE_QUERIES = {
  barber: [
    'barbershop barbers',
    'mens hair salon grooming lounge',
    'fade barbershop hair studio',
    'traditional barber shop',
    'local mens haircut shave studio',
    'luxury barber lounge hot towel shave',
    'beard trim skin fade barbershop',
    'gentlemen grooming club barbers',
    'modern barber studio mens styling',
    'independent barbershop haircut',
    'downtown barbershop mens haircuts',
    'northside barbershop barbers',
    'southside barbershop barbers',
    'eastside barbershop barbers',
    'westside barbershop barbers',
    'central barbershop mens grooming',
    'classic barbers straight razor shave',
    'urban barbershop fade specialists',
    'premier mens hair studio barber',
    'neighborhood barber shop haircuts',
    'walk in barbershop mens hair',
    'executive mens grooming salon',
    'bespoke barber lounge',
    'signature barbershop hair design',
    'master barber shop studio',
    'uptown barbershop mens salon',
    'midtown barbershop mens haircuts',
    'vintage barbershop grooming',
  ],
  salon: [
    'hair salon beauty studio',
    'hairdresser styling color salon',
    'boutique hair lounge beauty bar',
    'womens hair salon blowout studio',
    'local hair stylist salon',
    'balayage hair color specialist salon',
    'luxury hair salon spa',
    'hair extensions keratin salon',
    'bridal hair styling beauty studio',
    'organic hair salon haircare',
    'downtown hair salon beauty',
    'northside hair salon stylists',
    'southside hair salon stylists',
    'eastside hair salon stylists',
    'westside hair salon stylists',
    'central hair studio hairdressers',
    'modern hair lounge color bar',
    'curly hair specialist salon',
    'premier beauty salon hair design',
    'blonde specialist hair studio',
    'blow dry bar hair styling lounge',
    'bespoke hair dressing salon',
    'uptown hair salon beauty bar',
    'midtown hair salon studio',
    'aveda concept hair salon',
    'collective hair studio stylists',
    'atelier hair salon beauty',
    'signature hair salon spa',
  ],
  dentist: [
    'dentist dental clinic',
    'family dentistry cosmetic dental',
    'dental office oral care center',
    'orthodontist dental studio',
    'implant and general dentist',
    'cosmetic dentistry veneers clinic',
    'emergency dentist dental care',
    'pediatric and family dental office',
    'invisalign orthodontics dental clinic',
    'holistic biological dentist',
    'sedation dentistry dental center',
    'periodontist gum & implant dental',
    'endodontist root canal dental clinic',
    'prosthodontist restorative dentistry',
    'downtown dentist dental practice',
    'northside dental clinic dentist',
    'southside dental clinic dentist',
    'eastside dental clinic dentist',
    'westside dental clinic dentist',
    'central dental care studio',
    'smile design dental clinic',
    'modern dental wellness studio',
    'premier dental group dentists',
    'comprehensive dentistry clinic',
    'gentle dental care office',
    'advanced dental implant center',
    'uptown dental studio dentist',
    'midtown dental clinic dentist',
  ],
  hvac: [
    'hvac heating cooling contractor',
    'air conditioning furnace repair',
    'heating ventilation ac service',
    'climate control mechanical hvac',
    'residential hvac installation repair',
    'commercial hvac mechanical contractor',
    'heat pump ac installation company',
    'ductless mini split hvac service',
    'furnace boiler heating repair',
    'indoor air quality ductwork hvac',
    'emergency ac repair heating company',
    'geothermal and high efficiency hvac',
    'air duct cleaning ventilation contractor',
    'downtown hvac heating air conditioning',
    'northside hvac heating cooling',
    'southside hvac heating cooling',
    'eastside hvac heating cooling',
    'westside hvac heating cooling',
    'central air conditioning heating service',
    'premier heating and cooling company',
    'reliable hvac technicians service',
    'home comfort heating air conditioning',
    'precision mechanical hvac services',
    'all season heating and cooling',
    'pro hvac air conditioning contractor',
    'refrigeration and hvac mechanical',
    'energy efficient heating cooling',
    'local ac and furnace specialists',
  ],
  gym: [
    'gym fitness center',
    'personal training strength studio',
    'crossfit athletic fitness club',
    'health club workout gym',
    'boutique fitness conditioning studio',
    'pilates reformer fitness studio',
    'boxing kickboxing fitness gym',
    '24 hour gym weight training',
    'functional fitness hiit studio',
    'powerlifting barbell strength gym',
    'yoga and movement fitness studio',
    'indoor cycling spin fitness studio',
    'athletic performance training center',
    'womens fitness gym training studio',
    'martial arts mma fitness gym',
    'downtown gym fitness studio',
    'northside gym fitness center',
    'southside gym fitness center',
    'eastside gym fitness center',
    'westside gym fitness center',
    'central health and fitness club',
    'private personal training gym',
    'group fitness bootcamp studio',
    'kettlebell and strength conditioning gym',
    'wellness and recovery fitness club',
    'calisthenics and strength studio',
    'uptown fitness studio gym',
    'midtown gym personal training',
  ],
  roofing: [
    'roofing contractor roofer',
    'roof repair replacement company',
    'commercial residential roofing services',
    'exterior siding gutter roofing',
    'local roofers storm repair',
    'metal roofing shingle installation',
    'flat roof commercial roofing contractor',
    'slate and tile roofing specialists',
    'roof leak repair inspection company',
    'hail storm damage roof restoration',
    'gutter guard and roofing company',
    'skylight and roof replacement contractor',
    'residential re-roofing specialists',
    'industrial epdm tpo roofing contractor',
    'downtown roofing contractor roofers',
    'northside roofing company roofers',
    'southside roofing company roofers',
    'eastside roofing company roofers',
    'westside roofing company roofers',
    'central roofing and exteriors',
    'premier roofing and construction',
    'certified master elite roofer',
    'heritage and custom roofing company',
    'all weather roofing contractors',
    'integrity roofing and gutter service',
    'precision roof repair contractors',
    'apex roofing and exterior remodeling',
    'summit roofing contractors',
  ],
  'real estate': [
    'real estate agency realtor',
    'property brokerage real estate group',
    'real estate agent team',
    'residential realty office',
    'luxury homes real estate broker',
    'commercial real estate brokerage',
    'property management and realty',
    'condo and townhome real estate agents',
    'relocation realtor real estate office',
    'investment property real estate group',
    'boutique real estate agency',
    'new construction homes realtor',
    'waterfront and estate realty',
    'first time buyer real estate team',
    'downtown real estate brokerage',
    'northside real estate agents',
    'southside real estate agents',
    'eastside real estate agents',
    'westside real estate agents',
    'central realty group realtors',
    'premier properties real estate',
    'executive realty associates',
    'signature homes real estate agency',
    'heritage real estate brokerage',
    'urban living real estate group',
    'metro realty property advisors',
    'uptown real estate office',
    'midtown real estate agency',
  ],
};

const CUSTOM_NICHE_QUADRANTS = [
  'downtown',
  'northside',
  'southside',
  'eastside',
  'westside',
  'central',
];

function getQueryVariantsForNiche(niche) {
  const key = String(niche || '').trim().toLowerCase();
  if (NICHE_PAGE_QUERIES[key]) return NICHE_PAGE_QUERIES[key];
  const base = String(niche || 'local business').trim();
  return CUSTOM_NICHE_QUADRANTS.map((quad) => `${quad} ${base}`);
}

function buildPageQuery({ niche, city, state, country, page = 1 }) {
  const key = String(niche || '').trim().toLowerCase();
  const locParts = [city, state, country].filter(Boolean);
  const locString = locParts.join(', ');

  // For custom/new niches, strictly use the reliable location quadrant keywords:
  // downtown [custom niche] [city], northside [custom niche] [city], etc.
  if (!NICHE_PAGE_QUERIES[key]) {
    const base = String(niche || 'local business').trim();
    const customVariants = CUSTOM_NICHE_QUADRANTS.map((quad) =>
      locString ? `${quad} ${base} ${locString}`.trim() : `${quad} ${base}`.trim()
    );
    return customVariants[(Math.max(1, page) - 1) % customVariants.length];
  }

  const variants = NICHE_PAGE_QUERIES[key];
  const phrase = variants[(Math.max(1, page) - 1) % variants.length];
  // Strictly search ONLY the user's input city (never substitute a different city)
  return `${phrase} in ${locString}`;
}

// Extract city from address components
function extractCity(addressComponents) {
  if (!Array.isArray(addressComponents)) return '';

  for (const typeName of ['locality', 'sublocality', 'postal_town', 'administrative_area_level_2']) {
    for (const component of addressComponents) {
      const types = component.types || [];
      if (types.includes(typeName)) {
        return component.longText || component.shortText || '';
      }
    }
  }
  return '';
}

async function searchPlacesLegacyFallback(query, apiKey, pageSize = 20) {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    const rawPlaces = (data.results || []).slice(0, Math.min(pageSize, 20));
    if (rawPlaces.length === 0) return [];

    const detailedPlaces = await Promise.all(
      rawPlaces.map(async (p) => {
        try {
          const dUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${p.place_id}&fields=name,website,formatted_phone_number,formatted_address,address_components&key=${apiKey}`;
          const dRes = await fetch(dUrl, { signal: AbortSignal.timeout(6000) });
          const dData = await dRes.json();
          const r = dData.result || {};
          return {
            id: p.place_id,
            displayName: { text: r.name || p.name },
            formattedAddress: r.formatted_address || p.formatted_address || '',
            nationalPhoneNumber: r.formatted_phone_number || '',
            websiteUri: r.website || '',
            addressComponents: r.address_components || [],
          };
        } catch {
          return {
            id: p.place_id,
            displayName: { text: p.name },
            formattedAddress: p.formatted_address || '',
            nationalPhoneNumber: '',
            websiteUri: '',
            addressComponents: [],
          };
        }
      })
    );
    return detailedPlaces;
  } catch (err) {
    console.warn('[placesApi] Legacy fallback notice:', err.message);
    return [];
  }
}

// Single-call Google Places Text Search that returns websiteUri + phone directly
export async function searchPlaces(query, apiKey, pageSize = 20, locationCoords = null) {
  const effectiveKey = apiKey || googleMaps.apiKey || process.env.GOOGLE_MAPS_API_KEY;
  if (!effectiveKey) {
    throw new Error('Google Places API key not configured');
  }

  const body = {
    textQuery: query,
    pageSize: Math.min(Math.max(1, pageSize), 20),
  };

  if (
    locationCoords &&
    typeof locationCoords.lat === 'number' &&
    typeof locationCoords.lon === 'number' &&
    !Number.isNaN(locationCoords.lat) &&
    !Number.isNaN(locationCoords.lon)
  ) {
    body.locationBias = {
      circle: {
        center: { latitude: locationCoords.lat, longitude: locationCoords.lon },
        radius: 25000,
      },
    };
  }

  let response;
  try {
    response = await fetch(PLACES_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': effectiveKey,
        'X-Goog-FieldMask': FIELD_MASK,
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch (netErr) {
    console.warn('[placesApi] SearchText request notice, engaging fallback:', netErr.message);
    return await searchPlacesLegacyFallback(query, effectiveKey, pageSize);
  }

  if (!response.ok) {
    // 429 quota, rate limits, or service error -> seamless fallback to Places API
    console.warn(`[placesApi] SearchText returned status ${response.status}, engaging resilient fallback...`);
    const fallbackResults = await searchPlacesLegacyFallback(query, effectiveKey, pageSize);
    if (fallbackResults.length > 0) return fallbackResults;
    const error = await response.json().catch(() => ({}));
    throw new Error(`Places API error: ${error.error?.message || response.status}`);
  }

  const data = await response.json();
  return data.places || [];
}

const NICHE_NEARBY_TYPES = {
  barber: ['barber_shop', 'hair_care', 'beauty_salon'],
  salon: ['beauty_salon', 'hair_care', 'spa'],
  dentist: ['dentist', 'dental_clinic'],
  hvac: ['plumber', 'electrician', 'roofing_contractor', 'general_contractor'],
  gym: ['gym', 'fitness_center', 'sports_complex'],
  roofing: ['roofing_contractor', 'general_contractor'],
  realestate: ['real_estate_agency'],
};

function getNearbyTypesForNiche(niche) {
  const key = String(niche || '').trim().toLowerCase();
  if (NICHE_NEARBY_TYPES[key]) return NICHE_NEARBY_TYPES[key];
  if (key.includes('dent')) return ['dentist', 'dental_clinic'];
  if (key.includes('barber')) return ['barber_shop', 'hair_care'];
  if (key.includes('salon') || key.includes('hair') || key.includes('beauty')) return ['beauty_salon', 'hair_care', 'spa'];
  if (key.includes('gym') || key.includes('fit') || key.includes('train')) return ['gym', 'fitness_center'];
  if (key.includes('roof')) return ['roofing_contractor', 'general_contractor'];
  if (key.includes('real') || key.includes('estate') || key.includes('realt')) return ['real_estate_agency'];
  if (key.includes('plumb')) return ['plumber'];
  if (key.includes('electr')) return ['electrician'];
  if (key.includes('law') || key.includes('attorney')) return ['lawyer'];
  if (key.includes('clean')) return ['laundry'];
  if (key.includes('auto') || key.includes('mechanic')) return ['car_repair'];
  if (key.includes('pet') || key.includes('vet')) return ['veterinary_care'];
  return ['point_of_interest'];
}

export async function resolveCityCoordinates(city, apiKey) {
  if (!city || typeof city !== 'string') return null;
  const cleanCity = city.trim();

  // 1. Try local GeoNames / Canada database exact match
  const cityInfo = lookupCity(cleanCity);
  if (cityInfo?.lat && cityInfo?.lon) {
    return {
      lat: cityInfo.lat,
      lon: cityInfo.lon,
      resolvedName: cityInfo.city,
      country: cityInfo.country,
      state: cityInfo.state,
    };
  }

  // 2. Try city suggestions from fuzzy / prefix matching (e.g. 'calagry' -> 'Calgary')
  if (cityInfo?.suggestions?.length > 0) {
    const top = cityInfo.suggestions[0];
    if (typeof top.lat === 'number' && typeof top.lon === 'number') {
      return {
        lat: top.lat,
        lon: top.lon,
        resolvedName: top.name,
        country: top.country,
        state: top.admin,
      };
    }
  }

  // 3. Fallback to Google Geocoding API if API key is present
  const effectiveKey = apiKey || googleMaps.apiKey || process.env.GOOGLE_MAPS_API_KEY;
  if (effectiveKey) {
    try {
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cleanCity)}&key=${effectiveKey}`;
      const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(4000) });
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData.results?.length > 0) {
          const loc = geoData.results[0].geometry?.location;
          if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
            return {
              lat: loc.lat,
              lon: loc.lng,
              resolvedName: geoData.results[0].formatted_address,
            };
          }
        }
      }
    } catch (geoErr) {
      console.warn('[placesApi] Geocoding fallback notice:', geoErr.message);
    }
  }

  return null;
}

export async function searchNearbyPlacesFallback({
  niche,
  city,
  state,
  country,
  lat,
  lon,
  page = 1,
  apiKey,
}) {
  const effectiveKey = apiKey || googleMaps.apiKey || process.env.GOOGLE_MAPS_API_KEY;
  if (!effectiveKey) return [];

  let centerLat = lat;
  let centerLon = lon;
  if (
    typeof centerLat !== 'number' ||
    typeof centerLon !== 'number' ||
    Number.isNaN(centerLat) ||
    Number.isNaN(centerLon)
  ) {
    const resolved = await resolveCityCoordinates(city, effectiveKey);
    if (resolved) {
      centerLat = resolved.lat;
      centerLon = resolved.lon;
    }
  }

  if (typeof centerLat !== 'number' || typeof centerLon !== 'number') {
    return [];
  }

  const typesPool = getNearbyTypesForNiche(niche);
  const typeIndex = (Math.max(1, page) - 1) % typesPool.length;
  const includedTypes = [typesPool[typeIndex]];

  const QUADRANT_OFFSETS = [
    { dLat: 0, dLon: 0 },
    { dLat: 0.038, dLon: 0 },
    { dLat: -0.038, dLon: 0 },
    { dLat: 0, dLon: 0.048 },
    { dLat: 0, dLon: -0.048 },
    { dLat: 0.028, dLon: 0.036 },
    { dLat: -0.028, dLon: -0.036 },
    { dLat: 0.028, dLon: -0.036 },
    { dLat: -0.028, dLon: 0.036 },
  ];

  const offset = QUADRANT_OFFSETS[(Math.max(1, page) - 1) % QUADRANT_OFFSETS.length];
  const queryLat = centerLat + offset.dLat;
  const queryLon = centerLon + offset.dLon;

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': effectiveKey,
        'X-Goog-FieldMask': FIELD_MASK,
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
      },
      body: JSON.stringify({
        includedTypes,
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: queryLat, longitude: queryLon },
            radius: 12000.0,
          },
        },
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[placesApi] searchNearby returned ${res.status}`);
      return [];
    }

    const data = await res.json();
    return data.places || [];
  } catch (err) {
    console.warn('[placesApi] searchNearby error:', err.message);
    return [];
  }
}

// Fast single-call Places discovery for Auto Email Sender
export async function searchPlacesForEmailDiscovery({
  niche,
  city,
  state,
  country,
  lat,
  lon,
  page = 1,
  apiKey,
}) {
  const effectiveKey = apiKey || googleMaps.apiKey || process.env.GOOGLE_MAPS_API_KEY;
  if (!effectiveKey) {
    throw new Error('Google Places API key not configured');
  }

  let resolvedLat = lat;
  let resolvedLon = lon;
  let resolvedCityName = city;

  if (
    typeof resolvedLat !== 'number' ||
    typeof resolvedLon !== 'number' ||
    Number.isNaN(resolvedLat) ||
    Number.isNaN(resolvedLon)
  ) {
    const resolved = await resolveCityCoordinates(city, effectiveKey);
    if (resolved) {
      resolvedLat = resolved.lat;
      resolvedLon = resolved.lon;
      if (resolved.resolvedName) {
        resolvedCityName = resolved.resolvedName;
      }
    }
  }

  const textQuery = buildPageQuery({ niche, city: resolvedCityName, state, country, page });
  let places = [];
  try {
    places = await searchPlaces(
      textQuery,
      effectiveKey,
      20,
      typeof resolvedLat === 'number' && typeof resolvedLon === 'number'
        ? { lat: resolvedLat, lon: resolvedLon }
        : null
    );
  } catch (err) {
    console.warn(`[placesApi] Primary text search failed (${err.message}), falling back to searchNearby...`);
  }

  if (!places || places.length === 0) {
    places = await searchNearbyPlacesFallback({
      niche,
      city: resolvedCityName,
      state,
      country,
      lat: resolvedLat,
      lon: resolvedLon,
      page,
      apiKey: effectiveKey,
    });
  }

  const candidates = [];
  const candidatesWithoutWebsite = [];
  for (const place of places) {
    const name = (place.displayName?.text || '').trim();
    if (!name) continue;
    const website = (place.websiteUri || '').trim();
    // Keep any lead Google Places returns for the searched city query,
    // even if Google's address components list an adjacent locality/suburb.
    const resolvedCity = extractCity(place.addressComponents) || city;

    if (!website || isSkippableSocialOrAggregatorUrl(website)) {
      candidatesWithoutWebsite.push({
        placeId: place.id,
        business_name: name,
        phone: place.nationalPhoneNumber || place.internationalPhoneNumber || '',
        address: place.formattedAddress || '',
        city: resolvedCity,
        maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${place.formattedAddress || resolvedCity}`)}`,
        reason: !website
          ? 'Google Maps profile has no website link listed'
          : 'Google Maps profile only links to social media / booking aggregator',
        status: 'no_website',
      });
      continue;
    }

    candidates.push({
      placeId: place.id,
      name,
      business_name: name,
      phone: place.nationalPhoneNumber || place.internationalPhoneNumber || '',
      website,
      rootDomain: extractNormalizedDomain(website),
      address: place.formattedAddress || '',
      city: resolvedCity,
      state: state || undefined,
      source_query: textQuery,
      source_page: page,
    });
  }

  return {
    query: textQuery,
    totalPlacesReturned: places.length,
    candidatesWithWebsite: candidates,
    candidatesWithoutWebsite,
  };
}

function normalizeCityKey(city, state, country) {
  return [city, state, country]
    .map((p) => String(p || '').trim().toLowerCase())
    .filter(Boolean)
    .join('|');
}

function normalizeNicheKey(niche) {
  return String(niche || 'local business').trim().toLowerCase();
}

function getCachedPlaceRows(cityKey, nicheKey) {
  try {
    const cutoff = Date.now() - CACHE_TTL_MS;
    return db
      .prepare(
        `SELECT * FROM places_lead_cache
         WHERE searched_city_norm = ? AND niche_norm = ? AND updated_at >= ?
         ORDER BY source_page ASC, updated_at DESC`
      )
      .all(cityKey, nicheKey, cutoff);
  } catch {
    return [];
  }
}

function saveBatchToPlaceCache(cityKey, nicheKey, candidatesWithWebsite, discoveredLeads) {
  try {
    const now = Date.now();
    const byPlaceId = new Map();
    const byDomain = new Map();
    for (const d of discoveredLeads || []) {
      if (d.placeId) byPlaceId.set(d.placeId, d);
      const dom = extractNormalizedDomain(d.website);
      if (dom) byDomain.set(dom, d);
    }

    const upsert = db.prepare(`
      INSERT INTO places_lead_cache (
        searched_city_norm, niche_norm, place_id, business_name, resolved_city, state,
        phone, website, root_domain, email, email_host, discovery_method,
        source_query, source_page, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(searched_city_norm, niche_norm, place_id) DO UPDATE SET
        business_name = excluded.business_name,
        phone = excluded.phone,
        website = excluded.website,
        root_domain = excluded.root_domain,
        email = COALESCE(excluded.email, places_lead_cache.email),
        email_host = COALESCE(excluded.email_host, places_lead_cache.email_host),
        discovery_method = COALESCE(excluded.discovery_method, places_lead_cache.discovery_method),
        updated_at = excluded.updated_at
    `);

    const txn = db.transaction((items) => {
      for (const c of items) {
        const placeId = c.placeId || c.rootDomain || c.website;
        if (!placeId) continue;
        const match = byPlaceId.get(c.placeId) || byDomain.get(c.rootDomain);
        const email = match?.email ? String(match.email).trim().toLowerCase() : null;
        const emailHost = email && email.includes('@') ? email.split('@')[1] : null;
        upsert.run(
          cityKey,
          nicheKey,
          String(placeId),
          c.business_name || c.name || 'Local Business',
          c.city || '',
          c.state || '',
          c.phone || '',
          c.website || '',
          c.rootDomain || extractNormalizedDomain(c.website),
          email,
          emailHost,
          match?.discovery_method || null,
          c.source_query || '',
          Number(c.source_page) || 1,
          now
        );
      }
    });
    txn(candidatesWithWebsite || []);
  } catch (err) {
    console.warn('[placesApi] saveBatchToPlaceCache notice:', err.message);
  }
}

/**
 * Multi-batch, single-city email discovery engine with:
 * - Global 30-day SQLite lead cache (places_lead_cache)
 * - 3-layer deduplication (place_id, root domain hostname, and email address)
 * - Strict single-city search queries (never intentionally searches another city,
 *   while keeping all leads returned by Google Places)
 * - Condition 2 Regional Exhaustion Circuit Breaker: stops immediately when 3
 *   consecutive Google Places batches yield < 2 new unique websites (>90% duplicate rate)
 *   or when 0 businesses exist on query 1.
 */
export async function discoverEmailsForTargetVolume({
  niche = 'Barber',
  city,
  state = '',
  country = '',
  lat,
  lon,
  targetCount = 10,
  startPage = 1,
  seenEmails = [],
  discoverEmailsInParallel,
  signal = null,
  maxDurationMs = 0,
}) {
  const variants = getQueryVariantsForNiche(niche);
  const maxPages = Math.max(variants.length, 25);
  const cityKey = normalizeCityKey(city, state, country);
  const nicheKey = normalizeNicheKey(niche);

  const loopCtrl = new AbortController();
  let batchTimedOut = false;
  let deadlineTimer = null;
  const onParentAbort = () => loopCtrl.abort();
  if (signal) {
    if (signal.aborted) loopCtrl.abort();
    else signal.addEventListener('abort', onParentAbort, { once: true });
  }
  const deadlineAt = maxDurationMs > 0 ? Date.now() + maxDurationMs : 0;
  if (maxDurationMs > 0) {
    deadlineTimer = setTimeout(() => {
      batchTimedOut = true;
      loopCtrl.abort();
    }, maxDurationMs);
  }

  const seenEmailSet = new Set(
    (Array.isArray(seenEmails) ? seenEmails : [])
      .map((e) => String(e || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const seenPlaceIds = new Set();
  const seenDomains = new Set();

  const foundLeads = [];
  const allCrawledWithEmail = [];
  const allCrawledWithoutEmail = [];
  const allMapsWithoutWebsite = [];

  let currentPage = Math.max(1, Number(startPage) || 1);
  let totalSearchesMade = 0;
  let totalPlacesReturned = 0;
  let totalDuplicatesFiltered = 0;
  let consecutiveErrors = 0;
  const searchBatchHistory = [];
  let consecutiveLowYieldBatches = 0;
  let lastQuery = `${niche} in ${city}`;

  try {
    //Step 1: On initial run (startPage === 1), check the 30-day global cache first
    // so repeated or overlapping city searches return cached leads at $0 Google Places API cost.
    // Only mark seenPlaceIds/seenDomains for rows that actually have a discovered email so
    // sites that previously timed out or had no email are not permanently skipped.
    if (currentPage === 1) {
      const cachedRows = getCachedPlaceRows(cityKey, nicheKey);
      for (const row of cachedRows) {
        if (row.email) {
          if (row.place_id) seenPlaceIds.add(row.place_id);
          if (row.root_domain) seenDomains.add(row.root_domain);
          const lowerEmail = String(row.email).trim().toLowerCase();
          if (!seenEmailSet.has(lowerEmail)) {
            seenEmailSet.add(lowerEmail);
            const leadObj = {
              placeId: row.place_id,
              business_name: row.business_name,
              name: row.business_name,
              email: lowerEmail,
              email_host: row.email_host || lowerEmail.split('@')[1] || '',
              phone: row.phone || '',
              website: row.website || '',
              discovery_method: row.discovery_method || 'page_text',
              city: row.resolved_city || city,
              state: row.state || state || undefined,
              source_query: row.source_query || `${niche} in ${city}`,
              source_page: row.source_page || 1,
              source_rank: foundLeads.length + 1,
              slug: slugify(row.business_name, row.resolved_city || city),
            };
            foundLeads.push(leadObj);
            allCrawledWithEmail.push({
              business_name: leadObj.business_name,
              website: leadObj.website,
              email: leadObj.email,
              phone: leadObj.phone,
              method: leadObj.discovery_method,
              status: 'email_found',
            });
            if (foundLeads.length >= targetCount) {
              break;
            }
          }
        }
      }
    }

    let completionStatus = 'in_progress';
    let completionMessage = '';

    if (foundLeads.length >= targetCount) {
      completionStatus = 'target_reached';
      completionMessage = `Target reached: Found ${foundLeads.length} emails in ${city}.`;
    } else {
      // Step 2: Walk intra-city query variations for the user's exact city until targetCount is reached
      // or Market Saturation (>= 40% duplicate businesses in batch) triggers an immediate stop.
      while (foundLeads.length < targetCount && currentPage <= maxPages) {
        if (loopCtrl.signal.aborted || (deadlineAt > 0 && Date.now() >= deadlineAt)) {
          if (deadlineAt > 0 && Date.now() >= deadlineAt) batchTimedOut = true;
          break;
        }
        let placesResult = null;
        try {
          placesResult = await searchPlacesForEmailDiscovery({
            niche,
            city,
            state,
            country,
            lat,
            lon,
            page: currentPage,
          });
          consecutiveErrors = 0;
        } catch (err) {
          console.warn(`[placesApi] Page ${currentPage} notice for ${city}:`, err.message);
          consecutiveErrors += 1;
          currentPage += 1;
          if (consecutiveErrors >= 2) break;
          continue;
        }

        totalSearchesMade += 1;
        lastQuery = placesResult?.query || lastQuery;
        const batchPlacesCount = Number(placesResult?.totalPlacesReturned || 0);
        totalPlacesReturned += batchPlacesCount;

        for (const noWeb of placesResult?.candidatesWithoutWebsite || []) {
          allMapsWithoutWebsite.push(noWeb);
        }

        // Small-Town Zero-Result Guard on first query
        if (totalSearchesMade === 1 && currentPage === 1 && batchPlacesCount === 0 && foundLeads.length === 0) {
          completionStatus = 'no_businesses_found';
          completionMessage = `No ${niche} businesses with websites were found in ${city} on Google Maps. 0 credits charged.`;
          searchBatchHistory.push({
            batchNumber: totalSearchesMade,
            page: currentPage,
            query: lastQuery,
            placesReturned: 0,
            duplicatesFiltered: 0,
            duplicateRate: 0,
            newUniqueWebsites: 0,
            emailsFound: 0,
            noWebsiteCount: (placesResult?.candidatesWithoutWebsite || []).length,
            stoppedDueToSaturation: false,
          });
          currentPage += 1;
          break;
        }

        // Filter batch through Layer 1 (placeId) and Layer 2 (normalized root domain) deduplication
        const newUniqueCandidates = [];
        let batchDuplicates = 0;
        const candidatesInThisBatch = placesResult?.candidatesWithWebsite || [];
        const totalBatchCandidates = candidatesInThisBatch.length;

        for (const cand of candidatesInThisBatch) {
          const pid = cand.placeId || '';
          const dom = cand.rootDomain || extractNormalizedDomain(cand.website);
          if ((pid && seenPlaceIds.has(pid)) || (dom && seenDomains.has(dom))) {
            batchDuplicates += 1;
            continue;
          }
          if (pid) seenPlaceIds.add(pid);
          if (dom) seenDomains.add(dom);
          newUniqueCandidates.push(cand);
        }
        totalDuplicatesFiltered += batchDuplicates;

        // Duplication Rate Circuit Breaker:
        // Strictly follows the rule: Only trigger if search > 1 AND Google returns 8 or more duplicates out of ~20 (>= 40% duplicates)
        const duplicateRate = batchPlacesCount > 0 ? (batchDuplicates / batchPlacesCount) : (totalBatchCandidates > 0 ? batchDuplicates / totalBatchCandidates : 0);
        const duplicatePercent = Math.round(duplicateRate * 100);
        const isSaturated = totalSearchesMade > 1 && batchDuplicates >= 8 && duplicateRate >= 0.40;

        // Track low-yield streak (< 2 new unique websites)
        if (newUniqueCandidates.length < 2) {
          consecutiveLowYieldBatches += 1;
        } else {
          consecutiveLowYieldBatches = 0;
        }

        let emailsFoundInThisBatch = 0;
        // Crawl the new unique candidate websites using the existing high-speed scraper
        if (newUniqueCandidates.length > 0 && typeof discoverEmailsInParallel === 'function' && !loopCtrl.signal.aborted) {
          const discoveredBatch = await discoverEmailsInParallel(newUniqueCandidates, {
            concurrency: 8,
            timeoutMs: 4500,
            signal: loopCtrl.signal,
          });

          // Persist crawled batch (both with and without email) to global cache
          saveBatchToPlaceCache(cityKey, nicheKey, newUniqueCandidates, discoveredBatch);

          for (const d of discoveredBatch) {
            if (foundLeads.length >= targetCount) break;
            const lowerEmail = String(d.email || '').trim().toLowerCase();
            if (!lowerEmail || seenEmailSet.has(lowerEmail)) continue;
            seenEmailSet.add(lowerEmail);
            emailsFoundInThisBatch += 1;

            const leadObj = {
              ...d,
              email: lowerEmail,
              email_host: lowerEmail.split('@')[1] || '',
              source_page: currentPage,
              source_rank: foundLeads.length + 1,
              slug: slugify(d.business_name || d.name || 'business', d.city || city),
            };
            foundLeads.push(leadObj);
            allCrawledWithEmail.push({
              business_name: leadObj.business_name,
              website: leadObj.website,
              email: leadObj.email,
              phone: leadObj.phone || '',
              method: leadObj.discovery_method || 'page_text',
              status: 'email_found',
            });
          }

          for (const c of newUniqueCandidates) {
            const matched = discoveredBatch.some(
              (d) => (d.placeId && d.placeId === c.placeId) || d.website === c.website
            );
            if (!matched) {
              allCrawledWithoutEmail.push({
                business_name: c.business_name || c.name,
                website: c.website,
                reason: 'No public email listed on website (contact form only)',
                status: 'no_email',
              });
            }
          }
        }

        searchBatchHistory.push({
          batchNumber: totalSearchesMade,
          page: currentPage,
          query: placesResult?.query || lastQuery,
          placesReturned: batchPlacesCount,
          duplicatesFiltered: batchDuplicates,
          duplicateRate: duplicatePercent,
          newUniqueWebsites: newUniqueCandidates.length,
          emailsFound: emailsFoundInThisBatch,
          noWebsiteCount: (placesResult?.candidatesWithoutWebsite || []).length,
          stoppedDueToSaturation: isSaturated,
        });

        currentPage += 1;

        // Priority Stop 1: Target email volume reached
        if (foundLeads.length >= targetCount) {
          completionStatus = 'target_reached';
          completionMessage = `Target reached: Found ${ Math.min(foundLeads.length, targetCount) } emails in ${city}.`;
          break;
        }

        // Priority Stop 2: User-commanded 40% duplicate immediate-stop circuit breaker
        if (isSaturated) {
          completionStatus = foundLeads.length > 0 ? 'region_exhausted' : 'no_businesses_found';
          completionMessage =
            foundLeads.length > 0
              ? `COMPLETED (Market Saturated: Google Places returned ${duplicatePercent}% duplicate businesses in ${city}. Found all ${foundLeads.length} available emails). Unused reserved credits have been automatically refunded.`
              : `No ${niche} businesses with public emails were found in ${city}. 100% of reserved credits refunded.`;
          break;
        }

        // Priority Stop 3: 3 consecutive low-yield batches (< 2 new sites)
        if (consecutiveLowYieldBatches >= 3) {
          completionStatus = foundLeads.length > 0 ? 'region_exhausted' : 'no_businesses_found';
          completionMessage =
            foundLeads.length > 0
              ? `COMPLETED (Region Exhausted: Found all ${foundLeads.length} emails available in ${city}). Unused reserved credits have been automatically refunded.`
              : `No ${niche} businesses with public emails were found in ${city}. 100% of reserved credits refunded.`;
          break;
        }

        if (batchTimedOut || loopCtrl.signal.aborted || (deadlineAt > 0 && Date.now() >= deadlineAt)) {
          if (deadlineAt > 0 && Date.now() >= deadlineAt) batchTimedOut = true;
          break;
        }
      }

      if (completionStatus === 'in_progress') {
        if (foundLeads.length >= targetCount) {
          completionStatus = 'target_reached';
          completionMessage = `Target reached: Found ${Math.min(foundLeads.length, targetCount)} emails in ${city}.`;
        } else if (currentPage > maxPages) {
          completionStatus = foundLeads.length > 0 ? 'region_exhausted' : 'no_businesses_found';
          completionMessage =
            foundLeads.length > 0
              ? `COMPLETED (Region Exhausted: Found all ${foundLeads.length} emails available in ${city}). Unused reserved credits have been automatically refunded.`
              : `No ${niche} businesses with public emails were found in ${city}. 100% of reserved credits refunded.`;
        } else if (batchTimedOut) {
          completionStatus = 'partial_batch';
        }
      }
    }

    const trimmedLeads = foundLeads.slice(0, targetCount);
    const isRegionExhausted =
      completionStatus === 'region_exhausted' ||
      completionStatus === 'no_businesses_found' ||
      currentPage > maxPages;

    return {
      leads: trimmedLeads,
      done: isRegionExhausted,
      partial: Boolean(batchTimedOut && !isRegionExhausted && trimmedLeads.length < targetCount),
      completionStatus,
      completionMessage,
      nextPage: currentPage,
      telemetry: {
        totalSearchesMade,
        placesReturnedPerSearch: totalPlacesReturned,
        totalDuplicatesFiltered,
        searches: searchBatchHistory,
        crawledWithEmail: allCrawledWithEmail.slice(0, targetCount),
        crawledWithoutEmail: allCrawledWithoutEmail,
        mapsWithoutWebsite: allMapsWithoutWebsite,
        query: lastQuery,
        timestamp: new Date().toLocaleTimeString(),
      },
    };
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (signal) signal.removeEventListener('abort', onParentAbort);
  }
}

// Get place details for a specific place (legacy helper)
export async function getPlaceDetails(placeId, apiKey) {
  const effectiveKey = apiKey || googleMaps.apiKey || process.env.GOOGLE_MAPS_API_KEY;
  if (!effectiveKey) {
    throw new Error('Google Places API key not configured');
  }

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}?key=${effectiveKey}&fields=displayName,formattedAddress,nationalPhoneNumber,websiteUri,addressComponents`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Places API error: ${error.error?.message || response.status}`);
  }

  return await response.json();
}

// Main discovery function - finds businesses with websites
export async function discoverLeadsFromPlaces(params, apiKey, onProgress) {
  const { city, state, country, lat, lon, niche, limit = 20, page = 1 } = params;
  const effectiveKey = apiKey || googleMaps.apiKey || process.env.GOOGLE_MAPS_API_KEY;

  if (onProgress) {
    onProgress({ current: 0, total: limit, found: 0, currentName: 'Searching Google Places...' });
  }

  const { candidatesWithWebsite } = await searchPlacesForEmailDiscovery({
    niche,
    city,
    state,
    country,
    lat,
    lon,
    page,
    apiKey: effectiveKey,
  });

  const sliced = candidatesWithWebsite.slice(0, limit);

  if (onProgress) {
    onProgress({
      current: sliced.length,
      total: limit,
      found: sliced.length,
      currentName: 'Complete',
    });
  }

  return sliced;
}

// Store discovered leads in the campaign
export function storeDiscoveredLeads(campaignId, leads) {
  let count = 0;

  for (const lead of leads) {
    try {
      addEmailLead({
        campaignId,
        businessName: lead.name || lead.business_name,
        phone: lead.phone,
        city: lead.city,
        website: lead.website,
        email: lead.email || '',
        emailSource: lead.email_source || 'places_api',
        verificationStatus: lead.mx_verified ? 'verified' : 'pending',
        slug: slugify(lead.name || lead.business_name, lead.city),
      });
      count++;
    } catch (err) {
      console.error(`[placesApi] Failed to store lead ${lead.name}: ${err.message}`);
    }
  }

  return count;
}

function slugify(name, city) {
  const base = `${name} ${city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base.slice(0, 50);
}
