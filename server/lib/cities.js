// server/lib/cities.js
// ---------------------------------------------------------------------------
// City resolution for the Auto Email Sender ("dork") lead-source wizard.
//
// On startup this module:
//   1. Loads a small SEED_CITIES list synchronously so the lookup endpoint
//      returns instant results even on cold start.
//   2. Kicks off an async streaming load of `cities500.txt` (the GeoNames
//      cities-with-population-greater-than-500 dump, ~200k rows, ~40 MB on
//      disk). Once done it merges the records into the in-memory index.
//
// GeoNames tab-separated columns (cities500.txt):
//   0  geonameid
//   1  name
//   2  asciiname
//   3  alternatenames        (comma-separated localized + alternate names)
//   4  latitude
//   5  longitude
//   6  feature_class
//   7  feature_code
//   8  country_code          (ISO 3166-1 alpha-2)
//   9  cc2                   (alternate country codes, comma-list)
//   10 admin1                (region/state code)
//   11 admin2                (county/district)
//   12 admin3
//   13 admin4
//   14 population
//   15 elevation
//   16 dem
//   17 timezone
//   18 modification_date
//
// We only keep: name, asciiname, alternatenames (for the alt index), lat,
// lon, country_code, admin1, population. ~120 bytes per record → ~24 MB
// for 200k rows. Comfortably under the 200 MB ceiling the project requested.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');
const CITIES_TXT = path.join(SERVER_ROOT, 'data', 'cities500', 'cities500.txt');

