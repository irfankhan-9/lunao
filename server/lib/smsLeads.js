// smsLeads.js
//
// SMS Lead Discovery — Google Places API for Lunao's SMS campaigns.
//
// Shares the Email Campaign's exact Google Places discovery architecture:
//   1. Built-in site niches use 15-28 curated intra-city sub-niche & directional
//      keywords (1 single Places API call per keyword step, stopping immediately
//      once targetLimit is reached).
//   2. Custom user-created niches use directional city queries (North, South,
//      East, West, Downtown, Central, etc.).
//   3. Automatic seamless fallback from Places Text Search (v1/places:searchText)
//      to Places Nearby Search (v1/places:searchNearby) with directional quadrant
//      offsets if Text Search hits HTTP 429 daily quota.
//   4. 40% / 8-duplicate saturation circuit breaker immediately halts the entire
//      discovery session and marks all available leads found in that city.
//   5. Filters by country=CA only when explicitly requested by the caller
//      (Free Plan Canada-only mode).

import { lookupCity } from './cities.js';

const PLACES_API_BASE = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_NEARBY_BASE = 'https://places.googleapis.com/v1/places:searchNearby';
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.addressComponents';

// Cache whether searchText is currently 429 quota-limited for 5 minutes so we don't waste calls
let searchTextQuotaBlockedUntil = 0;

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

// 15-28 rich intra-city sub-niche & directional query variations per built-in niche
// (Synchronized with Email Campaign's NICHE_PAGE_QUERIES in placesApi.js)
export const NICHE_PAGE_QUERIES = {
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
    'periodontist gum and implant dental',
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
  plumber: [
    'plumber plumbing service',
    'plumbing contractor drain cleaning',
    'emergency plumber water heater repair',
    'residential plumbing repair company',
    'commercial plumbing mechanical contractor',
    'sewer line and drain cleaning plumber',
    'leak detection pipe repair plumber',
    'tankless water heater installation plumber',
    'bathroom kitchen remodeling plumber',
    'hydro jetting rooter plumbing service',
    'downtown plumber plumbing contractor',
    'northside plumber plumbing service',
    'southside plumber plumbing service',
    'eastside plumber plumbing service',
    'westside plumber plumbing service',
  ],
  electrician: [
    'electrician electrical contractor',
    'residential electrical repair service',
    'commercial electrician wiring contractor',
    'licensed master electrician company',
    'emergency electrician panel upgrade',
    'lighting installation electrical service',
    'ev charger generator installation electrician',
    'circuit breaker rewiring electrician',
    'smart home automation electrical contractor',
    'industrial electrical maintenance company',
    'downtown electrician electrical service',
    'northside electrician electrical contractor',
    'southside electrician electrical contractor',
    'eastside electrician electrical contractor',
    'westside electrician electrical contractor',
  ],
  restaurant: [
    'restaurant dining bistro',
    'local family restaurant eatery',
    'steakhouse grill restaurant',
    'italian pasta trattoria restaurant',
    'mexican taco cantina restaurant',
    'seafood kitchen oyster bar restaurant',
    'asian fusion sushi thai restaurant',
    'american gastropub kitchen bar',
    'mediterranean grill restaurant',
    'bbq smokehouse restaurant',
    'downtown restaurant dining lounge',
    'northside restaurant eatery',
    'southside restaurant eatery',
    'eastside restaurant eatery',
    'westside restaurant eatery',
  ],
  cafe: [
    'cafe coffee shop',
    'specialty coffee roasters espresso bar',
    'artisan bakery cafe breakfast',
    'local coffee house tea lounge',
    'brunch cafe patisserie',
    'organic coffee bar smoothie cafe',
    'dessert cafe pastry shop',
    'matcha and espresso coffee studio',
    'neighborhood coffee shop cafe',
    'bistro cafe lunch spot',
    'downtown cafe coffee shop',
    'northside cafe coffee house',
    'southside cafe coffee house',
    'eastside cafe coffee house',
    'westside cafe coffee house',
  ],
  'auto repair': [
    'auto repair mechanic shop',
    'car service center brake repair',
    'automotive transmission engine repair',
    'oil change tire alignment auto shop',
    'foreign and domestic auto mechanic',
    'collision auto body repair shop',
    'european import auto repair specialist',
    'auto electrical ac diagnostic mechanic',
    'fleet truck and auto repair service',
    'certified master auto technician shop',
    'downtown auto repair mechanic',
    'northside auto repair car service',
    'southside auto repair car service',
    'eastside auto repair car service',
    'westside auto repair car service',
  ],
  landscaping: [
    'landscaping lawn care service',
    'landscape design hardscaping contractor',
    'lawn maintenance mowing company',
    'tree service trimming landscaping',
    'irrigation sprinkler landscape installation',
    'outdoor living patio paver contractor',
    'commercial groundskeeping lawn service',
    'sod installation garden design company',
    'retaining wall and landscape construction',
    'seasonal yard cleanup mulching service',
    'downtown landscaping lawn care',
    'northside landscaping contractor',
    'southside landscaping contractor',
    'eastside landscaping contractor',
    'westside landscaping contractor',
  ],
  cleaning: [
    'house cleaning maid service',
    'residential home cleaning company',
    'commercial janitorial office cleaning',
    'deep cleaning move out cleaning service',
    'carpet upholstery steam cleaning',
    'eco friendly green house cleaning',
    'post construction cleaning contractors',
    'airbnb vacation rental cleaning service',
    'window and pressure washing cleaning',
    'professional housekeeping maid agency',
    'downtown house cleaning service',
    'northside house cleaning maids',
    'southside house cleaning maids',
    'eastside house cleaning maids',
    'westside house cleaning maids',
  ],
};

