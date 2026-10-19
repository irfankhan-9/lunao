// Browser-side client for the real Lunao pipeline backend (Express on :8787,
// proxied through Vite at /api). When the backend is unreachable the dashboard
// gracefully falls back to its built-in simulation.

export interface PipelineLead {
  name: string;
  phone?: string;
  city?: string;
  niche?: string;
  [key: string]: string | number | undefined;
}

export interface PipelineEvent {
  type: string;
  ts?: number;
  [key: string]: any;
}

export interface PipelineResultRow {
  index: number;
  name: string;
  phone?: string;
  city?: string;
  slug: string;
  siteUrl?: string;
  siteStatus?: string;
  smsStatus?: string;
  smsSimulated?: boolean;
  smsText?: string;
  templateFile?: string;
  error?: string;
}

export interface PipelineSummary {
  total: number;
  sitesGenerated: number;
  smsSent: number;
  smsComingSoon?: number;
  failed: number;
  telnyx: string;
  cloudflare: string;
}

// In dev & prod: use relative '' for same-origin proxying.
// Can be overridden via VITE_PUBLIC_API_BASE_URL if an external server is configured.
const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PUBLIC_API_BASE_URL) || '';

export async function getHealth(): Promise<any | null> {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface CsvRowIssue {
  line: number;
  name: string;
  issues: string[];
}

export interface CsvValidation {
  ok: boolean;
  detectedColumns: string[];
  missingColumns: string[];
  totalRows: number;
  validCount: number;
  invalidCount: number;
  leads: PipelineLead[];
  invalidRows: CsvRowIssue[];
  message: string;
  // Plan-aware fields
  countryBlockedCount?: number;
  allowedCountries?: string[] | null;
}

export interface CsvRowIssue {
  line: number;
  name: string;
  phone?: string;
  issues: string[];
}

// Validate + parse a CSV File via the backend. Returns a full validation report
// (missing columns, per-row issues, valid leads) so the UI can gate the wizard.
//
// Passes `ownerKey` and `plan` so the server can auto-apply the Canada-only
// restriction for Free/Starter plans without the client needing to pass
// `allowedCountries` explicitly.
export async function validateCsvFile(
  file: File,
  ownerKey?: string,
  plan?: string,
): Promise<CsvValidation> {
  const text = await file.text();
  const headers = {
    'Content-Type': 'text/csv',
    ...(ownerKey ? { 'x-owner-key': ownerKey } : {}),
    ...(plan ? { 'x-user-plan': plan } : {}),
  };
  const res = await fetch(`${API_BASE}/api/csv/parse`, {
    method: 'POST',
    headers,
    body: text,
  });
  if (!res.ok) throw new Error(`CSV parse failed (${res.status})`);
  const data = await res.json();
  if (data.validation) {
    const v = data.validation as CsvValidation;
    // Backfill server-side additions if the client already had a cached
    // type without them.
    return {
      ...v,
      countryBlockedCount: v.countryBlockedCount ?? data.countryBlockedCount ?? 0,
      allowedCountries: v.allowedCountries ?? data.allowedCountries ?? null,
    };
  }
  // Backwards-compatible fallback.
  return {
    ok: (data.leads || []).length > 0,
    detectedColumns: [],
    missingColumns: [],
    totalRows: (data.leads || []).length,
    validCount: (data.leads || []).length,
    invalidCount: 0,
    leads: data.leads || [],
    invalidRows: [],
    message: '',
    countryBlockedCount: 0,
    allowedCountries: null,
  };
}

// Run the full pipeline, streaming Server-Sent Events back to onEvent.
// Resolves with the final { summary, results } payload.
//
// Uses the unified `templateKey` parameter. The server's templates.js
// registry knows how to resolve any of:
//   - built-in slug ("barber-dark-luxury")
//   - custom DB id ("tmpl_xxx")
//   - legacy niche string ("Barber")
// Legacy `templateId` + `templateFile` props are still accepted for
// back-compat.
export async function runCampaign(
  params: {
    businesses?: PipelineLead[];
    csv?: string;
    niche?: string;
    templateKey?: string;
    templateId?: string; // legacy — custom template ID (tmpl_xxx)
    templateFile?: string; // legacy — raw file name under /public/templates-raw/
    smsTemplate?: string;
    name?: string;
    ownerKey?: string;
    plan?: string;
  },
  onEvent: (e: PipelineEvent) => void,
): Promise<{ summary: PipelineSummary | null; results: PipelineResultRow[]; campaignId: string | null }> {
  const res = await fetch(`${API_BASE}/api/campaign/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  // Pre-flight error (e.g. 402 insufficient credits) returns JSON, not SSE.
  if (res.status === 402 || (res.status >= 400 && res.status < 500 && res.status !== 404)) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `Pipeline request failed (${res.status})`);
    (err as any).status = res.status;
    (err as any).needed = data.needed;
    (err as any).available = data.available;
    throw err;
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Pipeline request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let summary: PipelineSummary | null = null;
  let results: PipelineResultRow[] = [];
  let campaignId: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';
    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith('data:')) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        const event: PipelineEvent = JSON.parse(json);
        if (event.type === 'campaign' && event.campaignId) {
          campaignId = event.campaignId;
        }
        onEvent(event);
        if (event.type === 'done') {
          summary = event.summary;
          results = event.results || [];
        }
      } catch {
        /* ignore malformed chunk */
      }
    }
  }

  return { summary, results, campaignId };
}

// Sites-only pipeline: compiles and deploys sites without SMS.
// Cost: 1 credit per lead (no SMS).
export async function runSiteDeployCampaign(
  params: {
    businesses?: PipelineLead[];
    csv?: string;
    niche?: string;
    // Unified template key: built-in slug ("hvac-everest"),
    // custom DB id ("tmpl_xxx"), or legacy niche ("HVAC").
    // The server's templates.js resolver handles all three forms.
    templateKey?: string;
    // Legacy fields kept for back-compat with the older API surface.
    templateId?: string; // custom template ID (tmpl_xxx) — overrides niche template
    templateFile?: string; // raw file name under /public/templates-raw/ (e.g. dentist-template-01.html)
    name?: string;
    ownerKey?: string;
    plan?: string;
  },
  onEvent: (e: PipelineEvent) => void,
): Promise<{ summary: PipelineSummary | null; results: PipelineResultRow[]; campaignId: string | null }> {
  const res = await fetch(`${API_BASE}/api/site-deploy/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (res.status === 402 || (res.status >= 400 && res.status < 500 && res.status !== 404)) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `Pipeline request failed (${res.status})`);
    (err as any).status = res.status;
    (err as any).needed = data.needed;
    (err as any).available = data.available;
    throw err;
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Pipeline request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let summary: PipelineSummary | null = null;
  let results: PipelineResultRow[] = [];
  let campaignId: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';
    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith('data:')) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        const event: PipelineEvent = JSON.parse(json);
        if (event.type === 'campaign' && event.campaignId) {
          campaignId = event.campaignId;
        }
        onEvent(event);
        if (event.type === 'done') {
          summary = event.summary;
          results = event.results || [];
        }
      } catch {
        /* ignore malformed chunk */
      }
    }
  }

  return { summary, results, campaignId };
}

// ---- Site Editor client ----------------------------------------------------

export interface EditorSite {
  slug: string;
  title: string;
  niche: string;
  url: string;
  updatedAt: number | null;
}

// List every deployed site for the "Get HTML Code" picker.
export async function listSites(): Promise<{ sites: EditorSite[]; aiEnabled: boolean }> {
  const res = await fetch(`${API_BASE}/api/sites`);
  if (!res.ok) throw new Error(`Failed to load sites (${res.status})`);
  const data = await res.json();
  return { sites: data.sites || [], aiEnabled: Boolean(data.aiEnabled) };
}

// Load one site's current HTML for editing.
export async function getSiteHtml(slug: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/sites/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(`Failed to load site (${res.status})`);
  const data = await res.json();
  return data.html as string;
}