// Tiny fallback list — ~100 major cities. Used until the full GeoNames file
// finishes loading so the UI never reports "I don't recognize" for a famous
// city on cold start.
const SEED_CITIES = [
  { name: 'New York', country: 'United States', admin: 'NY', lat: 40.7128, lon: -74.006, population: 8336817 },
  { name: 'Los Angeles', country: 'United States', admin: 'CA', lat: 34.0522, lon: -118.2437, population: 3979576 },
  { name: 'Chicago', country: 'United States', admin: 'IL', lat: 41.8781, lon: -87.6298, population: 2693976 },
  { name: 'Houston', country: 'United States', admin: 'TX', lat: 29.7604, lon: -95.3698, population: 2320268 },
  { name: 'Phoenix', country: 'United States', admin: 'AZ', lat: 33.4484, lon: -112.074, population: 1680992 },
  { name: 'Philadelphia', country: 'United States', admin: 'PA', lat: 39.9526, lon: -75.1652, population: 1584064 },
  { name: 'San Antonio', country: 'United States', admin: 'TX', lat: 29.4241, lon: -98.4936, population: 1547253 },
  { name: 'San Diego', country: 'United States', admin: 'CA', lat: 32.7157, lon: -117.1611, population: 1423851 },
  { name: 'Dallas', country: 'United States', admin: 'TX', lat: 32.7767, lon: -96.797, population: 1343573 },
  { name: 'San Jose', country: 'United States', admin: 'CA', lat: 37.3382, lon: -121.8863, population: 1021795 },
  { name: 'Austin', country: 'United States', admin: 'TX', lat: 30.2672, lon: -97.7431, population: 978908 },
  { name: 'Jacksonville', country: 'United States', admin: 'FL', lat: 30.3322, lon: -81.6557, population: 911507 },
  { name: 'Fort Worth', country: 'United States', admin: 'TX', lat: 32.7555, lon: -97.3308, population: 909585 },
  { name: 'Columbus', country: 'United States', admin: 'OH', lat: 39.9612, lon: -82.9988, population: 898553 },
  { name: 'Charlotte', country: 'United States', admin: 'NC', lat: 35.2271, lon: -80.8431, population: 885708 },
  { name: 'San Francisco', country: 'United States', admin: 'CA', lat: 37.7749, lon: -122.4194, population: 881549 },
  { name: 'Indianapolis', country: 'United States', admin: 'IN', lat: 39.7684, lon: -86.1581, population: 876384 },
  { name: 'Seattle', country: 'United States', admin: 'WA', lat: 47.6062, lon: -122.3321, population: 753675 },
  { name: 'Denver', country: 'United States', admin: 'CO', lat: 39.7392, lon: -104.9903, population: 727211 },
  { name: 'Washington', country: 'United States', admin: 'DC', lat: 38.9072, lon: -77.0369, population: 705749 },
  { name: 'Boston', country: 'United States', admin: 'MA', lat: 42.3601, lon: -71.0589, population: 692600 },
  { name: 'Nashville', country: 'United States', admin: 'TN', lat: 36.1627, lon: -86.7816, population: 670820 },
  { name: 'Baltimore', country: 'United States', admin: 'MD', lat: 39.2904, lon: -76.6122, population: 585708 },
  { name: 'Oklahoma City', country: 'United States', admin: 'OK', lat: 35.4676, lon: -97.5164, population: 649021 },
  { name: 'Las Vegas', country: 'United States', admin: 'NV', lat: 36.1699, lon: -115.1398, population: 651319 },
  { name: 'Portland', country: 'United States', admin: 'OR', lat: 45.5152, lon: -122.6784, population: 654741 },
  { name: 'Miami', country: 'United States', admin: 'FL', lat: 25.7617, lon: -80.1918, population: 467963 },
  { name: 'Atlanta', country: 'United States', admin: 'GA', lat: 33.749, lon: -84.388, population: 498715 },
  { name: 'Syracuse', country: 'United States', admin: 'NY', lat: 43.0481, lon: -76.1474, population: 148620 },
  { name: 'Detroit', country: 'United States', admin: 'MI', lat: 42.3314, lon: -83.0458, population: 670031 },
  { name: 'Minneapolis', country: 'United States', admin: 'MN', lat: 44.9778, lon: -93.265, population: 425403 },
  { name: 'New Orleans', country: 'United States', admin: 'LA', lat: 29.9511, lon: -90.0715, population: 390144 },
  { name: 'Salt Lake City', country: 'United States', admin: 'UT', lat: 40.7608, lon: -111.891, population: 200591 },
  { name: 'Cleveland', country: 'United States', admin: 'OH', lat: 41.4993, lon: -81.6944, population: 381009 },
  { name: 'Pittsburgh', country: 'United States', admin: 'PA', lat: 40.4406, lon: -79.9959, population: 300286 },
  { name: 'Cincinnati', country: 'United States', admin: 'OH', lat: 39.1031, lon: -84.512, population: 307266 },
  { name: 'Kansas City', country: 'United States', admin: 'MO', lat: 39.0997, lon: -94.5786, population: 495327 },
  { name: 'Raleigh', country: 'United States', admin: 'NC', lat: 35.7796, lon: -78.6382, population: 474069 },
  { name: 'Tampa', country: 'United States', admin: 'FL', lat: 27.9506, lon: -82.4572, population: 399913 },
  { name: 'Orlando', country: 'United States', admin: 'FL', lat: 28.5383, lon: -81.3792, population: 287442 },
  { name: 'Birmingham', country: 'United Kingdom', admin: 'England', lat: 52.4862, lon: -1.8904, population: 1141816 },
  { name: 'Manchester', country: 'United Kingdom', admin: 'England', lat: 53.4808, lon: -2.2426, population: 553230 },
  { name: 'Leeds', country: 'United Kingdom', admin: 'England', lat: 53.796, lon: -1.5474, population: 535271 },
  { name: 'Liverpool', country: 'United Kingdom', admin: 'England', lat: 53.4084, lon: -2.9916, population: 494814 },
  { name: 'London', country: 'United Kingdom', admin: 'England', lat: 51.5074, lon: -0.1278, population: 8982000 },
  { name: 'Bristol', country: 'United Kingdom', admin: 'England', lat: 51.4545, lon: -2.5879, population: 467477 },
  { name: 'Glasgow', country: 'United Kingdom', admin: 'Scotland', lat: 55.8642, lon: -4.2518, population: 626410 },
  { name: 'Edinburgh', country: 'United Kingdom', admin: 'Scotland', lat: 55.9533, lon: -3.1883, population: 518500 },
  { name: 'Cardiff', country: 'United Kingdom', admin: 'Wales', lat: 51.4816, lon: -3.1791, population: 362756 },
  { name: 'Leek', country: 'United Kingdom', admin: 'England', lat: 53.1061, lon: -2.1789, population: 15649 },
  { name: 'Stoke-on-Trent', country: 'United Kingdom', admin: 'England', lat: 53.0045, lon: -2.1784, population: 255376 },
  { name: 'Exeter', country: 'United Kingdom', admin: 'England', lat: 50.7184, lon: -3.5339, population: 131500 },
  { name: 'Sydney', country: 'Australia', admin: 'NSW', lat: -33.8688, lon: 151.2093, population: 5312163 },
  { name: 'Melbourne', country: 'Australia', admin: 'VIC', lat: -37.8136, lon: 144.9631, population: 5078193 },
  { name: 'Brisbane', country: 'Australia', admin: 'QLD', lat: -27.4698, lon: 153.0251, population: 2462637 },
  { name: 'Perth', country: 'Australia', admin: 'WA', lat: -31.9505, lon: 115.8605, population: 2059484 },
  { name: 'Adelaide', country: 'Australia', admin: 'SA', lat: -34.9285, lon: 138.6007, population: 1345777 },
  { name: 'Gold Coast', country: 'Australia', admin: 'QLD', lat: -28.0167, lon: 153.4, population: 679170 },
  { name: 'Canberra', country: 'Australia', admin: 'ACT', lat: -35.2809, lon: 149.1288, population: 431380 },
  { name: 'Toronto', country: 'Canada', admin: 'ON', lat: 43.6532, lon: -79.3832, population: 2731571 },
  { name: 'Montreal', country: 'Canada', admin: 'QC', lat: 45.5017, lon: -73.5673, population: 1762949 },
  { name: 'Vancouver', country: 'Canada', admin: 'BC', lat: 49.2827, lon: -123.1207, population: 631486 },
  { name: 'Calgary', country: 'Canada', admin: 'AB', lat: 51.0447, lon: -114.0719, population: 1239220 },
  { name: 'Edmonton', country: 'Canada', admin: 'AB', lat: 53.5461, lon: -113.4938, population: 1010899 },
  { name: 'Ottawa', country: 'Canada', admin: 'ON', lat: 45.4215, lon: -75.6972, population: 994837 },
  { name: 'Berlin', country: 'Germany', admin: 'Berlin', lat: 52.52, lon: 13.405, population: 3669491 },
  { name: 'Munich', country: 'Germany', admin: 'Bavaria', lat: 48.1351, lon: 11.582, population: 1471508 },
  { name: 'Hamburg', country: 'Germany', admin: 'Hamburg', lat: 53.5511, lon: 9.9937, population: 1899160 },
  { name: 'Frankfurt', country: 'Germany', admin: 'Hesse', lat: 50.1109, lon: 8.6821, population: 753056 },
  { name: 'Cologne', country: 'Germany', admin: 'North Rhine-Westphalia', lat: 50.9375, lon: 6.9603, population: 1085664 },
  { name: 'Paris', country: 'France', admin: 'Île-de-France', lat: 48.8566, lon: 2.3522, population: 2161000 },
  { name: 'Lyon', country: 'France', admin: 'Auvergne-Rhône-Alpes', lat: 45.764, lon: 4.8357, population: 516092 },
  { name: 'Marseille', country: 'France', admin: 'Provence-Alpes-Côte Azur', lat: 43.2965, lon: 5.3698, population: 861635 },
  { name: 'Rome', country: 'Italy', admin: 'Lazio', lat: 41.9028, lon: 12.4964, population: 2873000 },
  { name: 'Milan', country: 'Italy', admin: 'Lombardy', lat: 45.4642, lon: 9.19, population: 1352000 },
  { name: 'Naples', country: 'Italy', admin: 'Campania', lat: 40.8518, lon: 14.2681, population: 959052 },
  { name: 'Madrid', country: 'Spain', admin: 'Madrid', lat: 40.4168, lon: -3.7038, population: 3223334 },
  { name: 'Barcelona', country: 'Spain', admin: 'Catalonia', lat: 41.3851, lon: 2.1734, population: 1620343 },
  { name: 'Valencia', country: 'Spain', admin: 'Valencia', lat: 39.4699, lon: -0.3763, population: 794288 },
  { name: 'Lahore', country: 'Pakistan', admin: 'Punjab', lat: 31.5204, lon: 74.3587, population: 13095166 },
  { name: 'Karachi', country: 'Pakistan', admin: 'Sindh', lat: 24.8607, lon: 67.0011, population: 16093786 },
  { name: 'Islamabad', country: 'Pakistan', admin: 'ICT', lat: 33.6844, lon: 73.0479, population: 1061000 },
  { name: 'Dubai', country: 'UAE', admin: 'Dubai', lat: 25.2048, lon: 55.2708, population: 3331420 },
  { name: 'Abu Dhabi', country: 'UAE', admin: 'Abu Dhabi', lat: 24.4539, lon: 54.3773, population: 1483000 },
  { name: 'Algiers', country: 'Algeria', admin: 'Algiers', lat: 36.7538, lon: 3.0588, population: 3415811 },
  { name: 'Cairo', country: 'Egypt', admin: 'Cairo', lat: 30.0444, lon: 31.2357, population: 21322750 },
  { name: 'Lagos', country: 'Nigeria', admin: 'Lagos', lat: 6.5244, lon: 3.3792, population: 15388000 },
  { name: 'Dublin', country: 'Ireland', admin: 'Leinster', lat: 53.3498, lon: -6.2603, population: 554554 },
  { name: 'Cork', country: 'Ireland', admin: 'Cork', lat: 51.8985, lon: -8.4756, population: 210853 },
  { name: 'Amsterdam', country: 'Netherlands', admin: 'North Holland', lat: 52.3676, lon: 4.9041, population: 872680 },
  { name: 'Rotterdam', country: 'Netherlands', admin: 'South Holland', lat: 51.9244, lon: 4.4777, population: 651446 },
  { name: 'Vienna', country: 'Austria', admin: 'Vienna', lat: 48.2082, lon: 16.3738, population: 1911191 },
  { name: 'Zurich', country: 'Switzerland', admin: 'Zurich', lat: 47.3769, lon: 8.5417, population: 421878 },
  { name: 'Geneva', country: 'Switzerland', admin: 'Geneva', lat: 46.2044, lon: 6.1432, population: 201818 },
  { name: 'Stockholm', country: 'Sweden', admin: 'Stockholm', lat: 59.3293, lon: 18.0686, population: 975904 },
  { name: 'Copenhagen', country: 'Denmark', admin: 'Capital Region', lat: 55.6761, lon: 12.5683, population: 794128 },
  { name: 'Oslo', country: 'Norway', admin: 'Oslo', lat: 59.9139, lon: 10.7522, population: 697549 },
  { name: 'Helsinki', country: 'Finland', admin: 'Uusimaa', lat: 60.1699, lon: 24.9384, population: 656229 },
  { name: 'Atherton', country: 'United States', admin: 'CA', lat: 37.4613, lon: -122.1977, population: 7266 },
  { name: 'Gove', country: 'Australia', admin: 'NT', lat: -12.1847, lon: 136.7707, population: 1500 },
  { name: 'Boise', country: 'United States', admin: 'ID', lat: 43.615, lon: -116.2023, population: 235684 },
  { name: 'Cary', country: 'United States', admin: 'NC', lat: 35.7915, lon: -78.7811, population: 176987 },
  { name: 'Bath', country: 'United Kingdom', admin: 'England', lat: 51.3811, lon: -2.359, population: 94000 },
  { name: 'Saskatoon', country: 'Canada', admin: 'SK', lat: 52.1332, lon: -106.6700, population: 273000 },
];