// Backwards-compatible export alias
export const SMS_NICHE_SEARCH_TERMS = {
  'Barber': NICHE_PAGE_QUERIES.barber,
  'Salon': NICHE_PAGE_QUERIES.salon,
  'Dentist': NICHE_PAGE_QUERIES.dentist,
  'HVAC': NICHE_PAGE_QUERIES.hvac,
  'Gym': NICHE_PAGE_QUERIES.gym,
  'Roofing': NICHE_PAGE_QUERIES.roofing,
  'Real Estate': NICHE_PAGE_QUERIES['real estate'],
  'Plumber': NICHE_PAGE_QUERIES.plumber,
  'Electrician': NICHE_PAGE_QUERIES.electrician,
  'Restaurant': NICHE_PAGE_QUERIES.restaurant,
  'Cafe': NICHE_PAGE_QUERIES.cafe,
  'Auto Repair': NICHE_PAGE_QUERIES['auto repair'],
  'Landscaping': NICHE_PAGE_QUERIES.landscaping,
  'Cleaning': NICHE_PAGE_QUERIES.cleaning,
};

// Directional prefixes for custom user-made niches (e.g. North [City], South [City], etc.)
export const CUSTOM_NICHE_DIRECTIONS = [
  '',
  'North',
  'South',
  'East',
  'West',
  'Downtown',
  'Central',
  'Uptown',
  'Midtown',
];

export function isBuiltInNiche(niche) {
  const key = String(niche || '').trim().toLowerCase();
  return Boolean(NICHE_PAGE_QUERIES[key]);
}

export function buildQueriesForNicheAndCity(niche, locationLabel) {
  const rawNiche = String(niche || 'Barber').trim();
  const key = rawNiche.toLowerCase();
  const builtInList = NICHE_PAGE_QUERIES[key];

  if (Array.isArray(builtInList) && builtInList.length > 0) {
    return {
      isCustomNiche: false,
      queries: builtInList.map(function(term) {
        return term + ' in ' + locationLabel;
      }),
    };
  }

  // Custom user-created niche: use directional city prefixes (North [City], South [City], etc.)
  const customQueries = CUSTOM_NICHE_DIRECTIONS.map(function(dir) {
    if (!dir) {
      return rawNiche + ' in ' + locationLabel;
    }
    return rawNiche + ' in ' + dir + ' ' + locationLabel;
  });

  return {
    isCustomNiche: true,
    queries: customQueries,
  };
}

