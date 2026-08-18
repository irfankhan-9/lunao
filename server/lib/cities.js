// Worldwide cities database for the auto email-sender pipeline.
//
// To keep the bundle small and dependency-free, we ship a curated
// ~13k-entry dataset inline (top cities worldwide by population +
// well-known regional capitals). Each row has:
//   name, ascii_name, country, lat, lon, population
//
// The dataset is loosely based on GeoNames cities1000 (CC-BY) trimmed
// to cities with population >= 1000 and deduplicated by name. For
// production-grade full coverage, drop a richer cities.json at
// server/data/cities.json and set CITIES_PATH to load it instead.
//
// The nearest-neighbor search works for any city in the dataset
// regardless of population — we just rank by haversine distance.
//
// API:
//   lookupCity(query)              -> { exact, match?, suggestions[] }
//   findNearestCities({lat,lon})   -> [{ name, country, lat, lon, distanceKm }]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FALLBACK_PATH = process.env.CITIES_PATH
  ? process.env.CITIES_PATH
  : path.join(__dirname, '..', 'data', 'cities.json');

// Bundled dataset — kept compact and inline. Roughly 13k entries.
import { CITIES_BUNDLED } from './citiesData.js';

let CITIES = null;
let LOAD_ERROR = null;

function loadCities() {
  if (CITIES) return CITIES;
  if (LOAD_ERROR) throw LOAD_ERROR;
  // Prefer the optional JSON file on disk if it exists.
  if (fs.existsSync(FALLBACK_PATH)) {
    try {
      const raw = fs.readFileSync(FALLBACK_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        CITIES = parsed;
        return CITIES;
      }
    } catch (err) {
      LOAD_ERROR = new Error(`Failed to load cities dataset at ${FALLBACK_PATH}: ${err.message}`);
      throw LOAD_ERROR;
    }
  }
  CITIES = CITIES_BUNDLED;
  return CITIES;
}

export function ensureCitiesLoaded() {
  const c = loadCities();
  return c.length;
}

/**
 * Look up a city by name. Returns:
 *   { exact: true, match: { name, country, population, lat, lon } }
 *   { exact: false, suggestions: [{ name, country, population, distance }] }
 */
export function lookupCity(query) {
  if (!query || typeof query !== 'string') {
    return { exact: false, suggestions: [] };
  }
  const c = loadCities();
  const q = query.trim().toLowerCase();
  if (!q) return { exact: false, suggestions: [] };

  // 1) Exact match (case-insensitive)
  for (let i = 0; i < c.length; i++) {
    const row = c[i];
    if (row.name.toLowerCase() === q || (row.ascii_name && row.ascii_name.toLowerCase() === q)) {
      return { exact: true, match: row };
    }
  }

  // 2) Prefix match — give a big bonus. This catches every "Liver" -> "Liverpool"
  //    case instantly without competing against tiny unrelated cities like
  //    "Lima" or "Liwa" (which are short names with the same Levenshtein
  //    distance but no prefix relationship).
  const prefixHits = [];
  for (let i = 0; i < c.length; i++) {
    const row = c[i];
    const n = row.name.toLowerCase();
    const a = (row.ascii_name || '').toLowerCase();
    if (n.startsWith(q) || a.startsWith(q)) prefixHits.push(row);
  }

  // 3) Fallback: Levenshtein distance to name + ascii_name, filtered to
  //    only cities within a reasonable length window. We exclude anything
  //    shorter than q-1 chars or longer than q+12 chars — this stops the
  //    short-junk ("Liwa", "Gove") from drowning the real candidates.
  const scored = [];
  const minLen = Math.max(1, q.length - 1);
  const maxLen = q.length + 12;
  for (let i = 0; i < c.length; i++) {
    const row = c[i];
    const n = row.name.toLowerCase();
    const a = (row.ascii_name || '').toLowerCase();
    if (n.length < minLen || n.length > maxLen) continue;
    if (a.length && (a.length < minLen || a.length > maxLen)) continue;
    const d = Math.min(levenshtein(q, n), levenshtein(q, a));
    scored.push({ row, d });
  }
  scored.sort((a, b) => a.d - b.d);

  // Compose final suggestion list. Prefix hits win by being placed first;
  // Levenshtein fillers come after. Dedupe by name+country.
  const seen = new Set();
  const final = [];
  const push = (row) => {
    const k = `${row.name}|${row.country}`;
    if (seen.has(k)) return;
    seen.add(k);
    final.push({
      name: row.name,
      country: row.country || '',
      population: row.population || 0,
      lat: row.lat,
      lon: row.lon,
      distance: 0,
    });
  };
  prefixHits.slice(0, 5).forEach(push);
  scored.slice(0, 10).forEach((s) => push(s.row));
  return { exact: false, suggestions: final.slice(0, 5) };
}

/**
 * Return the N nearest cities to a given lat/lon, optionally excluding
 * the originating city itself.
 */
export function findNearestCities({
  lat,
  lon,
  excludeNames = [],
  limit = 20,
  maxRadiusKm = 500,
}) {
  const c = loadCities();
  if (typeof lat !== 'number' || typeof lon !== 'number') return [];
  const excludeLower = new Set(excludeNames.map((n) => String(n).toLowerCase()));
  const out = [];
  for (const row of c) {
    if (excludeLower.has(String(row.name).toLowerCase())) continue;
    const d = haversineKm(lat, lon, row.lat, row.lon);
    if (d > maxRadiusKm) continue;
    out.push({ ...row, distanceKm: d });
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out.slice(0, limit);
}

// ---- private helpers ---------------------------------------------------------

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
