import { getEditorAuthHeaders } from './pipelineClient';

export interface ScraperInputRow {
  business_name: string;
  website: string;
  city?: string;
  phone?: string;
  email?: string;
  extra?: Record<string, string>;
}

export interface ScraperResultRow extends ScraperInputRow {
  status: 'pending' | 'found' | 'not_found' | 'no_website';
  mx_verified?: boolean;
  discovery_method?: string;
}

export interface ParsedScraperCsv {
  ok: boolean;
  rows: ScraperInputRow[];
  extraColumns: string[];
  error?: string;
}

const SCRAPER_HEADER_ALIASES: Record<string, keyof ScraperInputRow> = {
  name: 'business_name',
  business: 'business_name',
  business_name: 'business_name',
  businessname: 'business_name',
  company: 'business_name',
  company_name: 'business_name',
  website: 'website',
  site: 'website',
  url: 'website',
  web: 'website',
  website_url: 'website',
  site_url: 'website',
  domain: 'website',
  homepage: 'website',
  city: 'city',
  city_name: 'city',
  location: 'city',
  town: 'city',
  phone: 'phone',
  phone_number: 'phone',
  phonenumber: 'phone',
  tel: 'phone',
  telephone: 'phone',
  mobile: 'phone',
  email: 'email',
  email_address: 'email',
  e_mail: 'email',
  mail: 'email',
  contact_email: 'email',
};

function normalizeHeader(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/^\uFEFF/, '')
    .replace(/[_\-\s]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
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
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

/**
 * Parse a user-uploaded CSV containing businesses and website URLs.
 * Keeps standard fields normalized and preserves any extra columns.
 */
export function parseScraperCsv(text: string): ParsedScraperCsv {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      ok: false,
      rows: [],
      extraColumns: [],
      error: 'CSV must include a header row and at least one business row.',
    };
  }

  const rawHeaders = parseCsvLine(lines[0]);
  const mappedHeaders = rawHeaders.map((h) => {
    const norm = normalizeHeader(h);
    return SCRAPER_HEADER_ALIASES[norm] || null;
  });

  if (!mappedHeaders.includes('website')) {
    return {
      ok: false,
      rows: [],
      extraColumns: [],
      error: 'Missing a website column (e.g. website, site, url, or domain).',
    };
  }

  const extraColumns: string[] = [];
  rawHeaders.forEach((raw, idx) => {
    if (!mappedHeaders[idx] && raw) {
      extraColumns.push(raw);
    }
  });

  const rows: ScraperInputRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.every((c) => !c)) continue;

    const row: ScraperInputRow = {
      business_name: '',
      website: '',
      city: '',
      phone: '',
      email: '',
      extra: {},
    };

    rawHeaders.forEach((rawHeader, idx) => {
      const value = cells[idx] || '';
      const canonical = mappedHeaders[idx];
      if (canonical && canonical !== 'extra') {
        if (!row[canonical]) row[canonical] = value;
      } else if (rawHeader && row.extra) {
        row.extra[rawHeader] = value;
      }
    });

    if (!row.business_name && !row.website) continue;
    rows.push(row);
  }

  if (rows.length === 0) {
    return {
      ok: false,
      rows: [],
      extraColumns: [],
      error: 'No valid rows found in CSV.',
    };
  }

  const hasAnyWebsite = rows.some((r) => Boolean(r.website.trim()));
  if (!hasAnyWebsite) {
    return {
      ok: false,
      rows: [],
      extraColumns: [],
      error: 'No website URLs found in the uploaded rows.',
    };
  }

  return { ok: true, rows, extraColumns };
}

function escapeCsvCell(value: string): string {
  const s = String(value ?? '');
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build an RFC-4180 CSV string with business name, website, found email,
 * city, phone, status, and any extra columns from the uploaded file.
 */
export function buildScrapedCsv(
  rows: ScraperResultRow[],
  extraColumns: string[] = [],
): string {
  const baseHeaders = ['business_name', 'website', 'email', 'city', 'phone', 'status'];
  const allHeaders = [...baseHeaders, ...extraColumns];
  const headerLine = allHeaders.map(escapeCsvCell).join(',');
  const dataLines = rows.map((r) => {
    const baseValues = [
      r.business_name || '',
      r.website || '',
      r.email || '',
      r.city || '',
      r.phone || '',
      r.status || '',
    ];
    const extraValues = extraColumns.map((col) => r.extra?.[col] || '');
    return [...baseValues, ...extraValues].map(escapeCsvCell).join(',');
  });
  return [headerLine, ...dataLines].join('\r\n');
}

export function downloadScrapedCsv(
  rows: ScraperResultRow[],
  extraColumns: string[] = [],
  fileName = 'lunao-scraped-leads.csv',
): void {
  const csv = buildScrapedCsv(rows, extraColumns);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function crawlScraperBatch(
  rows: ScraperInputRow[],
  userPlan: string,
  signal?: AbortSignal,
): Promise<ScraperResultRow[]> {
  const headers: Record<string, string> = {
    ...getEditorAuthHeaders(),
    'Content-Type': 'application/json',
    ...(userPlan ? { 'x-user-plan': userPlan } : {}),
  };

  const res = await fetch('/api/email-scraper/crawl-batch', {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      plan: userPlan,
      rows: rows.map((r) => ({
        business_name: r.business_name,
        website: r.website,
        city: r.city || '',
        phone: r.phone || '',
        email: r.email || '',
      })),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }

  const returned = Array.isArray(data.results) ? data.results : [];
  return rows.map((orig, i) => {
    const item = returned[i] || {};
    return {
      ...orig,
      business_name: item.business_name || orig.business_name || '',
      website: item.website || orig.website || '',
      email: item.email || orig.email || '',
      city: item.city ?? orig.city ?? '',
      phone: item.phone ?? orig.phone ?? '',
      status: item.status || 'not_found',
      mx_verified: Boolean(item.mx_verified),
      discovery_method: item.discovery_method || '',
    };
  });
}