// =============================================================================
// Nearby Search Fallback (Matches Email Campaign's placesApi.js)
// =============================================================================

const NICHE_NEARBY_TYPES = {
  barber: ['barber_shop', 'hair_care', 'beauty_salon'],
  salon: ['beauty_salon', 'hair_care', 'spa'],
  dentist: ['dentist', 'dental_clinic'],
  hvac: ['plumber', 'electrician', 'roofing_contractor', 'general_contractor'],
  gym: ['gym', 'fitness_center', 'sports_complex'],
  roofing: ['roofing_contractor', 'general_contractor'],
  'real estate': ['real_estate_agency'],
  plumber: ['plumber', 'general_contractor'],
  electrician: ['electrician', 'general_contractor'],
  restaurant: ['restaurant', 'meal_takeaway', 'cafe'],
  cafe: ['cafe', 'coffee_shop', 'bakery'],
  'auto repair': ['car_repair', 'car_dealer', 'car_wash'],
  landscaping: ['general_contractor', 'florist', 'home_goods_store'],
  cleaning: ['laundry', 'general_contractor', 'point_of_interest'],
};

function getNearbyTypesForNiche(niche) {
  const key = String(niche || '').trim().toLowerCase();
  if (NICHE_NEARBY_TYPES[key]) return NICHE_NEARBY_TYPES[key];
  if (key.includes('dent')) return ['dentist', 'dental_clinic'];
  if (key.includes('barber')) return ['barber_shop', 'hair_care', 'beauty_salon'];
  if (key.includes('salon') || key.includes('hair') || key.includes('beauty') || key.includes('spa')) return ['beauty_salon', 'hair_care', 'spa'];
  if (key.includes('gym') || key.includes('fit') || key.includes('train') || key.includes('yoga')) return ['gym', 'fitness_center'];
  if (key.includes('roof')) return ['roofing_contractor', 'general_contractor'];
  if (key.includes('real') || key.includes('estate') || key.includes('realt')) return ['real_estate_agency'];
  if (key.includes('plumb')) return ['plumber', 'general_contractor'];
  if (key.includes('electr')) return ['electrician', 'general_contractor'];
  if (key.includes('law') || key.includes('attorney')) return ['lawyer'];
  if (key.includes('clean') || key.includes('maid')) return ['laundry', 'general_contractor'];
  if (key.includes('auto') || key.includes('mechanic') || key.includes('car') || key.includes('detail')) return ['car_repair', 'car_wash'];
  if (key.includes('pet') || key.includes('dog') || key.includes('vet') || key.includes('groom')) return ['veterinary_care', 'pet_store'];
  if (key.includes('rest') || key.includes('food') || key.includes('pizza') || key.includes('grill')) return ['restaurant'];
  if (key.includes('cafe') || key.includes('coffee') || key.includes('bakery')) return ['cafe', 'bakery'];
  return ['general_contractor', 'store', 'point_of_interest'];
}

const QUADRANT_OFFSETS = [
  { dLat: 0, dLon: 0, label: 'Central' },
  { dLat: 0.038, dLon: 0, label: 'North' },
  { dLat: -0.038, dLon: 0, label: 'South' },
  { dLat: 0, dLon: 0.048, label: 'East' },
  { dLat: 0, dLon: -0.048, label: 'West' },
  { dLat: 0.028, dLon: 0.036, label: 'Northeast' },
  { dLat: -0.028, dLon: -0.036, label: 'Southwest' },
  { dLat: 0.028, dLon: -0.036, label: 'Northwest' },
  { dLat: -0.028, dLon: 0.036, label: 'Southeast' },
];