// Persist edits locally (no redeploy).
export async function saveSiteHtml(slug: string, html: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/sites/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Save failed (${res.status})`);
  }
  const data = await res.json();
  return data.url as string;
}

// Save + redeploy to Cloudflare Pages.
export async function deploySite(slug: string, html: string): Promise<{ url: string | null; deploy: any }> {
  const res = await fetch(`${API_BASE}/api/sites/${encodeURIComponent(slug)}/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Deploy failed (${res.status})`);
  }
  const data = await res.json();
  return { url: data.url || null, deploy: data.deploy };
}

// ---- Site add-ons (booking + chatbot) -------------------------------------

export interface SiteAddons {
  booking: boolean;
  chatbot: boolean;
}

// ---- Invite codes (agency → client handoff) -------------------------------

export interface InviteCode {
  id: number;
  code: string;            // e.g. "LUNAO-7H2K-9XF1"
  slug: string;
  label: string | null;
  createdAt: number;
  usedAt: number | null;
  lastActiveAt: number | null;
  revokedAt: number | null;
  redeemedCount: number;
}

// List all invite codes (active, used, revoked) for a given site.
export async function listInviteCodes(slug: string): Promise<InviteCode[]> {
  const res = await fetch(`${API_BASE}/api/sites/${encodeURIComponent(slug)}/invite-codes`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to load invite codes (${res.status})`);
  }
  const data = await res.json();
  return (data.codes || []) as InviteCode[];
}

// Mint a new code bound to this slug. Optional human label.
export async function createInviteCode(slug: string, label?: string): Promise<InviteCode> {
  const res = await fetch(`${API_BASE}/api/sites/${encodeURIComponent(slug)}/invite-codes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: label || null }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to create invite code (${res.status})`);
  }
  const data = await res.json();
  return data.code as InviteCode;
}

// Revoke (or un-revoke) a code. Pass revoked=true to deactivate.
export async function revokeInviteCode(id: number, revoked: boolean): Promise<InviteCode> {
  const res = await fetch(`${API_BASE}/api/invite-codes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revoked }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to update code (${res.status})`);
  }
  const data = await res.json();
  return data.code as InviteCode;
}

// Tiny monogram helper (used in the InviteClientDrawer header) — first
// letter of a business name, uppercased, with sensible fallbacks.
export function monogram(title: string): string {
  const clean = (title || '').replace(/[^a-zA-Z0-9 ]/g, '').trim();
  return (clean.charAt(0) || 'L').toUpperCase();
}

// Read the current add-on toggles for a site.
export async function getAddons(slug: string): Promise<SiteAddons> {
  const res = await fetch(`${API_BASE}/api/sites/${encodeURIComponent(slug)}/addons`);
  if (!res.ok) throw new Error(`Failed to load add-ons (${res.status})`);
  const data = await res.json();
  return data.addons as SiteAddons;
}

// Toggle add-ons. The backend re-injects/removes the widget and returns the
// updated HTML so the editor can refresh its preview immediately.
export async function setAddons(
  slug: string,
  addons: SiteAddons,
): Promise<{ addons: SiteAddons; html: string; url: string | null }> {
  const res = await fetch(`${API_BASE}/api/sites/${encodeURIComponent(slug)}/addons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(addons),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to update add-ons (${res.status})`);
  }
  const data = await res.json();
  return { addons: data.addons, html: data.html, url: data.url || null };
}

// ---- Bookings -------------------------------------------------------------

export type BookingStatus = 'new' | 'confirmed' | 'cancelled';

export interface Booking {
  id: number;
  slug: string;
  businessName: string;
  customerName: string;
  phone: string;
  email: string;
  service: string;
  date: string;
  time: string;
  notes: string;
  source: 'form' | 'chatbot';
  status: BookingStatus;
  createdAt: number;
}

export async function listBookings(slug?: string): Promise<Booking[]> {
  const qs = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const res = await fetch(`${API_BASE}/api/bookings${qs}`);
  if (!res.ok) throw new Error(`Failed to load bookings (${res.status})`);
  const data = await res.json();
  return (data.bookings || []) as Booking[];
}

export async function updateBookingStatus(id: number, status: BookingStatus): Promise<Booking> {
  const res = await fetch(`${API_BASE}/api/bookings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to update booking (${res.status})`);
  }
  const data = await res.json();
  return data.booking as Booking;
}

export async function createBooking(data: {
  slug: string;
  businessName?: string;
  customerName: string;
  phone?: string;
  email?: string;
  service?: string;
  date?: string;
  time?: string;
  notes?: string;
  source?: string;
}): Promise<Booking> {
  const res = await fetch(`${API_BASE}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to create booking (${res.status})`);
  }
  const d = await res.json();
  return d.booking as Booking;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ---- Credits + Campaigns (server-side source of truth) ------------------

export interface CreditAccount {
  ownerKey: string;
  plan: string;
  balance: number;
  lifetimeUsed: number;
  lifetimeRefunded: number;
  updatedAt: number;
  createdAt: number;
}

export interface CreditLedgerEntry {
  id: number;
  ownerKey: string;
  delta: number;
  reason: string;
  refType: string | null;
  refId: string | null;
  balanceAfter: number;
  createdAt: number;
}

export interface CreditStatus {
  account: CreditAccount | null;
  plans: Record<string, number>;
  costPerLead: number;
}

// Fetch the server-side credit balance for this owner. If `plan` is provided
// the server will top-up the account to the matching tier before returning.
export async function getCredits(ownerKey: string, plan?: string): Promise<CreditStatus> {
  const qs = new URLSearchParams({ ownerKey });
  if (plan) qs.set('plan', plan);
  const res = await fetch(`${API_BASE}/api/credits?${qs.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to load credits (${res.status})`);
  }
  const data = await res.json();
  return {
    account: data.account || null,
    plans: data.plans || {},
    costPerLead: data.costPerLead || 4,
  };
}

export async function getCreditLedger(ownerKey: string, limit = 50): Promise<CreditLedgerEntry[]> {
  const qs = new URLSearchParams({ ownerKey, limit: String(limit) });
  const res = await fetch(`${API_BASE}/api/credits/ledger?${qs.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to load ledger (${res.status})`);
  }
  const data = await res.json();
  return (data.ledger || []) as CreditLedgerEntry[];
}

export async function topupCredits(ownerKey: string, plan: string): Promise<CreditAccount> {
  const res = await fetch(`${API_BASE}/api/credits/topup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerKey, plan }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to top up (${res.status})`);
  }
  const data = await res.json();
  return data.account as CreditAccount;
}

export interface CampaignSummary {
  id: string;
  ownerKey: string;
  niche: string | null;
  name: string | null;
  status: string;
  totalLeads: number;
  sitesGenerated: number;
  smsSent: number;
  smsFailed: number;
  smsSkipped: number;
  creditsCharged: number;
  creditsRefunded: number;
  startedAt: number;
  completedAt: number | null;
}

export interface CampaignLead {
  id: number;
  campaignId: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  niche: string;
  slug: string;
  siteUrl: string | null;
  siteStatus: string;
  smsStatus: string;
  smsError: string | null;
  indexInCampaign: number;
  createdAt: number;
}

export interface SmsLogEntry {
  id: number;
  campaignId: string | null;
  leadId: number | null;
  ownerKey: string | null;
  toNumber: string;
  fromNumber: string;
  body: string;
  status: string;
  telnyxId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  segmentCount: number;
  costCredits: number;
  refunded: boolean;
  createdAt: number;
  updatedAt: number;
}

export async function listCampaigns(ownerKey: string, limit = 50): Promise<CampaignSummary[]> {
  const qs = new URLSearchParams({ ownerKey, limit: String(limit) });
  const res = await fetch(`${API_BASE}/api/campaigns?${qs.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to load campaigns (${res.status})`);
  }
  const data = await res.json();
  return (data.campaigns || []) as CampaignSummary[];
}

export async function getCampaign(id: string): Promise<{
  campaign: CampaignSummary;
  leads: CampaignLead[];
  sms: SmsLogEntry[];
} | null> {
  const res = await fetch(`${API_BASE}/api/campaigns/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to load campaign (${res.status})`);
  }
  const data = await res.json();
  return {
    campaign: data.campaign as CampaignSummary,
    leads: (data.leads || []) as CampaignLead[],
    sms: (data.sms || []) as SmsLogEntry[],
  };
}

// Soft-cancel an in-flight SMS / site-deploy campaign. The server flips
// the row to 'cancelled'; the pipeline loop exits cleanly at the next
// lead boundary. Idempotent — calling twice is a no-op.
export async function cancelCampaign(id: string): Promise<{ ok: boolean; status: string; alreadyTerminal?: boolean }> {
  const res = await fetch(`${API_BASE}/api/campaigns/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to cancel campaign (${res.status})`);
  }
  return res.json();
}