// Country code -> human readable label. GeoNames ships ISO alpha-2 only;
// the wizard's UI wants a friendly country name on suggestion rows.
const COUNTRY_NAMES = {
  US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia',
  DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain', NL: 'Netherlands',
  AT: 'Austria', CH: 'Switzerland', SE: 'Sweden', DK: 'Denmark', NO: 'Norway',
  FI: 'Finland', IE: 'Ireland', BE: 'Belgium', PT: 'Portugal', GR: 'Greece',
  PL: 'Poland', CZ: 'Czechia', SK: 'Slovakia', RO: 'Romania', HU: 'Hungary',
  RU: 'Russia', UA: 'Ukraine', TR: 'Turkey', IL: 'Israel', AE: 'UAE',
  SA: 'Saudi Arabia', EG: 'Egypt', ZA: 'South Africa', NG: 'Nigeria',
  KE: 'Kenya', MA: 'Morocco', DZ: 'Algeria', TN: 'Tunisia', GH: 'Ghana',
  ET: 'Ethiopia', PK: 'Pakistan', IN: 'India', BD: 'Bangladesh', LK: 'Sri Lanka',
  NP: 'Nepal', AF: 'Afghanistan', IR: 'Iran', IQ: 'Iraq', JO: 'Jordan',
  LB: 'Lebanon', SY: 'Syria', YE: 'Yemen', OM: 'Oman', KW: 'Kuwait',
  QA: 'Qatar', BH: 'Bahrain', CN: 'China', JP: 'Japan', KR: 'South Korea',
  KP: 'North Korea', MN: 'Mongolia', TW: 'Taiwan', HK: 'Hong Kong', MO: 'Macao',
  VN: 'Vietnam', TH: 'Thailand', MY: 'Malaysia', SG: 'Singapore', ID: 'Indonesia',
  PH: 'Philippines', KH: 'Cambodia', LA: 'Laos', MM: 'Myanmar', BN: 'Brunei',
  MX: 'Mexico', GT: 'Guatemala', BZ: 'Belize', HN: 'Honduras', SV: 'El Salvador',
  NI: 'Nicaragua', CR: 'Costa Rica', PA: 'Panama', CU: 'Cuba', DO: 'Dominican Republic',
  HT: 'Haiti', JM: 'Jamaica', TT: 'Trinidad and Tobago', BB: 'Barbados',
  CO: 'Colombia', VE: 'Venezuela', EC: 'Ecuador', PE: 'Peru', BO: 'Bolivia',
  CL: 'Chile', AR: 'Argentina', UY: 'Uruguay', PY: 'Paraguay', BR: 'Brazil',
  GY: 'Guyana', SR: 'Suriname', NZ: 'New Zealand', FJ: 'Fiji', PG: 'Papua New Guinea',
};

