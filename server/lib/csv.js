// Minimal, dependency-free CSV parser tuned for lead lists.
// Handles quoted fields, embedded commas, and CRLF. Maps common header
// aliases (Name/Business, Phone/Tel, City/Location, etc.) to a normalized
// business record consumed by the compile engine.
const HEADER_ALIASES = {
  // Name variants
  name: 'name',
  business: 'name',
  business_name: 'name',
  businessname: 'name',
  'business name': 'name',
  company: 'name',
  company_name: 'name',
  'company name': 'name',
  // Short / brand variants
  short: 'business_name_short',
  business_name_short: 'business_name_short',
  short_name: 'business_name_short',
  brand: 'business_name_short',
  // Owner / contact
  owner: 'owner',
  contact: 'owner',
  contact_name: 'owner',
  // Phone variants
  phone: 'phone',
  phone_number: 'phone',
  phonenumber: 'phone',
  'phone number': 'phone',
  tel: 'phone',
  telephone: 'phone',
  mobile: 'phone',
  cell: 'phone',
  // City variants
  city: 'city',
  city_name: 'city',
  'city name': 'city',
  town: 'city',
  location: 'city',
  'city/state': 'city',
  // State
  state: 'state',
  state_code: 'state',
  region: 'state',
  // Niche / category
  niche: 'niche',
  category: 'niche',
  industry: 'niche',
  type: 'niche',
  // Email
  email: 'email',
  email_address: 'email',
  'email address': 'email',
  // Address
  address: 'address',
  street: 'address',
  street_address: 'address',
  // Years in business
  years: 'years_in_business',
  years_in_business: 'years_in_business',
  years_in_operation: 'years_in_business',
  established: 'years_in_business',
  // Instagram
  instagram: 'instagram_handle',
  instagram_handle: 'instagram_handle',
  instagram_handle: 'instagram_handle',
  ig: 'instagram_handle',
  // Facebook
  facebook: 'facebook_url',
  facebook_url: 'facebook_url',
  facebook_url: 'facebook_url',
  // Google rating / reviews
  rating: 'rating',
  google_rating: 'rating',
  score: 'rating',
  reviews: 'reviews',
  review_count: 'reviews',
  google_review_count: 'reviews',
  review_count: 'reviews',
  number_of_reviews: 'reviews',
};

// Normalize a header string: lowercase, strip BOM, collapse whitespace,
// and replace common separators with underscores so that
// "Phone Number", "phone-number", "phone_number", "Phone-Number"
// all resolve to the same canonical key.
function normalizeHeader(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/^\uFEFF/, '')       // strip BOM
    .replace(/[_\-\s]+/g, '_')    // separators → underscore
    .replace(/^_+|_+$/g, '');    // trim leading/trailing underscores
}

function parseLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseCsv(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const rawHeaders = parseLine(lines[0]);
  const headers = rawHeaders.map((h) => {
    const norm = normalizeHeader(h);
    return HEADER_ALIASES[norm] || norm;
  });

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const rec = {};
    headers.forEach((h, idx) => {
      if (cells[idx] !== undefined && cells[idx] !== '') rec[h] = cells[idx];
    });
    if (rec.name) rows.push(rec);
  }
  return rows;
}

// Count digits in a phone string (ignores +, spaces, dashes, parentheses).
function digitCount(value) {
  return (String(value || '').match(/\d/g) || []).length;
}

// Strip everything but digits, keeping a leading +.
function normalizePhone(raw) {
  const s = String(raw || '').trim();
  const plus = s.startsWith('+') ? '+' : '';
  return plus + s.replace(/\D/g, '');
}

// Canadian area codes (NANP). Mirrors the set in smsLeads.js — keep in
// sync if either is edited. Active geographic + overlay codes covering
// all 13 provinces/territories, plus non-geographic 600/622/867.
const CA_AREA_CODES = new Set([
  '204','226','236','249','250','289','306','343','365','367','368','403',
  '416','418','431','437','438','450','474','506','514','519','548','579',
  '581','587','604','613','639','647','672','683','705','709','778','780',
  '782','807','819','825','867','873','902','905','942',
]);

/**
 * Classify a raw phone number string by country.
 * Returns one of:
 *   'CA'    — NANP number in a Canadian area code (or +1 with CA area code)
 *   'US'    — NANP number but US area code
 *   'INTL'  — Recognised as a phone number but non-NANP
 *   null    — Too few digits to classify
 */
export function detectCountryFromPhone(raw) {
  const norm = normalizePhone(raw);
  const digits = norm.startsWith('+') ? norm.slice(1) : norm;

  if (norm.startsWith('+1') && digits.length === 11) {
    const area = digits.slice(1, 4);
    return CA_AREA_CODES.has(area) ? 'CA' : 'US';
  }
  if (norm.startsWith('+') && digits.length >= 7) {
    // Non-NANP international — strip the leading 1 if it's +1...
    if (digits.startsWith('1') && digits.length === 11) {
      const area = digits.slice(1, 4);
      return CA_AREA_CODES.has(area) ? 'CA' : 'US';
    }
    return 'INTL';
  }
  // No plus — assume NANP if 10/11 digits and starts with a valid area code.
  if (digits.length === 10 && /^[2-9]/.test(digits)) {
    const area = digits.slice(0, 3);
    return CA_AREA_CODES.has(area) ? 'CA' : 'US';
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    const area = digits.slice(1, 4);
    return CA_AREA_CODES.has(area) ? 'CA' : 'US';
  }
  if (digits.length >= 7) return 'INTL';
  return null;
}