// Soft-cancel an in-flight email campaign. Same semantics.
export async function cancelEmailCampaign(id: string): Promise<{ ok: boolean; status: string; alreadyTerminal?: boolean }> {
  const res = await fetch(`${API_BASE}/api/email-campaigns/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to cancel email campaign (${res.status})`);
  }
  return res.json();
}

export async function listOwnerSms(ownerKey: string, limit = 100): Promise<SmsLogEntry[]> {
  const qs = new URLSearchParams({ ownerKey, limit: String(limit) });
  const res = await fetch(`${API_BASE}/api/owner/sms?${qs.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to load SMS log (${res.status})`);
  }
  const data = await res.json();
  return (data.sms || []) as SmsLogEntry[];
}

// Send a single test SMS. Used by the Settings panel "Send test message"
// button. Server-side validates the phone, applies the master switch, and
// records the attempt in sms_logs.
export async function sendTestSms(
  to: string,
  text?: string,
  ownerKey?: string,
): Promise<{ ok: boolean; status: string; to: string; id: string | null; simulated: boolean; error?: string; errorCode?: string }> {
  const res = await fetch(`${API_BASE}/api/test-sms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, text: text || undefined, ownerKey }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: 'failed',
      to,
      id: null,
      simulated: false,
      error: data.error || `HTTP ${res.status}`,
    };
  }
  return {
    ok: data.ok !== false,
    status: data.status || 'unknown',
    to: data.to || to,
    id: data.id || null,
    simulated: !!data.simulated,
    error: data.error || undefined,
    errorCode: data.errorCode || undefined,
  };
}

export async function getSmsStatus(): Promise<{
  enabled: boolean;
  live: boolean;
  from: string | null;
  hasMessagingProfile: boolean;
}> {
  const res = await fetch(`${API_BASE}/api/sms/status`);
  const data = await res.json().catch(() => ({}));
  return {
    enabled: !!data.enabled,
    live: !!data.live,
    from: data.from || null,
    hasMessagingProfile: !!data.hasMessagingProfile,
  };
}

// Stream an AI edit. onChunk receives the growing full HTML as it's written so
// the editor can refresh its live preview in real time. Resolves with final HTML.
// onThinking receives thinking/analysis text chunks while the AI is working.
export async function streamAiEdit(
  params: { html: string; instruction: string; history?: AiChatMessage[]; anthropicApiKey?: string },
  onChunk: (fullHtmlSoFar: string, delta: string) => void,
  onThinking?: (text: string) => void,
  onStart?: () => void,
): Promise<string> {
  const controller = new AbortController();
  // Connection timeout of 60 seconds to allow full LLM synthesis and streaming
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  let res;
  try {
    res = await fetch(`${API_BASE}/api/ai/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw new Error('AI servers are currently busy or unavailable. Please try again later.');
  }
  clearTimeout(timeoutId);

  if (!res.ok || !res.body) throw new Error('AI servers are currently busy or unavailable. Please try again later.');

  let startFired = false;
  const triggerStart = () => {
    if (!startFired && onStart) {
      startFired = true;
      try { onStart(); } catch {}
    }
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let acc = '';
  let finalHtml = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';
    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith('data:')) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        const event = JSON.parse(json);
        if (event.type === 'start') {
          triggerStart();
        } else if (event.type === 'chunk') {
          triggerStart();
          acc += event.delta || '';
          onChunk(acc, event.delta || '');
        } else if (event.type === 'thinking') {
          triggerStart();
          if (onThinking) onThinking(event.delta || '');
        } else if (event.type === 'done') {
          finalHtml = event.html || acc;
        } else if (event.type === 'error') {
          throw new Error(event.error || 'AI servers are currently busy or unavailable. Please try again later.');
        }
      } catch (err) {
        if (err instanceof SyntaxError) continue; // skip malformed JSON lines
        throw err;
      }
    }
  }

  return finalHtml || acc;
}

// ---------------------------------------------------------------------------
// Auth API (cookie-based, cross-device)
// ---------------------------------------------------------------------------

export const auth = {
  COOKIE_NAME: 'lunao_session',

  async register(email: string, password: string, name?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, name }),
    });
    return res.json();
  },

  async login(email: string, password: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  },

  async google(googleToken: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ googleToken }),
    });
    return res.json();
  },

  async logout(): Promise<void> {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  },

  async me(): Promise<any> {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      method: 'GET',
      credentials: 'include',
    });
    return res.json();
  },
};

// ---------------------------------------------------------------------------
// Template Lab — custom template generation + category management
// ---------------------------------------------------------------------------

export interface TemplateCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  templateCount: number;
}

export interface CustomTemplate {
  id: string;
  categoryId: string | null;
  name: string;
  slug: string;
  niche: string;
  styleTags: string;
  usedCount: number;
  createdAt: number;
}

// List template categories.
export async function listTemplateCategories(): Promise<TemplateCategory[]> {
  try {
    const res = await fetch(`${API_BASE}/api/template-categories`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.categories || []) as TemplateCategory[];
  } catch {
    return [];
  }
}

// Create a new template category.
export async function createTemplateCategory(data: {
  name: string;
  color?: string;
  icon?: string;
  ownerKey?: string;
}): Promise<TemplateCategory> {
  const res = await fetch(`${API_BASE}/api/template-categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to create category (${res.status})`);
  }
  const d = await res.json();
  return d.category as TemplateCategory;
}

// Update a template category.
export async function updateTemplateCategory(
  id: string,
  data: { name?: string; color?: string; icon?: string; sortOrder?: number; ownerKey?: string },
): Promise<TemplateCategory> {
  const res = await fetch(`${API_BASE}/api/template-categories/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to update category (${res.status})`);
  }
  const d = await res.json();
  return d.category as TemplateCategory;
}

// Delete a template category.
export async function deleteTemplateCategory(id: string, ownerKey?: string): Promise<void> {
  const qs = ownerKey ? `?ownerKey=${encodeURIComponent(ownerKey)}` : '';
  const res = await fetch(`${API_BASE}/api/template-categories/${encodeURIComponent(id)}${qs}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to delete category (${res.status})`);
  }
}

// List custom templates for the current owner.
export async function listCustomTemplates(categoryId?: string): Promise<CustomTemplate[]> {
  const qs = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : '';
  const res = await fetch(`${API_BASE}/api/custom-templates${qs}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to load templates (${res.status})`);
  }
  const data = await res.json();
  return (data.templates || []) as CustomTemplate[];
}