function countryLabel(code) {
  if (!code) return '';
  return COUNTRY_NAMES[code.toUpperCase()] || code;
}

// Strip everything that isn't a-z or 0-9, lowercase. Cheap normalization
// good enough for prefix + substring matching at 200k scale.
function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// In-memory index. Mutated by loadCitiesFromGeoNames().
//
// Each record on disk becomes a small object with these fields:
//   { name, country, admin, lat, lon, population, alt[],
//     _normName, _tokens, _normAltJoined }
//
// `_normName`  : primary name lowercased, non-alphanumerics stripped
// `_tokens`    : primary name split into lowercased tokens
//                (e.g. "New York City" -> ['new','york','city'])
// `_normAltJoined`: alt-names joined with "|" after normalization,
//                  so we can do a single substring probe
//
// All derived fields are populated inline in `addRecord` — no deferred
// "rebuild" pass. That keeps every record queryable the moment it's
// pushed, even mid-load.
let cities = [];                    // records (array, scanned on each search)
let byNormName = new Map();         // normalized primary name -> record
let byAlt = new Map();              // normalized alt-name -> record   (alt spellings)
let byNormNameAdmin = new Map();    // normalized "name|admin" -> record (disambiguates Rome-Italy vs Rome-NY)
let byCompact = new Map();          // ultra-compact primary name (all letters/digits concatenated) -> record
                                   //   e.g. "New York City" -> "newyorkcity". Lets "nyc" exact-match.
