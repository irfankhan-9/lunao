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

// In dev: '' (same-origin via Vite proxy to localhost:8787).
// In prod / tunnel: use the public API tunnel URL so the browser can
// call the API from any origin without CORS or proxy issues.
const API_BASE = (() => {
  // If we're not on localhost, use the public API tunnel.
  if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
    // The API tunnel URL — update this when you restart the tunnel.
    return 'https://slow-lines-start.loca.lt';
  }
  return ''; // same-origin dev proxy
})();

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
}

// Validate + parse a CSV File via the backend. Returns a full validation report
// (missing columns, per-row issues, valid leads) so the UI can gate the wizard.
export async function validateCsvFile(file: File): Promise<CsvValidation> {
  const text = await file.text();
  const res = await fetch(`${API_BASE}/api/csv/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: text,
  });
  if (!res.ok) throw new Error(`CSV parse failed (${res.status})`);
  const data = await res.json();
  if (data.validation) return data.validation as CsvValidation;
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
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/ai/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok || !res.body) throw new Error(`AI request failed (${res.status})`);

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
        if (event.type === 'chunk') {
          acc += event.delta || '';
          onChunk(acc, event.delta || '');
        } else if (event.type === 'thinking') {
          if (onThinking) onThinking(event.delta || '');
        } else if (event.type === 'done') {
          finalHtml = event.html || acc;
        } else if (event.type === 'error') {
          throw new Error(event.error || 'AI edit failed');
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
  const res = await fetch(`${API_BASE}/api/template-categories`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to load categories (${res.status})`);
  }
  const data = await res.json();
  return (data.categories || []) as TemplateCategory[];
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
  const qs = parentSlug ? `?parentSlug=${encodeURIComponent(parentSlug)}` : '';
  const res = await fetch(`${API_BASE}/api/site-history${qs}`);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to load site history (${res.status})`);
  }
  const d = await res.json();
  return d.history as SiteHistoryEntry[];
}

// Create a site history entry (Studio auto-saves after each AI generation).
export async function createSiteHistory(params: {
  parentSlug?: string;
  title?: string;
  niche?: string;
  html: string;
  snapshotLabel?: string;
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
}): Promise<ConvertToTemplateResult> {
  const res = await fetch(`${API_BASE}/api/site-history/${encodeURIComponent(params.historyId)}/convert-to-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: params.name,
      categoryId: params.categoryId ?? null,
      niche: params.niche ?? '',
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
  niche: string;
  templateId?: string;
  templateKey?: string;
  leadSource: 'csv' | 'places_api';
  targetVolume: number;
  city: string;
  category?: string;
  emailSubject?: string;
  emailBody?: string;
  csvSnapshot?: string;
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
  const res = await fetch(`${API_BASE}/api/email-campaigns/${encodeURIComponent(id)}`);
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

// List connected email accounts
export async function listEmailAccounts(ownerKey: string): Promise<ConnectedEmailAccountInfo[]> {
  const qs = new URLSearchParams({ ownerKey });
  const res = await fetch(`${API_BASE}/api/email-accounts?${qs.toString()}`);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to load email accounts (${res.status})`);
  }
  const d = await res.json();
  return d.accounts || [];
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
  const res = await fetch(`${API_BASE}/api/email-accounts/probe-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerKey }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Failed to probe accounts (${res.status})`);
  }
  const d = await res.json();
  return d.results || [];
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

// Initiate OAuth flow from frontend
export function initiateOAuthFlow(provider: 'gmail' | 'outlook'): void {
  const redirectUri = `${window.location.origin}/api/email-accounts/callback`;
  const state = btoa(JSON.stringify({ provider, timestamp: Date.now() }));

  const url = provider === 'gmail'
    ? getGmailOAuthUrl(redirectUri, state)
    : getOutlookOAuthUrl(redirectUri, state);

  window.location.href = url;
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