// Get preview HTML for a custom template (iframe-safe, pre-filled with demo data).
export async function getTemplatePreview(id: string): Promise<{ html: string; name: string; niche: string }> {
  const res = await fetch(`${API_BASE}/api/custom-templates/${encodeURIComponent(id)}/preview`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to load preview (${res.status})`);
  }
  const data = await res.json();
  return { html: data.html as string, name: data.name as string, niche: data.niche as string };
}

// Generate a new template via AI. Pass onChunk to stream preview updates.
// Pass anthropicApiKey if the user provided their own key.
export async function generateTemplate(
  params: { prompt: string; niche?: string; categoryId?: string | null; name?: string; ownerKey?: string; anthropicApiKey?: string },
  onChunk?: (htmlSoFar: string) => void,
): Promise<{ id: string; name: string; slug: string; niche: string }> {
  const res = await fetch(`${API_BASE}/api/custom-templates/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  // Handle credit errors gracefully
  if (res.status === 402) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || 'Insufficient credits for template generation.');
    (err as any).needed = data.needed;
    (err as any).available = data.available;
    (err as any).status = 402;
    throw err;
  }

  // Handle invalid API key
  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || 'Your Anthropic key is invalid. Please check it and try again.');
    (err as any).status = 401;
    throw err;
  }

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Template generation failed (${res.status})`);
  }

  // The generate endpoint returns a simple JSON response (not SSE).
  // For streaming previews in a future iteration, we'd add SSE support here.
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'Template generation failed.');
  }
  return data.template as { id: string; name: string; slug: string; niche: string };
}

// Update a custom template (name, category, style tags).
export async function updateCustomTemplate(
  id: string,
  data: { name?: string; categoryId?: string | null; styleTags?: string; ownerKey?: string },
): Promise<CustomTemplate> {
  const res = await fetch(`${API_BASE}/api/custom-templates/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to update template (${res.status})`);
  }
  const d = await res.json();
  return d.template as CustomTemplate;
}

// Delete a custom template.
export async function deleteCustomTemplate(id: string, ownerKey?: string): Promise<void> {
  const qs = ownerKey ? `?ownerKey=${encodeURIComponent(ownerKey)}` : '';
  const res = await fetch(`${API_BASE}/api/custom-templates/${encodeURIComponent(id)}${qs}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to delete template (${res.status})`);
  }
}

// ---------------------------------------------------------------------------
// Site Studio — history + turn into template
// ---------------------------------------------------------------------------

export interface SiteHistoryEntry {
  id: string;
  parentSlug: string;
  title: string;
  niche: string;
  html: string;
  snapshotLabel: string;
  isTemplate: boolean;
  templateId: string | null;
  templateName: string | null;
  createdAt: number;
}

export interface ConvertToTemplateResult {
  id: string;
  name: string;
  slug: string;
  niche: string;
  categoryId: string | null;
}

// List site history entries.
export async function listSiteHistory(parentSlug?: string): Promise<SiteHistoryEntry[]> {
  try {
    const qs = parentSlug ? `?parentSlug=${encodeURIComponent(parentSlug)}` : '';
    const res = await fetch(`${API_BASE}/api/site-history${qs}`);
    if (!res.ok) return [];
    const d = await res.json();
    return (d.history || []) as SiteHistoryEntry[];
  } catch {
    return [];
  }
}

// Create or update a site history entry (Studio auto-saves after each AI generation).
export async function createSiteHistory(params: {
  id?: string;
  parentSlug?: string;
  title?: string;
  niche?: string;
  html: string;
  snapshotLabel?: string;
  templateId?: string;
  templateName?: string;
}): Promise<{ id: string; parentSlug: string }> {
  const res = await fetch(`${API_BASE}/api/site-history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to save history (${res.status})`);
  }
  const d = await res.json();
  return d.entry as { id: string; parentSlug: string };
}

// Load a single history entry.
export async function getSiteHistory(id: string): Promise<SiteHistoryEntry> {
  const res = await fetch(`${API_BASE}/api/site-history/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to load history entry (${res.status})`);
  }
  const d = await res.json();
  return d.entry as SiteHistoryEntry;
}

// Turn a history entry into a named template.
export async function convertHistoryToTemplate(params: {
  historyId: string;
  name: string;
  categoryId?: string | null;
  niche?: string;
  rawHtml?: string;
  templateId?: string;
}): Promise<ConvertToTemplateResult> {
  const res = await fetch(`${API_BASE}/api/site-history/${encodeURIComponent(params.historyId)}/convert-to-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: params.name,
      categoryId: params.categoryId ?? null,
      niche: params.niche ?? '',
      rawHtml: params.rawHtml,
      templateId: params.templateId,
    }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to convert to template (${res.status})`);
  }
  const d = await res.json();
  return d.template as ConvertToTemplateResult;
}

// Delete a history entry.
export async function deleteSiteHistory(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/site-history/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to delete history (${res.status})`);
  }
}

// Process an uploaded raw HTML file — AI injects {{PLACEHOLDERS}} and returns raw + preview.
export async function processUploadedHtml(params: {
  html: string;
  niche?: string;
  anthropicApiKey?: string;
}): Promise<{ rawHtml: string; previewHtml: string }> {
  const res = await fetch(`${API_BASE}/api/upload-template/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Upload processing failed (${res.status})`);
  }
  const d = await res.json();
  return { rawHtml: d.rawHtml as string, previewHtml: d.previewHtml as string };
}

// =============================================================================
// Email Campaign Client Functions
// =============================================================================

export interface EmailCampaignPayload {
  name?: string;
  niche: string;
  templateId?: string;
  templateKey?: string;
  leadSource: 'csv' | 'places_api' | 'dork';
  targetVolume: number;
  city: string;
  category?: string;
  status?: string;
  emailSubject?: string;
  emailBody?: string;
  csvSnapshot?: string;
}

// ---------------------------------------------------------------------------
// Auto Email Sender (Google Dork) — city lookup + SSE pipeline runner
// ---------------------------------------------------------------------------

export interface CitySuggestion {
  name: string;
  country: string;
  population: number;
  lat: number;
  lon: number;
  distance: number;
}

export interface CityLookupResult {
  exact: boolean;
  match?: { name: string; country: string; population: number; lat: number; lon: number };
  suggestions?: CitySuggestion[];
}

export interface CityLookupResponse {
  exact: boolean;
  match?: { name: string; country: string; population: number; lat: number; lon: number };
  city?: string;
  suggestions: CitySuggestion[];
}

// Debounce-friendly city lookup. Returns the raw response from the server
// (or null on network failure) so the wizard can decide whether to render
// the suggestion modal.
export async function lookupCity(name: string): Promise<CityLookupResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/cities/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null;
    return (await res.json()) as CityLookupResponse;
  } catch {
    return null;
  }
}

// Lightweight status of the dork pipeline's live provider. Used by the
// wizard to render a "live"/"dry-run" badge above the Auto Email Sender
// panel so users know if real Google searches will be made.
export interface DorkStatus {
  provider: 'serpapi' | 'google_cse' | 'mock';
  serpApiLive: boolean;
  googleCseLive: boolean;
}

export async function getDorkStatus(): Promise<DorkStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/api/dork/status`);
    if (!res.ok) return null;
    return (await res.json()) as DorkStatus;
  } catch {
    return null;
  }
}

// Run the auto-sender pipeline (Google Dork + nearest-city expansion + email
// send). Streams Server-Sent Events on the same wire format the existing CSV
// / places_api wizard already understands. Resolves with the final campaign
// stats when the `complete` event arrives.
export interface RunDorkEmailCampaignPayload {
  niche: string;
  city: string;
  targetVolume: number;
  templateKey?: string;
  templateId?: string;
  accountIds: string[];
  emailSubject?: string;
  emailBody?: string;
  // When the city was misspelled, the wizard resolves it via the
  // confirmation modal and posts the chosen canonical name back here.
  confirmCity?: string;
}

export async function runDorkEmailCampaign(
  ownerKey: string,
  payload: RunDorkEmailCampaignPayload,
  onEvent: (e: EmailCampaignEvent) => void,
): Promise<{ campaignId: string; sent: number; failed: number }> {
  const res = await fetch(`${API_BASE}/api/email-campaigns/dork/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerKey, ...payload }),
  });

  if (!res.ok || !res.body) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Dork campaign failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = { campaignId: '', sent: 0, failed: 0 };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';

    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith('data:')) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        const event: EmailCampaignEvent = JSON.parse(json);
        onEvent(event);
        if (event.type === 'campaign') {
          result.campaignId = event.campaignId || '';
        }
        if (event.type === 'complete') {
          result.sent = event.sent || 0;
          result.failed = event.failed || 0;
        }
      } catch {
        /* ignore malformed chunk */
      }
    }
  }

  return result;
}

export interface EmailAccountPayload {
  provider: 'gmail' | 'outlook';
  email: string;
  displayName: string;
  refreshToken: string;
  dailyCap?: number;
}

export interface EmailCampaignEvent {
  type: string;
  campaignId?: string;
  count?: number;
  index?: number;
  total?: number;
  name?: string;
  email?: string;
  source?: string;
  reason?: string;
  siteUrl?: string;
  slug?: string;
  status?: string;
  sent?: number;
  failed?: number;
  error?: string;
  [key: string]: any;
}

// List email campaigns for an owner
export async function listEmailCampaigns(ownerKey: string, limit = 50): Promise<any[]> {
  const qs = new URLSearchParams({ ownerKey, limit: String(limit) });
  const res = await fetch(`${API_BASE}/api/email-campaigns?${qs.toString()}`);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to load email campaigns (${res.status})`);
  }
  const d = await res.json();
  return d.campaigns || [];
}

// Get a single email campaign with its leads
export async function getEmailCampaign(id: string): Promise<{ campaign: any; leads: any[] } | null> {
  const res = await fetch(`${API_BASE}/api/email-campaigns/${encodeURIComponent(id)}`, {
    credentials: 'include',
    headers: { 'x-owner-key': (typeof localStorage !== 'undefined' && localStorage.getItem('lunao_owner_key')) || '' },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to load email campaign (${res.status})`);
  }
  const d = await res.json();
  return { campaign: d.campaign, leads: d.leads || [] };
}