let populationFloor = 0;            // applied to the GeoNames file; SEED cities bypass it
let status = { phase: 'idle', records: 0, fileLoaded: false, error: null };

function addRecord(rec) {
  const norm = normalize(rec.name);
  if (!norm) return false;
  // Disambiguate identical-name cities (Rome-IT, Rome-NY, Paris-TX) by
  // (name + admin) first; fall back to plain name.
  const key = rec.admin ? `${norm}|${normalize(rec.admin)}` : norm;
  if (!byNormNameAdmin.has(key)) {
    byNormNameAdmin.set(key, rec);
  }
  if (!byNormName.has(norm)) {
    byNormName.set(norm, rec);
  }
  // Inline pre-normalization so searchSuggestions never sees undefined.
  rec._normName = norm;
  rec._tokens = norm.split(/(?=[a-z])/).filter((t) => t.length >= 2); // crude per-word tokens
  rec._normAltJoined = Array.isArray(rec.alt)
    ? rec.alt.map(normalize).join('|')
    : '';
  rec._compact = norm; // already lowercase alphanumeric
  // Also keep the 2-letter ISO code as `countryIso` if we know it. Both
  // the SEED_CITIES and GeoNames loader call addRecord with a full name
  // in `country`; we derive the ISO here so callers can filter by 'CA'.
  if (!rec.countryIso && rec.country) {
    rec.countryIso = countryToIso(rec.country) || null;
  }
  // also build a "compact of every alt" view so "NYC" -> "New York City"
  // can match via alt compact lookup.
  if (Array.isArray(rec.alt)) {
    for (const alt of rec.alt) {
      const a = normalize(alt);
      if (a && a !== norm && !byAlt.has(a)) {
        byAlt.set(a, rec);
      }
      const ac = a;
      if (ac && ac.length >= 2 && !byCompact.has(ac)) {
        byCompact.set(ac, rec);
      }
    }
  }
  if (!byCompact.has(norm)) byCompact.set(norm, rec);
  cities.push(rec);
  return true;
}

// Seed list is added synchronously at module import so the first request
// after boot never sees an empty database.
for (const rec of SEED_CITIES) addRecord(rec);

// Load the 40 MB cities500.txt in a streaming fashion. Reads one line at a
// time (no full-file slurp), so RSS stays bounded. Returns when done.
async function loadCitiesFromGeoNames({ minPopulation = 500 } = {}) {
  if (status.phase === 'loading' || status.fileLoaded) return status;
  status = { ...status, phase: 'loading', error: null };
  try {
    if (!fs.existsSync(CITIES_TXT)) {
      // Graceful: ship without the file and keep using the seed list.
      status = { phase: 'ready', records: cities.length, fileLoaded: false, error: 'cities500.txt not found at ' + CITIES_TXT };
      return status;
    }

    populationFloor = minPopulation;
    const stream = fs.createReadStream(CITIES_TXT, { encoding: 'utf8', highWaterMark: 64 * 1024 });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let added = 0;
    for await (const line of rl) {
      if (!line) continue;
      const cols = line.split('\t');
      if (cols.length < 15) continue;
      const population = parseInt(cols[14], 10) || 0;
      if (population < minPopulation) continue;
      const countryCode = cols[8];
      const altNames = cols[3] && cols[3].length ? cols[3].split(',') : [];
      const rec = {
        name: cols[1],
        country: countryLabel(countryCode),
        countryIso: countryCode,
        admin: cols[10] || '',
        lat: parseFloat(cols[4]) || 0,
        lon: parseFloat(cols[5]) || 0,
        population,
        alt: altNames,
      };
      if (addRecord(rec)) added++;
    }
    status = { phase: 'ready', records: cities.length, fileLoaded: true, error: null, addedFromFile: added };
    // eslint-disable-next-line no-console
    console.log(`[cities] Loaded ${added.toLocaleString()} cities from cities500.txt (total in-memory: ${cities.length.toLocaleString()})`);
  } catch (err) {
    status = { phase: 'error', records: cities.length, fileLoaded: false, error: err.message };
    // eslint-disable-next-line no-console
    console.error('[cities] Failed to load cities500.txt:', err.message);
  }
  return status;
}