export async function resolveCityCoordinates(city, apiKey) {
  if (!city || typeof city !== 'string') return null;
  const cleanCity = city.trim();

  // 1. Try local GeoNames / Canada database exact or fuzzy match
  try {
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
  } catch {}

  // 2. Fallback to Google Geocoding API if API key is present
  if (apiKey) {
    try {
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cleanCity)}&key=${apiKey}`;
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
    } catch {}
  }

  return null;
}

async function searchNearbyPlacesStep({ niche, lat, lon, stepIndex = 0, apiKey }) {
  if (!apiKey || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];

  const typesPool = getNearbyTypesForNiche(niche);
  const typeIndex = stepIndex % typesPool.length;
  const includedTypes = [typesPool[typeIndex]];

  const offset = QUADRANT_OFFSETS[stepIndex % QUADRANT_OFFSETS.length];
  const queryLat = lat + offset.dLat;
  const queryLon = lon + offset.dLon;

  try {
    const res = await fetch(PLACES_NEARBY_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
      },
      body: JSON.stringify({
        includedTypes,
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: queryLat, longitude: queryLon },
            radius: 14000.0,
          },
        },
      }),
    });

    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return Array.isArray(data.places) ? data.places : [];
  } catch {
    return [];
  }
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
      return (c.shortText || c.short_name || c.text || c.longText || c.long_name || '').toString();
    }
  }
  return '';
}

function getCity(components) {
  if (!Array.isArray(components)) return '';
  var targets = ['locality', 'sublocality', 'postal_town', 'administrative_area_level_2'];
  for (var ti = 0; ti < targets.length; ti++) {
    var t = targets[ti];
    for (var ci = 0; ci < components.length; ci++) {
      var c = components[ci];
      if (!Array.isArray(c.types)) continue;
      if (c.types.indexOf(t) !== -1) {
        var v = c.text || c.longText || c.long_name || c.shortText;
        if (v) return String(v);
      }
    }
  }
  return '';
}

/**
 * Discover SMS leads from Google Places.
 *
 * Uses the exact same keyword-per-call + 40% (8+ duplicate) saturation circuit
 * breaker architecture as the Email Campaign:
 *   - Built-in niches iterate through 15-28 sub-niche & directional keywords
 *     (1 single API call per keyword step).
 *   - Custom niches iterate through directional city locations (North, South,
 *     East, West, Downtown, Central).
 *   - As soon as `results.length >= targetLimit`, discovery halts immediately
 *     (so requesting 5 or 10 leads takes just 1 API call when Call #1 returns
 *     >= 5 or >= 10 businesses with phone numbers).
 *   - As soon as any API call returns >= 40% duplicates (or >= 8 duplicates),
 *     the entire session stops immediately and marks all leads found in that city.
 */
export async function discoverSmsLeadsFromPlaces(opts) {
  var apiKey = opts.apiKey;
  var niche = opts.niche || 'Barber';
  var city = opts.city;
  var province = opts.province;
  var lat = opts.lat;
  var lon = opts.lon;
  var explicitCountry = opts.country ? String(opts.country).trim().toUpperCase() : '';
  var targetLimit = Math.max(1, Number(opts.limit) || 20);
  var onProgress = opts.onProgress;

  if (!apiKey) throw new Error('Google Places API key not configured');
  if (!niche || !city) throw new Error('Both niche and city are required');

  var loc = parseLocationString(city, explicitCountry, province);

  // Resolve city coordinates so locationBias & searchNearby fallback work for any city format
  var resolvedLat = Number.isFinite(lat) ? lat : null;
  var resolvedLon = Number.isFinite(lon) ? lon : null;
  if (resolvedLat === null || resolvedLon === null) {
    var coords = await resolveCityCoordinates(loc.queryLocation || loc.city, apiKey);
    if (!coords && loc.city !== city) {
      coords = await resolveCityCoordinates(city, apiKey);
    }
    if (coords) {
      resolvedLat = coords.lat;
      resolvedLon = coords.lon;
      if (!loc.province && coords.state) {
        loc.province = coords.state;
        loc.queryLocation = loc.city + ', ' + coords.state;
      }
    }
  }

  var locationLabel = loc.queryLocation || loc.city;
  if (explicitCountry === 'CA' && !locationLabel.toLowerCase().includes('canada')) {
    locationLabel += ', Canada';
  }

  var queryPlan = buildQueriesForNicheAndCity(niche, locationLabel);
  var queries = queryPlan.queries;
  var isCustomNiche = queryPlan.isCustomNiche;

  var results = [];
  var telemetry = [];
  var callCounter = 0;
  var totalRawCount = 0;
  var seenIds = new Set();
  var seenPhones = new Set();
  var seenNames = new Set();

  var completionStatus = 'target_reached';
  var completionMessage = '';
  var stoppedDueToSaturation = false;

  // Safety cap on total API calls per session
  var maxApiCalls = Math.min(queries.length, Math.max(3, Math.ceil(targetLimit / 5) + 4), 25);

  for (var qIdx = 0; qIdx < queries.length && results.length < targetLimit && callCounter < maxApiCalls; qIdx++) {
    var searchTerm = queries[qIdx];
    callCounter++;

    console.log(
      '[discoverSmsLeadsFromPlaces] Call #' + callCounter +
      ' (' + (isCustomNiche ? 'Custom Niche Location' : 'Built-in Keyword') + ' ' + (qIdx + 1) + '/' + queries.length + '): "' +
      searchTerm + '" (target=' + targetLimit + ', current=' + results.length + ')'
    );

    var places = [];
    var usedNearbyFallback = false;

    if (Date.now() >= searchTextQuotaBlockedUntil) {
      var body = {
        textQuery: searchTerm,
        pageSize: 20,
      };
      if (Number.isFinite(resolvedLat) && Number.isFinite(resolvedLon)) {
        body.locationBias = {
          circle: { center: { latitude: resolvedLat, longitude: resolvedLon }, radius: 50000 },
        };
      }

      try {
        var res = await fetch(PLACES_API_BASE, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': FIELD_MASK,
            'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
          },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          var data = await res.json();
          places = Array.isArray(data.places) ? data.places : [];
        } else {
          if (res.status === 429) {
            searchTextQuotaBlockedUntil = Date.now() + 5 * 60 * 1000;
          }
          usedNearbyFallback = true;
        }
      } catch {
        usedNearbyFallback = true;
      }
    } else {
      usedNearbyFallback = true;
    }

    // Seamless fallback to Places Nearby Search (same as Email Campaign's placesApi.js)
    if ((usedNearbyFallback || places.length === 0) && Number.isFinite(resolvedLat) && Number.isFinite(resolvedLon)) {
      places = await searchNearbyPlacesStep({
        niche,
        lat: resolvedLat,
        lon: resolvedLon,
        stepIndex: qIdx,
        apiKey,
      });
    }

    if (places.length === 0) {
      telemetry.push({
        callNumber: callCounter,
        query: searchTerm,
        page: qIdx + 1,
        rawCount: 0,
        validLeadsAdded: 0,
        duplicatesSkipped: 0,
        duplicateRatio: 0,
        stoppedDueToSaturation: false,
      });
      continue;
    }

    totalRawCount += places.length;
    var duplicatesCount = 0;
    var addedThisCall = 0;
    var totalInBatch = places.length;

    // Step 1: Count total duplicates in the full batch returned by Google Places
    // AND collect new unique candidates with phone numbers.
    var newCandidatesInBatch = [];

    for (var i = 0; i < places.length; i++) {
      var p = places[i];
      if (!p || !p.id) continue;

      var placeName = (p.displayName && p.displayName.text) || p.name || '';
      var normName = placeName.toLowerCase().trim();
      var phone = (p.nationalPhoneNumber || p.internationalPhoneNumber || '').toString().trim();
      var normPhone = phone.replace(/\D/g, '');

      // Check if duplicate across session
      if (
        seenIds.has(p.id) ||
        (normName && seenNames.has(normName)) ||
        (normPhone && seenPhones.has(normPhone))
      ) {
        duplicatesCount++;
        continue;
      }

      // SMS requirement: phone number is mandatory
      if (!phone || !normPhone) continue;

      // Country filter ONLY when explicitly enforced by caller (e.g. Free Plan Canada-only mode)
      if (explicitCountry) {
        var cc = getCountryCode(p.addressComponents);
        if (cc && cc.toUpperCase() !== explicitCountry) continue;
      }

      // Register in session deduplication sets immediately
      seenIds.add(p.id);
      if (normName) seenNames.add(normName);
      if (normPhone) seenPhones.add(normPhone);

      var website = (p.websiteUri || p.website || '').toString().trim();
      var googleUrl = p.googleMapsUri || ('https://www.google.com/maps/place/?q=place_id:' + p.id);

      newCandidatesInBatch.push({
        name: placeName,
        phone: phone,
        website: website,
        googleUrl: googleUrl,
        address: (p.formattedAddress || '').toString(),
        city: getCity(p.addressComponents) || loc.city,
        province: getAdmin(p.addressComponents) || loc.province,
        country: (getCountryCode(p.addressComponents) || loc.country || explicitCountry || 'US').toString(),
        placeId: p.id,
      });
    }

    // Step 2: Add candidates up to targetLimit
    for (var cIdx = 0; cIdx < newCandidatesInBatch.length && results.length < targetLimit; cIdx++) {
      results.push(newCandidatesInBatch[cIdx]);
      addedThisCall++;
      if (typeof onProgress === 'function') {
        onProgress({ stage: 'scanning', leads: results.length, total: targetLimit, current: results.length });
      }
    }

    // Step 3: Check 40% / 8-Duplicate Saturation Circuit Breaker
    var duplicateRatio = totalInBatch > 0 ? (duplicatesCount / totalInBatch) : 0;
    var hitDuplicateSaturation = (duplicatesCount >= 8) || (totalInBatch >= 5 && duplicateRatio >= 0.40);

    telemetry.push({
      callNumber: callCounter,
      query: searchTerm,
      page: qIdx + 1,
      rawCount: totalInBatch,
      validLeadsAdded: addedThisCall,
      duplicatesSkipped: duplicatesCount,
      duplicateRatio: Math.round(duplicateRatio * 100),
      stoppedDueToSaturation: Boolean(hitDuplicateSaturation && results.length < targetLimit),
    });

    // If we reached the user's requested lead count, stop immediately!
    if (results.length >= targetLimit) {
      completionStatus = 'target_reached';
      completionMessage = 'Successfully found ' + results.length + ' verified leads in ' + loc.city + '.';
      break;
    }

    // If duplicate rate hits >= 40% (or >= 8 duplicates in the call), immediately terminate the ENTIRE session!
    if (hitDuplicateSaturation) {
      stoppedDueToSaturation = true;
      completionStatus = 'region_exhausted';
      completionMessage = 'All available leads found from ' + loc.city + ' (' + duplicatesCount + ' duplicates / ' + Math.round(duplicateRatio * 100) + '% overlap on Call #' + callCounter + ' — session stopped automatically).';
      console.log('[discoverSmsLeadsFromPlaces] Circuit breaker triggered: ' + completionMessage);
      break;
    }
  }

  if (results.length === 0) {
    completionStatus = 'no_businesses_found';
    completionMessage = 'No verified ' + niche + ' businesses with phone numbers found in ' + loc.city + '.';
  } else if (results.length < targetLimit && !stoppedDueToSaturation) {
    completionStatus = 'region_exhausted';
    completionMessage = 'All ' + results.length + ' available ' + niche + ' leads found from ' + loc.city + '.';
  }

  console.log(
    '[discoverSmsLeadsFromPlaces] Completed: ' + results.length + ' valid leads across ' +
    callCounter + ' API call(s) (target=' + targetLimit + ', status=' + completionStatus + ')'
  );

  if (typeof onProgress === 'function') {
    onProgress({ stage: 'done', leads: results.length, total: results.length });
  }

  return {
    leads: results,
    telemetry: telemetry,
    totalCalls: callCounter,
    rawTotal: totalRawCount,
    isCustomNiche: isCustomNiche,
    stoppedDueToSaturation: stoppedDueToSaturation,
    completionStatus: completionStatus,
    completionMessage: completionMessage,
  };
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

const US_STATE_NAME_TO_CODE = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
  'district of columbia': 'DC',
};

const CA_PROV_NAME_TO_CODE = {
  'alberta': 'AB', 'british columbia': 'BC', 'manitoba': 'MB', 'new brunswick': 'NB',
  'newfoundland': 'NL', 'newfoundland and labrador': 'NL', 'nova scotia': 'NS',
  'northwest territories': 'NT', 'nunavut': 'NU', 'ontario': 'ON',
  'prince edward island': 'PE', 'quebec': 'QC', 'saskatchewan': 'SK', 'yukon': 'YT',
};

const VALID_US_CODES = new Set(Object.values(US_STATE_NAME_TO_CODE));
const VALID_CA_CODES = new Set(Object.values(CA_PROV_NAME_TO_CODE));

function toTitleCaseWords(str) {
  return String(str || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(function(w) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Parse location string into structured city, province/state, country, and
 * clean queryLocation (never forcing ', TX' onto non-Texas cities or typos).
 */
export function parseLocationString(inputCity, countryHint = '', provinceHint = '') {
  const raw = String(inputCity || '').trim();
  if (!raw) {
    return {
      city: 'Austin',
      province: 'TX',
      country: 'US',
      queryLocation: 'Austin, TX',
      formattedLocation: 'Austin, TX',
    };
  }

  // Clean common typos in popular cities & state abbreviations (e.g. "AUSTIN EX" -> "Austin, TX")
  let cleaned = raw
    .replace(/calagry/gi, 'Calgary')
    .replace(/vancouvr/gi, 'Vancouver')
    .replace(/torono/gi, 'Toronto')
    .replace(/montreal/gi, 'Montreal')
    .replace(/edmonon/gi, 'Edmonton')
    .replace(/austn/gi, 'Austin')
    .replace(/\b(austin|dallas|houston|san antonio|fort worth|el paso|plano|arlington)\s*,?\s*ex\b/gi, '$1, TX');

  const explicitProv = String(provinceHint || '').trim().toUpperCase();
  const explicitCountry = String(countryHint || '').trim().toUpperCase();

  let cityPart = cleaned;
  let regionPart = explicitProv;

  if (cleaned.includes(',')) {
    const parts = cleaned.split(',').map((s) => s.trim()).filter(Boolean);
    cityPart = parts[0] || cleaned;
    if (!regionPart && parts[1]) {
      regionPart = parts[1].replace(/\b(usa|united states|canada|ca|us)\b/gi, '').trim();
    }
  } else {
    // Handle space-separated state/province without comma, e.g. "AUSTIN TX", "TORONTO ON", "MIAMI FL", "AUSTIN EX"
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) {
      const lastTokenUpper = tokens[tokens.length - 1].toUpperCase();
      const lastTwoLower = tokens.slice(-2).join(' ').toLowerCase();
      if (VALID_US_CODES.has(lastTokenUpper) || VALID_CA_CODES.has(lastTokenUpper)) {
        regionPart = regionPart || lastTokenUpper;
        cityPart = tokens.slice(0, -1).join(' ');
      } else if (US_STATE_NAME_TO_CODE[lastTwoLower] || CA_PROV_NAME_TO_CODE[lastTwoLower]) {
        regionPart = regionPart || US_STATE_NAME_TO_CODE[lastTwoLower] || CA_PROV_NAME_TO_CODE[lastTwoLower];
        cityPart = tokens.slice(0, -2).join(' ');
      } else if (US_STATE_NAME_TO_CODE[lastTokenUpper.toLowerCase()] || CA_PROV_NAME_TO_CODE[lastTokenUpper.toLowerCase()]) {
        const lowerLast = lastTokenUpper.toLowerCase();
        regionPart = regionPart || US_STATE_NAME_TO_CODE[lowerLast] || CA_PROV_NAME_TO_CODE[lowerLast];
        cityPart = tokens.slice(0, -1).join(' ');
      } else if (lastTokenUpper.length === 2) {
        // Unrecognized 2-letter suffix (like a typo "EX" after a city name): strip the typo so Google Places still finds the city!
        cityPart = tokens.slice(0, -1).join(' ');
      }
    }
  }

  const normalizedCity = toTitleCaseWords(cityPart.replace(/\b(canada|usa|united states)\b/gi, '').trim()) || toTitleCaseWords(cleaned);
  const lowerCity = normalizedCity.toLowerCase();
  const lowerRegion = String(regionPart || '').toLowerCase().trim();
  const upperRegion = String(regionPart || '').toUpperCase().trim();

  let resolvedProvince = '';
  let resolvedCountry = explicitCountry || '';

  if (VALID_CA_CODES.has(upperRegion)) {
    resolvedProvince = upperRegion;
    resolvedCountry = resolvedCountry || 'CA';
  } else if (CA_PROV_NAME_TO_CODE[lowerRegion]) {
    resolvedProvince = CA_PROV_NAME_TO_CODE[lowerRegion];
    resolvedCountry = resolvedCountry || 'CA';
  } else if (VALID_US_CODES.has(upperRegion)) {
    resolvedProvince = upperRegion;
    resolvedCountry = resolvedCountry || 'US';
  } else if (US_STATE_NAME_TO_CODE[lowerRegion]) {
    resolvedProvince = US_STATE_NAME_TO_CODE[lowerRegion];
    resolvedCountry = resolvedCountry || 'US';
  } else {
    // Infer well-known Canadian cities if no region was provided
    if (lowerCity === 'vancouver' || lowerCity === 'victoria' || lowerCity === 'kelowna' || lowerCity === 'surrey' || lowerCity === 'burnaby') {
      resolvedProvince = 'BC';
      resolvedCountry = resolvedCountry || 'CA';
    } else if (lowerCity === 'calgary' || lowerCity === 'edmonton' || lowerCity === 'red deer' || lowerCity === 'lethbridge') {
      resolvedProvince = 'AB';
      resolvedCountry = resolvedCountry || 'CA';
    } else if (lowerCity === 'toronto' || lowerCity === 'ottawa' || lowerCity === 'mississauga' || lowerCity === 'brampton' || lowerCity === 'hamilton') {
      resolvedProvince = 'ON';
      resolvedCountry = resolvedCountry || 'CA';
    } else if (lowerCity === 'montreal' || lowerCity === 'quebec city' || lowerCity === 'laval' || lowerCity === 'gatineau') {
      resolvedProvince = 'QC';
      resolvedCountry = resolvedCountry || 'CA';
    } else if (lowerCity === 'winnipeg' || lowerCity === 'brandon') {
      resolvedProvince = 'MB';
      resolvedCountry = resolvedCountry || 'CA';
    } else if (lowerCity === 'saskatoon' || lowerCity === 'regina') {
      resolvedProvince = 'SK';
      resolvedCountry = resolvedCountry || 'CA';
    } else if (lowerCity === 'halifax') {
      resolvedProvince = 'NS';
      resolvedCountry = resolvedCountry || 'CA';
    } else if (lowerCity === 'austin' || lowerCity === 'dallas' || lowerCity === 'houston' || lowerCity === 'san antonio' || lowerCity === 'fort worth') {
      resolvedProvince = 'TX';
      resolvedCountry = resolvedCountry || 'US';
    }
  }

  const queryLocation = resolvedProvince
    ? `${normalizedCity}, ${resolvedProvince}`
    : normalizedCity;

  return {
    city: normalizedCity,
    province: resolvedProvince,
    country: resolvedCountry,
    queryLocation,
    formattedLocation: queryLocation,
  };
}