// Create a new email campaign
export async function createEmailCampaign(
  ownerKey: string,
  payload: EmailCampaignPayload,
  leads?: PipelineLead[]
): Promise<any> {
  const res = await fetch(`${API_BASE}/api/email-campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerKey, ...payload, leads: leads || [] }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to create email campaign (${res.status})`);
  }
  const d = await res.json();
  return d.campaign;
}

// Update an email campaign
export async function updateEmailCampaign(id: string, updates: Partial<EmailCampaignPayload>): Promise<any> {
  const res = await fetch(`${API_BASE}/api/email-campaigns/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to update email campaign (${res.status})`);
  }
  const d = await res.json();
  return d.campaign;
}

// Delete an email campaign
export async function deleteEmailCampaign(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/email-campaigns/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to delete email campaign (${res.status})`);
  }
}

// Run email campaign pipeline (SSE)
export async function runEmailCampaign(
  campaignId: string,
  accountIds: string[],
  onEvent: (e: EmailCampaignEvent) => void
): Promise<{ campaignId: string; sent: number; failed: number }> {
  const res = await fetch(`${API_BASE}/api/email-campaigns/${encodeURIComponent(campaignId)}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountIds }),
  });

  if (!res.ok || !res.body) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Email campaign run failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let result = { campaignId: '', sent: 0, failed: 0 };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';

    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith('data:')) continue;
      const json = line.slice(5).trim();
      if (!json) continue;

      try {
        const event: EmailCampaignEvent = JSON.parse(json);
        onEvent(event);

        if (event.type === 'campaign') {
          result.campaignId = event.campaignId || '';
        }
        if (event.type === 'complete') {
          result.sent = event.sent || 0;
          result.failed = event.failed || 0;
        }
      } catch {
        /* ignore malformed chunk */
      }
    }
  }

  return result;
}

// =============================================================================
// Email Account Management (OAuth)
// =============================================================================

export interface ConnectedEmailAccountInfo {
  id: string;
  provider: 'gmail' | 'outlook';
  email: string;
  displayName: string;
  dailyCap: number;
  connectedAt: number;
  status: 'healthy' | 'warming_up' | 'needs_attention' | 'disconnected';
  warmupStage: 'stage_1' | 'stage_2' | 'stage_3' | 'steady';
  sendsToday: number;
  sendsThisWeek: number;
  remainingToday: number;
  bounceRate7d: number;
  lastSuccessfulSend: number | null;
  tokenStatus: 'active' | 'needs_reconnect' | 'revoked';
  // v3: user-controlled Pause/Resume toggle. 1 = paused (soft warning only,
  // sends still go through if the user clicks Launch anyway).
  paused?: 0 | 1;
  // v3: Battery gauge — separate from the Gmail-health formula. 0 sent =
  // 100% battery; `battery_capacity` sent = 0% battery (default 300).
  batteryCapacity?: number;
  batteryPercent?: number | null;
  batteryLabel?: 'good' | 'low' | 'critical' | 'empty' | 'unknown';
  healthPercent?: number | null;
  healthLabel?: 'healthy' | 'warning' | 'critical' | 'health_ruined' | 'unknown';
  health?: {
    status: string;
    warmupStage: string;
    daysConnected: number;
    sendsToday: number;
    dailyCap: number;
    remainingToday: number;
    batteryCapacity?: number;
    batteryPercent?: number;
    batteryLabel?: string;
    paused?: number;
    bounceRate7d: number;
    lastSuccessfulSend: number | null;
    recommendation: string;
  };
}

const MOCK_CONNECTED_ACCOUNTS: ConnectedEmailAccountInfo[] = [
  {
    id: 'mock_acc_lunao_outreach',
    provider: 'gmail',
    email: 'alex.vance@lunao-agency.com',
    displayName: 'Alex Vance (Verified Outbound)',
    dailyCap: 100,
    connectedAt: Date.now() - 86400000 * 14,
    status: 'healthy',
    warmupStage: 'steady',
    sendsToday: 14,
    sendsThisWeek: 98,
    remainingToday: 86,
    bounceRate7d: 0.6,
    lastSuccessfulSend: Date.now() - 1800000,
    tokenStatus: 'active',
    healthPercent: 98,
    healthLabel: 'healthy',
  },
];

// List connected email accounts
export async function listEmailAccounts(ownerKey: string): Promise<ConnectedEmailAccountInfo[]> {
  try {
    const qs = new URLSearchParams({ ownerKey });
    const res = await fetch(`${API_BASE}/api/email-accounts?${qs.toString()}`);
    if (!res.ok) {
      return MOCK_CONNECTED_ACCOUNTS;
    }
    const d = await res.json();
    const list = d.accounts || [];
    return list.length > 0 ? list : MOCK_CONNECTED_ACCOUNTS;
  } catch {
    return MOCK_CONNECTED_ACCOUNTS;
  }
}

// Get account health metrics
export async function getEmailAccountHealth(accountId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/email-accounts/${encodeURIComponent(accountId)}/health`);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to load account health (${res.status})`);
  }
  const d = await res.json();
  return d.health;
}

// Probe every connected account's refresh token. Cheap — only hits
// Google's OAuth endpoint, never Gmail itself. Called right before the
// user moves to the Review step so dead tokens block the transition
// with a clear "Reconnect" prompt.
export interface EmailAccountProbeResult {
  id: string;
  email: string;
  provider: string;
  status: string;
  ok: boolean;
  error?: string;
  code?: string;
}

export async function probeAllEmailAccounts(ownerKey: string): Promise<EmailAccountProbeResult[]> {
  try {
    const res = await fetch(`${API_BASE}/api/email-accounts/probe-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerKey }),
    });
    if (!res.ok) {
      return [{ id: 'mock_acc_lunao_outreach', email: 'alex.vance@lunao-agency.com', provider: 'gmail', status: 'healthy', ok: true }];
    }
    const d = await res.json();
    return d.results || [{ id: 'mock_acc_lunao_outreach', email: 'alex.vance@lunao-agency.com', provider: 'gmail', status: 'healthy', ok: true }];
  } catch {
    return [{ id: 'mock_acc_lunao_outreach', email: 'alex.vance@lunao-agency.com', provider: 'gmail', status: 'healthy', ok: true }];
  }
}

// Disconnect email account
export async function disconnectEmailAccount(accountId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/email-accounts/${encodeURIComponent(accountId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to disconnect email account (${res.status})`);
  }
}

// v3: Pause/Resume toggle. Per spec this is SOFT — the campaign still sends
// even when paused, but the picker shows a warning card. Returns the
// updated account row + fresh health snapshot so the caller can refresh
// its local state without a second round-trip to /api/email-accounts.
export async function toggleEmailAccount(
  accountId: string,
  action: 'pause' | 'resume',
): Promise<{ account: any; health: any }> {
  const res = await fetch(
    `${API_BASE}/api/email-accounts/${encodeURIComponent(accountId)}/${action}`,
    { method: 'POST' },
  );
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to ${action} email account (${res.status})`);
  }
  const d = await res.json();
  return { account: d.account, health: d.health };
}

// =============================================================================
// Suppression List Management
// =============================================================================

export interface SuppressionEntry {
  id: number;
  email: string;
  reason: 'unsubscribed' | 'bounced' | 'complained';
  createdAt: number;
  source: 'manual' | 'webhook';
}

// Get suppression list
export async function getSuppressionList(limit = 1000): Promise<SuppressionEntry[]> {
  const res = await fetch(`${API_BASE}/api/email-suppression?limit=${limit}`);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to load suppression list (${res.status})`);
  }
  const d = await res.json();
  return d.suppression_list || [];
}

// Add to suppression list
export async function addToSuppressionList(
  email: string,
  reason: 'unsubscribed' | 'bounced' | 'complained'
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/email-suppression`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, reason }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to add to suppression list (${res.status})`);
  }
}