// Look up a single city record by name (and optional admin). Returns the
// canonical record or null. Used by the API endpoint for exact matches.
//
// Resolution order:
//   1. "<normalized name>|<normalized admin>"        (admin-aware disambig)
//   2. normalized primary name                       (exact, fastest path)
//   3. normalized compact form                        (e.g. "nyc" -> NYC)
//   4. alt-name match                                  (München -> Munich)
function findExact(query, adminHint) {
  const q = normalize(query);
  if (!q) return null;
  if (adminHint) {
    const key = `${q}|${normalize(adminHint)}`;
    if (byNormNameAdmin.has(key)) return byNormNameAdmin.get(key);
  }
  if (byNormName.has(q)) return byNormName.get(q);
  if (byCompact.has(q)) return byCompact.get(q);
  if (byAlt.has(q)) return byAlt.get(q);
  return null;
}

// Bounded Levenshtein distance (caps at `max` to avoid quadratic blowup).
// Returns -1 if the distance exceeds `max`.
function levenshteinBounded(a, b, max) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return -1;
  if (la === 0) return lb <= max ? lb : -1;
  if (lb === 0) return la <= max ? la : -1;
  let prev = new Array(lb + 1);
  let curr = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,        // deletion
        curr[j - 1] + 1,    // insertion
        prev[j - 1] + cost, // substitution
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return -1; // early bail-out
    [prev, curr] = [curr, prev];
  }
  const d = prev[lb];
  return d <= max ? d : -1;
}