const REQUIRED_FIELDS = [
  { key: 'name', label: 'Business Name' },
  { key: 'city', label: 'City Name' },
  { key: 'phone', label: 'Phone Number' },
];

// God-level CSV validator (no LLM). Confirms the sheet has the three required
// columns and that every row carries a usable business name, city and phone.
// Handles flexible header casing, spacing, separators, and BOM.
//
// `opts.allowedCountries` — optional array of ISO-2 codes (e.g. ['CA']). When
// provided, rows whose phone number is recognised as a different country are
// rejected with a `country_blocked` issue so the wizard can render a branded
// "Canada-only" error card.
export function validateCsv(text, opts = {}) {
  const { allowedCountries = null } = opts;
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const report = {
    ok: false,
    detectedColumns: [],
    missingColumns: REQUIRED_FIELDS.map((f) => f.label),
    totalRows: 0,
    validCount: 0,
    invalidCount: 0,
    leads: [],
    invalidRows: [],
    message: '',
    // Plan-aware stats: how many rows were rejected because their phone
    // number is in a country the user's plan does not support.
    countryBlockedCount: 0,
    allowedCountries: Array.isArray(allowedCountries) ? allowedCountries : null,
  };

  if (lines.length === 0) {
    report.message = 'This file is empty. Upload a CSV with a header row and at least one lead.';
    return report;
  }
  if (lines.length < 2) {
    report.message = 'No data rows found. Add a header row plus at least one lead below it.';
    return report;
  }

  const rawHeaders = parseLine(lines[0]);
  const headers = rawHeaders.map((h) => {
    const norm = normalizeHeader(h);
    return HEADER_ALIASES[norm] || norm;
  });
  report.detectedColumns = headers;

  // Which required columns are present?
  const present = new Set(headers);
  const missing = REQUIRED_FIELDS.filter((f) => !present.has(f.key));
  report.missingColumns = missing.map((f) => f.label);

  if (missing.length > 0) {
    report.message =
      `Your CSV is missing the required column${missing.length > 1 ? 's' : ''}: ` +
      `${missing.map((f) => f.label).join(', ')}. ` +
      'Add a header row with Business Name, City Name and Phone Number.';
    return report;
  }

  // Validate every data row.
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const rec = {};
    headers.forEach((h, idx) => {
      if (cells[idx] !== undefined && cells[idx] !== '') rec[h] = cells[idx];
    });

    // Skip fully blank lines silently.
    if (Object.keys(rec).length === 0) continue;

    report.totalRows += 1;
    const issues = [];
    if (!rec.name || !String(rec.name).trim()) issues.push('Missing business name');
    if (!rec.city || !String(rec.city).trim()) issues.push('Missing city name');
    if (!rec.phone || !String(rec.phone).trim()) {
      issues.push('Missing phone number');
    } else if (digitCount(rec.phone) < 7) {
      issues.push('Phone number needs at least 7 digits');
    } else if (allowedCountries && allowedCountries.length > 0) {
      // Plan-aware country gate. Only fires when the plan restricts
      // countries (Free/Starter = ['CA']). Tag the issue with a stable
      // reason code so the wizard can group them into a premium
      // "Canada-only" error card.
      const cc = detectCountryFromPhone(rec.phone);
      if (!cc) {
        issues.push(`Phone number "${rec.phone}" could not be recognised as a valid Canadian number`);
        report.countryBlockedCount += 1;
      } else if (!allowedCountries.includes(cc)) {
        const friendly = cc === 'US' ? 'American' : cc === 'INTL' ? 'international' : cc;
        issues.push(
          `Phone number is ${friendly} (${rec.phone}); Canadian numbers only`,
        );
        report.countryBlockedCount += 1;
      }
    }

    if (issues.length === 0) {
      report.leads.push(rec);
      report.validCount += 1;
    } else {
      report.invalidCount += 1;
      report.invalidRows.push({
        line: i + 1,
        name: rec.name || '(blank)',
        phone: rec.phone || '',
        issues,
      });
    }
  }

  if (report.totalRows === 0) {
    report.message = 'No data rows found below the header. Add at least one lead.';
    return report;
  }
  if (report.validCount === 0) {
    if (allowedCountries && report.countryBlockedCount > 0 &&
        report.countryBlockedCount === report.invalidCount) {
      report.message =
        `None of your rows are Canadian. ${report.invalidCount} row(s) were skipped because your plan ` +
        `only supports Canadian numbers. Upgrade or upload a list of Canadian leads to continue.`;
    } else {
      report.message =
        'None of your rows are valid. Every row needs a Business Name, City Name and a Phone Number.';
    }
    return report;
  }

  report.ok = true;
  if (report.countryBlockedCount > 0) {
    report.message =
      `${report.validCount} of ${report.totalRows} rows are ready. ` +
      `${report.countryBlockedCount} non-Canadian row(s) were skipped. ` +
      `Upgrade to Growth to send worldwide.`;
  } else {
    report.message =
      report.invalidCount > 0
        ? `${report.validCount} of ${report.totalRows} rows are ready. ${report.invalidCount} row(s) were skipped — fix them to include everyone.`
        : `All ${report.validCount} rows validated successfully.`;
  }
  return report;
}