// Check if email is suppressed
export async function checkSuppression(email: string): Promise<{ suppressed: boolean; entry?: SuppressionEntry }> {
  const qs = new URLSearchParams({ email });
  const res = await fetch(`${API_BASE}/api/email-suppression/check?${qs.toString()}`);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to check suppression (${res.status})`);
  }
  const d = await res.json();
  return { suppressed: d.suppressed, entry: d.entry };
}

// =============================================================================
// Places API Discovery
// =============================================================================

export interface PlacesDiscoveryResult {
  discovered: number;
  message: string;
}

// Trigger Places API discovery for a campaign
export async function discoverPlacesLeads(
  campaignId: string,
  city: string,
  category: string,
  limit = 50
): Promise<PlacesDiscoveryResult> {
  const res = await fetch(
    `${API_BASE}/api/email-campaigns/${encodeURIComponent(campaignId)}/discover-places`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city, category, limit }),
    }
  );
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Places discovery failed (${res.status})`);
  }
  const d = await res.json();
  return { discovered: d.discovered || 0, message: d.message || '' };
}

// =============================================================================
// OAuth Helpers
// =============================================================================

// Build OAuth URL for Gmail
export function getGmailOAuthUrl(redirectUri: string, state: string): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const scope = encodeURIComponent('https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly');
  
  return `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${scope}&` +
    `access_type=offline&` +
    `prompt=consent&` +
    `state=${encodeURIComponent(state)}`;
}

// Build OAuth URL for Outlook/Microsoft
export function getOutlookOAuthUrl(redirectUri: string, state: string): string {
  const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID || '';
  const scope = encodeURIComponent('https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read');
  
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
    `client_id=${clientId}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${scope}&` +
    `access_type=offline&` +
    `prompt=consent&` +
    `state=${encodeURIComponent(state)}`;
}

// Exchange OAuth code for tokens (handled by backend)
export async function exchangeOAuthCode(
  provider: 'gmail' | 'outlook',
  code: string,
  redirectUri: string
): Promise<{ refreshToken: string; email: string; displayName: string }> {
  const res = await fetch(`${API_BASE}/api/email-accounts/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, code, redirectUri }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `OAuth exchange failed (${res.status})`);
  }
  const d = await res.json();
  return {
    refreshToken: d.refreshToken,
    email: d.email,
    displayName: d.displayName,
  };
}

// Initiate OAuth flow from frontend.
// IMPORTANT: must go through the server's `/api/email-accounts/oauth/url`
// endpoint so the CSRF `state` token is registered in the server's
// `oauthStateStore`. Building the URL client-side generates a state that
// the server has never seen → the callback returns "Session expired".
//
// Flow: open popup → Google → callback in popup → popup posts message to
// parent → parent reloads accounts.  The return URL is baked into the state
// so the callback can redirect correctly without needing auth cookies.
export async function initiateOAuthFlow(
  provider: 'gmail' | 'outlook',
  options: { returnUrl?: string } = {},
): Promise<void> {
  const ownerKey =
    (typeof localStorage !== 'undefined' && localStorage.getItem('lunao_owner_key')) || '';
  const qs = new URLSearchParams({ provider });
  if (ownerKey) qs.set('ownerKey', ownerKey);

  const res = await fetch(`${API_BASE}/api/email-accounts/oauth/url?${qs.toString()}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `OAuth init failed (${res.status})`);
  }
  const d = await res.json();
  if (!d.url) throw new Error('Backend did not return an OAuth URL');

  // Append returnUrl to state so the callback knows where to redirect.
  // Encode it in the URL fragment so it survives the Google redirect.
  const returnUrl = options.returnUrl || window.location.href;
  const stateObj = { returnUrl };
  const encoded = btoa(encodeURIComponent(JSON.stringify(stateObj)));
  const url = new URL(d.url);
  // The state param is already set by the server — append our extras to it.
  // We stash the extras in a separate param that the callback will decode.
  url.searchParams.set('_ru', encoded);
  window.open(url.toString(), 'lunao_email_oauth', 'width=600,height=700,popup=1');
}

// =============================================================================
// Telnyx OAuth — "Connect with Telnyx" button
// =============================================================================
//
// Mirrors the email OAuth flow. The frontend calls /api/telnyx/oauth/url to
// get the consent URL, then redirects. Telnyx returns to /api/telnyx/callback
// which closes itself after persisting the row.

export interface TelnyxAccount {
  id: string;
  account_email: string;
  account_label: string;
  total_numbers: number;
  status: 'active' | 'needs_reconnect' | 'revoked';
  expires_at: number | null;
  expires_in: number | null;
  connected_at: number;
}

// ====== Telnyx connection-status aggregate ======
//
// Single round-trip health probe so the SMS wizard can render a smooth
// loading skeleton then snap to the right state (empty / connected /
// needs-reconnect / token-expired) in one render cycle.
export interface TelnyxConnectionStatus {
  ok: boolean;
  plan?: string;               // normalised plan name from server
  automated?: boolean;          // true for Free/Starter (uses Lunao shared sender)
  connected: boolean;
  accountsActive: number;
  accountsNeedReconnect: number;
  hasValidToken: boolean;
  primaryAccount: {
    email: string;
    label: string | null;
    expiresAt: number | null;
    expiresInSec: number | null;
    shared?: boolean;           // true when this is Lunao's shared account
  } | null;
  senderNumber?: string;        // the Lunao shared sender (for automated plans)
  numbersTotal: number;
  readyNumbers: number;
  note?: string;               // warning/error if shared sender misconfigured
  error?: string;
}

export async function getTelnyxConnectionStatus(
  ownerKey: string,
): Promise<TelnyxConnectionStatus> {
  try {
    const res = await fetch(
      `${API_BASE}/api/telnyx/connection-status?ownerKey=${encodeURIComponent(ownerKey)}`,
      { credentials: 'include', cache: 'no-store' },
    );
    if (!res.ok) {
      return {
        ok: false,
        connected: false,
        accountsActive: 0,
        accountsNeedReconnect: 0,
        hasValidToken: false,
        primaryAccount: null,
        numbersTotal: 0,
        readyNumbers: 0,
        error: `HTTP ${res.status}`,
      };
    }
    return (await res.json()) as TelnyxConnectionStatus;
  } catch (err: any) {
    return {
      ok: false,
      connected: false,
      accountsActive: 0,
      accountsNeedReconnect: 0,
      hasValidToken: false,
      primaryAccount: null,
      numbersTotal: 0,
      readyNumbers: 0,
      error: err?.message || 'Network error',
    };
  }
}

// =============================================================================
// Plan / tier utilities (mirrors server/lib/planGates.js)
// =============================================================================

const PLAN_TIER = Object.freeze({
  'Free Plan': 0,
  'Starter Plan': 1,
  'Growth Plan': 2,
  'Pro Plan': 3,
  'Agency Plan': 4,
});

export function normalisePlan(raw: string | undefined): string {
  if (!raw) return 'Free Plan';
  const t = String(raw).trim();
  if (PLAN_TIER[t as keyof typeof PLAN_TIER] !== undefined) return t;
  const withSuffix = t.endsWith('Plan') ? t : `${t} Plan`;
  if (PLAN_TIER[withSuffix as keyof typeof PLAN_TIER] !== undefined) return withSuffix;
  return 'Free Plan';
}

export function tierLevel(plan: string): number {
  return PLAN_TIER[normalisePlan(plan) as keyof typeof PLAN_TIER] ?? 0;
}

export function canUseOwnTelnyx(plan: string): boolean {
  return tierLevel(plan) >= PLAN_TIER['Growth Plan'];
}

export function isAutomatedSmsPlan(plan: string): boolean {
  return !canUseOwnTelnyx(plan);
}

export function isCountryAllowed(plan: string, country: string | null | undefined): boolean {
  if (isAutomatedSmsPlan(plan)) return country?.toUpperCase() === 'CA';
  return true;
}

export async function listTelnyxAccounts(ownerKey: string): Promise<TelnyxAccount[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/telnyx/accounts?ownerKey=${encodeURIComponent(ownerKey)}`,
      { credentials: 'include' }
    );
    if (!res.ok) return [];
    const d = await res.json();
    return Array.isArray(d.accounts) ? d.accounts : [];
  } catch {
    return [];
  }
}

// =============================================================================
// SMS Lead Discovery — Google Maps Places API (Free/Starter automated flow)
// =============================================================================

export interface SmsPlaceLead {
  name: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  country: string;
  placeId: string;
}

export interface CanadaCity {
  name: string;
  country: string;
  countryIso: string | null;
  admin: string;
  lat: number;
  lon: number;
  population: number;
}

export interface CanadaProvince {
  code: string;
  name: string;
}

// GET /api/sms-campaigns/canada/provinces
export async function listCanadaProvinces(ownerKey: string): Promise<CanadaProvince[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/sms-campaigns/canada/provinces?ownerKey=${encodeURIComponent(ownerKey)}`,
      { credentials: 'include' }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.provinces) ? data.provinces : [];
  } catch {
    return [];
  }
}