// Tokenize a normalized query string into meaningful tokens.
// E.g. normalize("NYC, NY") -> "nycny" -> we'd still want "nyc" + "ny" as hints.
// For "new-york city" -> "newyorkcity" we lose structure — but the
// _tokens field on each record is the source of truth for matching
// against the *primary name*, while we fall back to substring on
// the compact form.
function queryTokens(q) {
  // Try splitting on common separators first (in case user types
  // "New York" or "Stoke-on-Trent"); fall back to a single token.
  const tokens = q
    .toLowerCase()
    .split(/[\s,\-\/]+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter((t) => t.length >= 2);
  return tokens.length ? tokens : [q];
}

// Multi-stage scoring search.
//
// Stage A — strong matches (primary token-prefix or startsWith on primary):
//   q token is a prefix of some primary token of the city.
//   Score  = 800 + min(80, pop / 50_000)
//
// Stage B — substring on primary name:
//   Score  = 500 + min(80, pop / 50_000)
//
// Stage C — fuzzy on a small prefix (helps "livrpool" -> "Liverpool"):
//   Edit distance <= 2 on the first min(6, len) chars.
//   Score  = 300 + min(80, pop / 50_000)
//
// Stage D — substring on any alt-name:
//   Score  = 100
//
// Stage E — substring on compact form (catches "nyc" -> "New York City"
//   even though the primary name is "New York City" which has no "nyc"
//   substring directly — but the alt-compact "newyorkcity" matches "nyc"
//   only as a substring, which is already handled by the byCompact map
//   for *exact* matches. For partial/typo compacts we'd need Levenshtein
//   on the full compact, which is heuristic-only; we skip that here.)
//
// Output: top `limit` records by score desc, deduped by record id.
function searchSuggestions(query, limit = 8) {
  const q = normalize(query);
  if (q.length < 2) return [];
  const tokens = queryTokens(query);
  const out = [];
  const seen = new Set();
  const prefixProbe = tokens[0].slice(0, Math.min(6, tokens[0].length));

  for (let i = 0; i < cities.length; i++) {
    const c = cities[i];
    const n = c._normName;
    let score = -1;
    let matchedVia = '';

    // Stage A — primary token-prefix.
    if (Array.isArray(c._tokens)) {
      for (let t = 0; t < tokens.length; t++) {
        const qt = tokens[t];
        for (let k = 0; k < c._tokens.length; k++) {
          const ct = c._tokens[k];
          if (ct === qt) { score = 850 + Math.min(80, (c.population || 0) / 50000); matchedVia = 'token-exact'; break; }
          if (ct.startsWith(qt) && qt.length >= 2) { score = Math.max(score, 800 + Math.min(80, (c.population || 0) / 50000)); matchedVia = matchedVia || 'token-prefix'; }
        }
        if (score >= 850) break;
      }
    }

    // Stage B — substring on primary name.
    if (score < 500 && n.includes(q)) {
      score = 500 + Math.min(80, (c.population || 0) / 50000);
      matchedVia = matchedVia || 'substring';
    }

    // Stage C — Levenshtein on a short prefix.
    if (score < 300 && prefixProbe.length >= 4 && n.length >= prefixProbe.length) {
      const d = levenshteinBounded(prefixProbe, n.slice(0, prefixProbe.length), 2);
      if (d >= 0 && d <= 2) {
        score = 300 + Math.min(80, (c.population || 0) / 50000);
        matchedVia = matchedVia || `levenshtein(${d})`;
      }
    }

    // Stage D — substring on any alt-name (joined blob).
    if (score < 100 && c._normAltJoined && c._normAltJoined.includes(q)) {
      score = 100;
      matchedVia = matchedVia || 'alt-substring';
    }

    if (score > 0 && !seen.has(c.name + '|' + (c.admin || ''))) {
      seen.add(c.name + '|' + (c.admin || ''));
      out.push({ rec: c, score, matchedVia });
    }
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit).map(({ rec }) => ({
    name: rec.name,
    country: rec.country,
    admin: rec.admin,
    lat: rec.lat,
    lon: rec.lon,
    population: rec.population,
  }));
}

// Public API ------------------------------------------------------------

/**
 * Resolve a free-form city string. Returns:
 *   { exact, city, country, state, population, lat, lon, suggestions }
 *
 * `exact` is true iff a normalized primary-name / compact / alt-name
 * match hits; in that case `city` is the canonical record name and the
 * caller can flip straight to "ready".
 */
function lookup(query) {
  const q = String(query || '').trim();
  if (q.length < 2) {
    return { exact: false, city: q, country: '', suggestions: [] };
  }
  const exact = findExact(q);
  if (exact) {
    const suggestions = searchSuggestions(q, 8).filter((s) => s.name !== exact.name).slice(0, 5);
    return {
      exact: true,
      city: exact.name,
      country: exact.country,
      state: exact.admin,
      population: exact.population,
      lat: exact.lat,
      lon: exact.lon,
      suggestions,
    };
  }
  const suggestions = searchSuggestions(q, 8);
  return {
    exact: false,
    city: q,
    country: '',
    suggestions,
  };
}

function getStatus() {
  return {
    ...status,
    records: cities.length,
    fileLoaded: status.fileLoaded,
  };
}

// Population-tier page budget used by the dork lead-discovery loop.
//
// Locked city (the one the user picked and confirmed):
//   population >= 1_000_000  ->  7 pages
//   population >=   500_000  ->  5 pages
//   population >=   100_000  ->  3 pages
//   population <    100_000  ->  2 pages
//
// Any nearby city visited during expansion follows a slimmer schedule:
//   population >=   500_000  ->  5 pages
//   otherwise                ->  2 pages
function pageBudgetFor(population, { locked = false } = {}) {
  const p = Number(population) || 0;
  if (locked) {
    if (p >= 1_000_000) return 7;
    if (p >= 500_000) return 5;
    if (p >= 100_000) return 3;
    return 2;
  }
  if (p >= 500_000) return 5;
  return 2;
}

// Return up to `limit` cities sharing the same admin region (state /
// province / country-region) as the locked city, sorted by population
// descending. Excludes any name in `excludeNames`. Used by the dork
// expansion step when the locked city is exhausted.
//
// Pure in-memory linear scan over the `cities[]` array. ~200k records
// → ~5 ms on a cold laptop, well under any request budget.
function getNearbyByAdmin({ admin, country, excludeNames = [], limit = 50 } = {}) {
  if (!admin || !country) return [];
  const exclude = new Set(excludeNames.map((n) => normalize(n)));
  const targetAdmin = normalize(admin);
  const out = [];
  for (let i = 0; i < cities.length; i++) {
    const c = cities[i];
    if (normalize(c.admin) !== targetAdmin) continue;
    if (c.country !== country) continue;
    if (exclude.has(normalize(c.name))) continue;
    out.push({
      name: c.name,
      country: c.country,
      admin: c.admin,
      lat: c.lat,
      lon: c.lon,
      population: c.population,
    });
    if (out.length >= limit) break;
  }
  out.sort((a, b) => (b.population || 0) - (a.population || 0));
  return out;
}

// Bulk list cities, filterable by ISO country and admin (state/province).
// Used by the SMS Google-Maps lead finder to populate the province → city
// dropdowns. Returns plain objects sorted by population descending.
//
//   listCities({ country: 'CA', admin: 'ON', limit: 100 })
//
// `country` accepts either a 2-letter ISO code ('CA') or a full name
// ('Canada'); we derive the ISO from the canonical name via the same
// `countryToIso` map used everywhere else in this file.
function listCities({ country, admin, limit = 500 } = {}) {
  if (!country && !admin) return [];
  const target = normaliseCountryForFilter(country);
  const targetAdmin = admin ? normalize(admin) : null;
  const out = [];
  for (let i = 0; i < cities.length; i++) {
    const c = cities[i];
    if (target) {
      const matches =
        (c.countryIso && c.countryIso.toUpperCase() === target.iso) ||
        (c.country && c.country.toLowerCase() === target.fullName.toLowerCase());
      if (!matches) continue;
    }
    if (targetAdmin && normalize(c.admin) !== targetAdmin) continue;
    out.push({
      name: c.name,
      country: c.country,
      countryIso: c.countryIso || null,
      admin: c.admin,
      lat: c.lat,
      lon: c.lon,
      population: c.population || 0,
    });
  }
  out.sort((a, b) => (b.population || 0) - (a.population || 0));
  return out.slice(0, Math.max(0, limit));
}

// Best-effort country-name -> ISO2 lookup. Returns null if unknown.
// Iterates COUNTRY_NAMES (iso -> full name) so we don't need a separate
// reverse map; ~200 entries, sub-millisecond.
function countryToIso(name) {
  if (!name) return null;
  const target = normalize(name);
  // Direct 2-letter code match (callers sometimes pass 'CA' or 'ca').
  const upper = target.toUpperCase();
  if (upper.length === 2 && COUNTRY_NAMES[upper]) {
    return upper;
  }
  for (const iso of Object.keys(COUNTRY_NAMES)) {
    if (normalize(COUNTRY_NAMES[iso]) === target) return iso;
  }
  return null;
}

// Accept either 'CA' / 'ca' or 'Canada' / 'canada' and produce a
// { iso, fullName } pair for comparison. `null` input returns null.
function normaliseCountryForFilter(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const upper = s.toUpperCase();
  if (upper.length === 2 && COUNTRY_NAMES[upper]) {
    return { iso: upper, fullName: COUNTRY_NAMES[upper] };
  }
  const iso = countryToIso(s) || '';
  return { iso, fullName: s };
}

// Decide the next city + page the user should see, based on the locked
// city and the list of cities the user has already had at least one page
// returned from.
//
// Returns one of:
//   { kind: 'same', name, country, admin, lat, lon, population, page, budget }
//     — still inside the locked city's page budget, walk the next page.
//   { kind: 'nearby', name, country, admin, lat, lon, population, page, budget }
//     — locked city budget is spent; jump to the next-best same-admin city,
//       page 1.
//   { kind: 'done' }
//     — locked city + all nearby same-admin cities exhausted.
function pickNextCity({ lockedCity, visited = [], pageInCity = {} }) {
  const lockedName = lockedCity?.name;
  if (!lockedName) return { kind: 'done' };

  const lockedBudget = pageBudgetFor(lockedCity.population, { locked: true });
  const visitedInLocked = Object.keys(pageInCity)
    .filter((k) => normalize(k) === normalize(lockedName))
    .map((k) => pageInCity[k])
    .reduce((a, b) => Math.max(a, b), 0);
  if (visitedInLocked < lockedBudget) {
    return {
      kind: 'same',
      name: lockedName,
      country: lockedCity.country,
      admin: lockedCity.admin,
      lat: lockedCity.lat,
      lon: lockedCity.lon,
      population: lockedCity.population,
      page: visitedInLocked + 1,
      budget: lockedBudget,
      isNearby: false,
    };
  }

  // Locked city budget is spent — try a same-admin nearby city.
  const visitedNames = visited.map((v) => (typeof v === 'string' ? v : v?.name)).filter(Boolean);
  const nearby = getNearbyByAdmin({
    admin: lockedCity.admin,
    country: lockedCity.country,
    excludeNames: [lockedName, ...visitedNames],
    limit: 1,
  });
  if (!nearby.length) return { kind: 'done' };
  const target = nearby[0];
  const budget = pageBudgetFor(target.population, { locked: false });
  return {
    kind: 'nearby',
    name: target.name,
    country: target.country,
    admin: target.admin,
    lat: target.lat,
    lon: target.lon,
    population: target.population,
    page: 1,
    budget,
    isNearby: true,
  };
}

// Kick off the GeoNames load at module import. We don't await it — the
// caller (server/index.js) can read its promise if it wants to know when
// the big DB is hot.
const loadPromise = loadCitiesFromGeoNames();

export {
  lookup,
  lookup as lookupCity,
  listCities,
  getStatus,
  loadPromise,
  pageBudgetFor,
  getNearbyByAdmin,
  pickNextCity,
};
export default {
  lookup,
  lookupCity: lookup,
  listCities,
  getStatus,
  loadPromise,
  pageBudgetFor,
  getNearbyByAdmin,
  pickNextCity,
};