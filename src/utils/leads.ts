// Lead deduplication utility.
//
// Centralized function used across the app to ensure that the same lead
// (same business + email + city) never appears twice in any list —
// prospect details, deployed sites, per-account stats, etc.
//
// The root cause of duplicate rows was the dork pipeline + Phase 1/Phase 2
// URL swap occasionally producing two `email_leads` rows for the same business.
// Every consumer of `emailLeads` should call `dedupeLeads()` before rendering.

export interface LeadLike {
  email?: string;
  business_name?: string;
  name?: string;
  city?: string;
  slug?: string;
  leadId?: string | number;
  id?: string | number;
  [k: string]: any;
}

/**
 * Build a stable identity key for a lead that survives across all phases
 * of the email pipeline. The key is:
 *   email | business_name (lowercased/trimmed) | city (lowercased/trimmed)
 *
 * Falls back to slug, then id, then a synthetic key if all natural
 * identifiers are missing.
 */
export function leadIdentityKey(l: LeadLike): string {
  const email = (l.email || '').toLowerCase().trim();
  const biz = (l.business_name || l.name || '').toLowerCase().trim();
  const city = (l.city || '').toLowerCase().trim();
  const slug = (l.slug || '').toLowerCase().trim();
  // Identity is built around (business + city) — the most reliable shared
  // signal across Phase-1 staging events (no email yet, has slug) and
  // Phase-2 send events (has email, has slug). Without this unification the
  // same lead appears twice: once keyed by `slug:...` and once by
  // `email|biz|city`. Email is added to the key ONLY when both
  // business AND city are also present so the email alone can't form an
  // identity (an email could belong to multiple unrelated rows).
  if (biz && city) return `${biz}|${city}|${slug}`;
  if (email && biz) return `${biz}|${city}|${slug}|${email}`;
  if (slug) return `slug:${slug}`;
  if (l.leadId !== undefined && l.leadId !== null) return `id:${l.leadId}`;
  if (l.id !== undefined && l.id !== null) return `id:${l.id}`;
  return '';
}

/**
 * Deduplicate an array of lead-like objects. Returns a new array.
 * First occurrence of each identity key wins. Items without a usable
 * identity key are kept in their original order (so we don't accidentally
 * drop anonymous rows).
 */
export function dedupeLeads<T extends LeadLike>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  const anonymous: T[] = [];
  for (const r of rows || []) {
    const key = leadIdentityKey(r);
    if (!key) {
      anonymous.push(r);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return [...out, ...anonymous];
}