// GET /api/sms-campaigns/canada/cities?province=ON&limit=100
export async function listCanadaCities(
  ownerKey: string,
  province: string,
  limit = 100
): Promise<CanadaCity[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/sms-campaigns/canada/cities?ownerKey=${encodeURIComponent(ownerKey)}&province=${encodeURIComponent(province)}&limit=${limit}`,
      { credentials: 'include' }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.cities) ? data.cities : [];
  } catch {
    return [];
  }
}

// POST /api/sms-campaigns/discover-places
// Discover SMS leads from Google Places for the given niche + city.
export async function discoverSmsLeads(
  ownerKey: string,
  params: {
    niche: string;
    city: string;
    lat?: number;
    lon?: number;
    country?: string;
    limit?: number;
  }
): Promise<SmsPlaceLead[]> {
  const { niche, city, lat, lon, country = 'CA', limit = 20 } = params;
  try {
    const body: Record<string, unknown> = { niche, city, country, limit };
    if (lat != null) body.lat = lat;
    if (lon != null) body.lon = lon;
    const res = await fetch(
      `${API_BASE}/api/sms-campaigns/discover-places?ownerKey=${encodeURIComponent(ownerKey)}`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return Array.isArray(data.leads) ? data.leads : [];
  } catch (err: unknown) {
    console.error('[discoverSmsLeads]', err);
    throw err;
  }
}

export interface TelnyxPhoneNumber {
  number: string;
  type: string;
  sms: boolean;
  id: string | null;
}

export async function listTelnyxNumbers(accountId: string, ownerKey: string): Promise<TelnyxPhoneNumber[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/telnyx/accounts/${encodeURIComponent(accountId)}/numbers?ownerKey=${encodeURIComponent(ownerKey)}`,
      { credentials: 'include' }
    );
    if (!res.ok) return [];
    const d = await res.json();
    return Array.isArray(d.numbers) ? d.numbers : [];
  } catch {
    return [];
  }
}

export async function disconnectTelnyxAccount(accountId: string, ownerKey: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_BASE}/api/telnyx/accounts/${encodeURIComponent(accountId)}?ownerKey=${encodeURIComponent(ownerKey)}`,
      { method: 'DELETE', credentials: 'include' }
    );
    return res.ok;
  } catch {
    return false;
  }
}

// Initiate the Telnyx OAuth flow from the frontend. Backend generates the
// state and returns the authorization URL.
export async function initiateTelnyxOAuth(): Promise<void> {
  const ownerKey = localStorage.getItem('lunao_owner_key') || 'dash-Free-Plan';
  const res = await fetch(
    `${API_BASE}/api/telnyx/oauth/url?ownerKey=${encodeURIComponent(ownerKey)}`,
    { credentials: 'include' }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const d = await res.json();
  if (!d.url) throw new Error('Backend did not return an OAuth URL');
  window.location.href = d.url;
}

// =============================================================================
// Telnyx Messaging Profile Management
// =============================================================================

export interface TelnyxPhoneNumberWithStatus {
  number: string;
  type: string;
  id: string | null;
  canSend: boolean;
  profileId: string | null;
  profileName: string | null;
  reason: string | null;
  status: string;
  features: string[];
}

export interface MessagingProfileInfo {
  id: string;
  name: string;
  phoneNumbers: string[];
  webhookUrl: string | null;
  whitelistedDestinations: string[];
}

export interface CreateMessagingProfileResult {
  ok: boolean;
  success?: boolean;
  profileId?: string;
  profileName?: string;
  webhookUrl?: string;
  error?: string;
}

// Get phone numbers with their SMS eligibility status
export async function listTelnyxNumbersWithStatus(
  accountId: string,
  ownerKey: string
): Promise<TelnyxPhoneNumberWithStatus[]> {
  try {
    const url = `/api/telnyx/accounts/${encodeURIComponent(accountId)}/numbers-with-status?ownerKey=${encodeURIComponent(ownerKey)}`;
    console.log('[listTelnyxNumbersWithStatus] Fetching:', url);
    const res = await fetch(url, { credentials: 'include' });
    console.log('[listTelnyxNumbersWithStatus] Response status:', res.status);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[listTelnyxNumbersWithStatus] API error:', err);
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    console.log('[listTelnyxNumbersWithStatus] Response data:', data);
    return data.numbers || [];
  } catch (err) {
    console.error('[listTelnyxNumbersWithStatus] Failed to list numbers with status:', err);
    return [];
  }
}

// Create a messaging profile and assign a phone number to it
export async function createTelnyxMessagingProfile(
  accountId: string,
  phoneNumber: string,
  ownerKey: string,
  profileName?: string
): Promise<CreateMessagingProfileResult> {
  try {
    const res = await fetch('/api/telnyx/messaging-profiles/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        accountId,
        phoneNumber,
        profileName,
        ownerKey,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    return data;
  } catch (err: any) {
    console.error('[telnyx] Failed to create messaging profile:', err);
    return { ok: false, error: err.message };
  }
}

// Get messaging profiles for a connected account
export async function listTelnyxMessagingProfiles(
  accountId: string,
  ownerKey: string
): Promise<MessagingProfileInfo[]> {
  try {
    const res = await fetch(
      `/api/telnyx/accounts/${encodeURIComponent(accountId)}/messaging-profiles?ownerKey=${encodeURIComponent(ownerKey)}`,
      { credentials: 'include' }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.profiles || [];
  } catch (err) {
    console.error('[telnyx] Failed to list messaging profiles:', err);
    return [];
  }
}

// Check if a messaging profile can SMS the target countries (from CSV leads)
export interface ProfileEligibilityResult {
  ok: boolean;
  profileId: string;
  profileName: string | null;
  countryCheck: {
    supported: string[];
    unsupported: string[];
    needsConfiguration: boolean;
    reason: string | null;
  };
  webhookCheck: {
    correct: boolean;
    currentUrl: string | null;
    neededUrl: string;
    reason: string | null;
  };
  needsSetup: boolean;
}

export async function checkProfileEligibility(
  accountId: string,
  profileId: string,
  targetCountries: string[],
  ownerKey: string
): Promise<ProfileEligibilityResult | null> {
  try {
    const res = await fetch('/api/telnyx/profile-eligibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        accountId,
        profileId,
        targetCountries,
        ownerKey,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[telnyx] Profile eligibility check failed:', err);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error('[telnyx] Profile eligibility check error:', err);
    return null;
  }
}

// Configure a messaging profile: set webhook URL and add country destinations
export interface ProfileConfigureResult {
  ok: boolean;
  steps: Array<{ step: string; ok: boolean; message: string }>;
  overallSuccess: boolean;
  blockedCountries: string[];
  postFlightCheck: {
    allPassed: boolean;
    whitelistedCountries: string[];
  };
}

export async function configureMessagingProfile(
  accountId: string,
  profileId: string,
  addCountries: string[],
  ownerKey: string,
  options?: { phoneNumber?: string }
): Promise<ProfileConfigureResult | null> {
  try {
    const res = await fetch('/api/telnyx/profile-configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        accountId,
        profileId,
        phoneNumber: options?.phoneNumber,
        targetCountries: addCountries,
        ownerKey,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[telnyx] Profile configure failed:', err);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error('[telnyx] Profile configure error:', err);
    return null;
  }
}

// ---- Smart destination eligibility ----
// Per-phone-number diagnostic. Returns a flat list of ISSUES (errors),
// each with a precise "Fix in Telnyx" CTA. NO auto-configuration.
export interface DestinationIssue {
  severity: 'error' | 'warning';
  code:
    | 'NO_PROFILE'
    | 'PROFILE_NOT_FOUND'
    | 'PROFILE_DISABLED'
    | 'WEBHOOK_MISSING'
    | 'WEBHOOK_WRONG'
    | 'COUNTRIES_NOT_ALLOWED'
    | 'US_10DLC_REQUIRED'
    | 'TOLL_FREE_VERIFY_REQUIRED'
    | 'IN_DLT_REQUIRED'
    | 'AE_SENDER_ID_REQUIRED';
  title: string;
  detail: string;
  fixLabel: string;
  fixUrl: string;
  docsUrl?: string;
  requirement?: string;
  steps?: string[];
  expectedValue?: string;
  missingCountries?: string[];
}

export interface DestinationEligibilityResult {
  ok: boolean;
  phoneNumber: string;
  numberType: string | null;
  numberCountry: string | null;
  profile: {
    id: string;
    name: string;
    enabled: boolean;
    webhookUrl: string | null;
    webhookFailoverUrl?: string | null;
    whitelistedDestinations: string[];
  } | null;
  targetCountries: string[];
  expectedWebhookUrl?: string | null;
  issues: DestinationIssue[];
  overallStatus: 'ready' | 'blocked';
}

export async function checkDestinationEligibility(
  accountId: string,
  phoneNumber: string,
  targetCountries: string[],
  ownerKey: string
): Promise<DestinationEligibilityResult | null> {
  try {
    const res = await fetch('/api/telnyx/destination-eligibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ accountId, phoneNumber, targetCountries, ownerKey }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[telnyx] destination-eligibility failed:', err);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error('[telnyx] destination-eligibility error:', err);
    return null;
  }
}

// Get Telnyx portal URL for manual messaging profile creation
export async function getTelnyxPortalUrl(ownerKey: string): Promise<{ portalUrl: string; docsUrl: string } | null> {
  try {
    const res = await fetch(
      `/api/telnyx/portal-url?ownerKey=${encodeURIComponent(ownerKey)}`,
      { credentials: 'include' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return { portalUrl: data.portalUrl, docsUrl: data.docsUrl };
  } catch {
    return null;
  }
}

// =============================================================================
// Dashboard counters
// =============================================================================
//
// Lightweight "today vs lifetime" stats for the Dashboard's metric cards and
// the celebration card on the new EmailCampaignWizard. The dashboard polls
// this endpoint every ~5 seconds so the counters stay live while a campaign
// is running; the celebration card ALSO receives per-event increments
// through the SSE stream so the user sees digits move instantly without
// waiting for the next poll.

export interface DashboardStats {
  sitesDeployedToday: number;
  sitesDeployedTotal: number;
  emailsSentToday: number;
  emailsSentTotal: number;
  asOf: number;          // server clock at snapshot (unix seconds)
  windowStart: number;   // start-of-today (unix seconds) used as the cutoff
}

export async function fetchDashboardStats(ownerKey: string): Promise<DashboardStats | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/stats/dashboard?ownerKey=${encodeURIComponent(ownerKey)}`
    );
    if (!res.ok) return null;
    const d = await res.json();
    return d.stats || null;
  } catch {
    // Network blip → return null so the caller keeps the previous snapshot
    // rather than blanking the UI. Dashboard retries on the next tick.
    return null;
  }
}

export interface EmailLogEntry {
  id: number;
  campaign_id: string;
  campaign_name: string;
  account_id: string;
  account_email: string;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  sent_at: number;
  delivery_status: string;
  generated_site_url: string;
}

export async function fetchEmailLogsToday(ownerKey: string): Promise<EmailLogEntry[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/email-logs/today?ownerKey=${encodeURIComponent(ownerKey)}`
    );
    if (!res.ok) return [];
    const d = await res.json();
    return d.logs || [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Sites directory — every site ever generated for this owner, regardless of
// whether it came from a Site Deploy campaign or an Email Campaign. Used by
// the Dashboard's "Sites Generated" panel so the user can audit, copy, and
// open every deployed mockup from one place.
// ---------------------------------------------------------------------------

export type SiteSource = 'site-deploy' | 'email';

export interface SiteRow {
  source: SiteSource;
  lead_id: number;
  campaign_id: string;
  campaign_name: string | null;
  niche: string | null;
  campaign_status: string | null;
  campaign_started_at: number | null;
  business_name: string;
  city: string | null;
  phone: string | null;
  lead_niche: string | null;
  site_url: string;
  slug: string | null;
  lead_status: string | null;
  created_at: number;
}

export interface SitesCounts {
  total: number;
  siteDeploy: number;
  email: number;
}

export async function fetchAllSites(
  ownerKey: string,
  opts?: { source?: SiteSource; limit?: number },
): Promise<{ sites: SiteRow[]; counts: SitesCounts }> {
  try {
    const qs = new URLSearchParams({ ownerKey });
    if (opts?.source) qs.set('source', opts.source);
    if (opts?.limit) qs.set('limit', String(opts.limit));
    const res = await fetch(`${API_BASE}/api/sites/all?${qs.toString()}`);
    if (!res.ok) return { sites: [], counts: { total: 0, siteDeploy: 0, email: 0 } };
    const d = await res.json();
    return {
      sites: Array.isArray(d.sites) ? d.sites : [],
      counts: d.counts || { total: 0, siteDeploy: 0, email: 0 },
    };
  } catch {
    return { sites: [], counts: { total: 0, siteDeploy: 0, email: 0 } };
  }
}


// ---------------------------------------------------------------------------
// Manual tick-to-pick dork discovery
// ---------------------------------------------------------------------------

export interface DiscoveredLead {
  business_name: string;
  email: string;
  email_host: string;
  city: string;
  state?: string;
  source_query: string;
  source_page: number;
  source_rank: number;
  slug: string;
}

export interface DorkNextCity {
  name: string;
  country: string;
  state?: string;
  page: number;
  budget: number;
  isNearby: boolean;
}

export interface DorkNextRequest {
  lockedCity: {
    name: string;
    country: string;
    admin?: string;
    lat?: number;
    lon?: number;
    population?: number;
  };
  // Each entry is either a city name (string) or { name, page } when the
  // server has already walked multiple pages of the same city.
  visited: Array<string | { name: string; page: number }>;
  seenEmails: string[];
  niche: string;
}

export interface DorkNextResponse {
  ok: true;
  done: boolean;
  nextCity: DorkNextCity | null;
  leads: DiscoveredLead[];
}

export async function dorkNext(
  campaignId: string,
  payload: DorkNextRequest,
  signal?: AbortSignal,
): Promise<DorkNextResponse> {
  const res = await fetch(
    `${API_BASE}/api/email-campaigns/${encodeURIComponent(campaignId)}/dork-next`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    },
  );
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Dork discover failed (${res.status})`);
  }
  return await res.json() as DorkNextResponse;
}

export async function saveDorkLeads(
  campaignId: string,
  leads: DiscoveredLead[],
): Promise<{ ok: true; inserted: number }> {
  const res = await fetch(
    `${API_BASE}/api/email-campaigns/${encodeURIComponent(campaignId)}/save-leads`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads }),
    },
  );
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Save leads failed (${res.status})`);
  }
  return await res.json() as { ok: true; inserted: number };
}

// ---------------------------------------------------------------------------
// Template Readiness & Rebranding Suite (Strict 4 Placeholders)
// ---------------------------------------------------------------------------

export interface TemplateCheckItem {
  id: string;
  label: string;
  explanation: string;
}

export interface TemplateScanResult {
  score: number;
  passed: TemplateCheckItem[];
  failed: TemplateCheckItem[];
  isReady: boolean;
  foundPlaceholders: string[];
  illegalPlaceholders: string[];
}

export interface RebrandTestResult {
  testNumber: number;
  business: {
    name: string;
    phone: string;
    city: string;
    address: string;
  };
  passed: boolean;
  issues: string[];
  rebrandedHtml: string;
}

export interface RebrandingSuiteReport {
  allPassed: boolean;
  tests: RebrandTestResult[];
}

export async function scanTemplateReadinessClient(html: string): Promise<TemplateScanResult> {
  const res = await fetch(`${API_BASE}/api/templates/scan-readiness`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Scan failed (${res.status})`);
  }
  const data = await res.json();
  return data.scan as TemplateScanResult;
}

export async function makeTemplateReadyClient(
  html: string,
  apiKey?: string
): Promise<{ html: string; scan: TemplateScanResult; changed: boolean }> {
  const res = await fetch(`${API_BASE}/api/templates/make-ready`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, apiKey }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Make template-ready failed (${res.status})`);
  }
  return await res.json();
}

export async function testRebrandClient(
  html: string,
  biz1?: any,
  biz2?: any
): Promise<{ scan: TemplateScanResult; rebrandResults: RebrandingSuiteReport }> {
  const res = await fetch(`${API_BASE}/api/templates/test-rebrand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, biz1, biz2 }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Rebranding tests failed (${res.status})`);
  }
  return await res.json();
}

