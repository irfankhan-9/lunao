// Lunao real pipeline API server.
//   GET  /api/health                              -> integration mode
//   POST /api/compile                             -> compile one business
//   POST /api/campaign/run                        -> run full pipeline (SSE)
//   GET  /api/credits                             -> server-side credit balance
//   POST /api/credits/topup                       -> switch plan / refresh
//   GET  /api/credits/ledger                      -> per-user ledger
//   GET  /api/campaigns                           -> history for one owner
//   GET  /api/campaigns/:id                       -> campaign + leads + sms_logs
//   POST /api/test-sms                            -> send a single test SMS
//   POST /api/webhooks/telnyx                     -> inbound + delivery webhooks
//   POST /api/sites/:slug/deploy                  -> publish to Cloudflare
//   GET  /sites/<slug>/                           -> locally hosted compiled sites
//
//   POST /api/auth/register                       -> email + password signup
//   POST /api/auth/login                          -> email + password login
//   POST /api/auth/google                         -> Google OAuth token exchange
//   POST /api/auth/logout                         -> clear session cookie
//   GET  /api/auth/me                             -> current user from cookie
//
// In production it also serves the built frontend from /dist.
import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { PORT, SITES_DIR, ROOT_DIR, modeSummary, siteBaseUrl, telnyx, cloudflare, PUBLIC_API_BASE_URL } from './lib/config.js';
import { compileSite } from './lib/compile.js';
import { parseCsv, validateCsv } from './lib/csv.js';
import { runPipeline, COST_PER_LEAD, SITE_COST_PER_LEAD } from './lib/pipeline.js';
import { listSites, readSite, writeSite, siteExists, isValidSlug, titleFromHtml, nicheFromHtml } from './lib/sites.js';
import { publishBatch, validateCloudflareToken } from './lib/cloudflare.js';
import { streamEdit, isAiEnabled, cleanHtmlOutput } from './lib/anthropic.js';
import { createBooking, listBookings, updateBookingStatus } from './lib/bookings.js';
import { chatTurn } from './lib/chatbot.js';
import { getAddons, setAddons } from './lib/widget.js';
import { db } from './lib/db.js';
import {
  listCodes,
  createCode,
  findById,
  findByCode,
  findByCodeSafe,
  revokeCode,
  renameCode,
  touchCode,
  isValidCodeFormat,
} from './lib/inviteCodes.js';
import {
  ensureAccount,
  getAccount,
  listLedger,
  charge,
  refund,
  checkBalance,
  PLAN_BALANCE,
} from './lib/credits.js';
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  listLeads,
  listSmsForCampaign,
  listSmsForOwner,
  findSmsByTelnyxId,
  updateSmsStatus,
  logSmsAttempt,
  logInbound,
  markCampaignFailed,
  markCampaignCancelled,
} from './lib/campaigns.js';
import { sendSms, toE164, countSegments } from './lib/telnyx.js';
import {
  // Email Campaign imports
  createEmailCampaign,
  getEmailCampaign,
  listEmailCampaigns,
  updateEmailCampaignStatus,
  updateEmailCampaignCounts,
  addEmailLead,
  listEmailLeads,
  getLeadsPendingEmailDiscovery,
  getLeadsPendingSend,
  updateLeadEmail,
  updateLeadSiteUrl,
  assignLeadToAccount,
  updateLeadSendStatus,
  logEmailSend,
  addToSuppression,
  isEmailSuppressed,
  recordSend,
  canAccountSend,
  getNextAvailableAccount,
  markEmailCampaignCancelled,
  // Connected Email Accounts
  createEmailAccount,
  getEmailAccount,
  listEmailAccounts,
  updateEmailAccountStatus,
  updateAccountBounceRate,
  updateAccountLastSuccessfulSend,
  deleteEmailAccount,
  getAccountHealth,
  setEmailAccountPaused,
  probeEmailAccountToken,
  probeAllEmailAccountTokens,
} from './lib/emailCampaigns.js';
import {
  buildGmailAuthUrl,
  exchangeGmailCode,
  getGmailUserProfile,
  encryptRefreshTokenForStorage,
  decryptRefreshTokenForUse,
} from './lib/gmail.js';
import { googleOAuth } from './lib/config.js';
import {
  gateProtected,
  handleSiteGateLogin,
  handleSiteGateLogout,
  handleSiteGateStatus,
  gateHealth,
} from './lib/siteGate.js';
import {
  parseSessionCookie,
  verifySessionToken,
} from './lib/_archive_auth.js';

const app = express();
// Trust the first proxy hop (Railway / Cloudflare) so `req.secure`,
// `req.protocol`, and `req.ip` reflect the real client HTTPS.
app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use(express.text({ type: 'text/csv', limit: '5mb' }));
app.use(cookieParser());

// Permissive CORS so the Vite dev server (port 3000) can call the API.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

fs.mkdirSync(SITES_DIR, { recursive: true });

app.get('/api/health', async (_req, res) => {
  const health = {
    ok: true,
    mode: modeSummary(),
    templates: templatesCheck,
    cloudflare: { ok: cloudflare.live, token: null, project: null },
    telnyx: { ok: telnyx.live, apiKey: Boolean(telnyx.apiKey), from: Boolean(telnyx.from) },
  };
  if (!templatesCheck.ok) {
    health.ok = false;
    health.error = `Raw templates missing: ${templatesCheck.reason} at ${templatesCheck.path}. Campaigns will fail.`;
  }
  // Validate the Cloudflare token + project so the user can verify their config
  // in one GET request, without running a full campaign. This catches the
  // "Invalid access token [code: 9109]" failure mode that produces a blank
  // .pages.dev URL with no clear error.
  if (cloudflare.live) {
    try {
      const tokenCheck = await validateCloudflareToken();
      health.cloudflare.token = tokenCheck;
      health.cloudflare.project = cloudflare.project;
      if (!tokenCheck.ok) {
        health.ok = false;
        health.error = `Cloudflare: ${tokenCheck.reason}`;
        if (tokenCheck.fix) health.cloudflare.fix = tokenCheck.fix;
      }
    } catch (err) {
      health.cloudflare.token = { ok: false, reason: err.message };
    }
  }
  // Quick Telnyx token validity check (no side effects).
  if (telnyx.live) {
    try {
      const res2 = await fetch('https://api.telnyx.com/v2/messaging_phone_numbers?page[size]=1', {
        method: 'GET',
        headers: { Authorization: `Bearer ${telnyx.apiKey}` },
      });
      health.telnyx.apiValid = res2.ok;
      if (!res2.ok) {
        const data = await res2.json().catch(() => ({}));
        const firstError = data?.errors?.[0];
        health.telnyx.error = firstError?.detail || `HTTP ${res2.status}`;
        // Don't fail the overall health check — the API key might still be
        // valid for sending, just not for this read endpoint. The real test
        // is the next campaign.
      }
    } catch (err) {
      health.telnyx.apiValid = false;
      health.telnyx.error = err.message;
    }
  }
  health.gate = gateHealth();
  res.json(health);
});

// Compile a single business and return raw HTML (used for live preview/testing).
app.post('/api/compile', async (req, res) => {
  try {
    const { business, niche } = req.body || {};
    if (!business || !business.name) {
      return res.status(400).json({ ok: false, error: 'business.name is required' });
    }
    const { html, placeholders, resolved } = await compileSite(business, niche);
    res.json({
      ok: true,
      templateFile: resolved?.rawFile || null,
      templateKey: resolved?.key || null,
      templateName: resolved?.name || null,
      placeholders,
      html,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Validate + parse a raw CSV body. Returns a structured validation report so
// the dashboard can block launch and show precise, brand-consistent errors.
app.post('/api/csv/parse', (req, res) => {
  try {
    const text = typeof req.body === 'string' ? req.body : req.body?.csv;
    const report = validateCsv(text || '');
    res.json({
      ok: report.ok,
      count: report.validCount,
      leads: report.leads,
      validation: report,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Run the full campaign pipeline, streaming progress as Server-Sent Events.
// When ownerKey is provided we persist the campaign + per-lead + per-SMS rows
// to SQLite and enforce the credit balance server-side. Credits are charged
// up front; failed sites refund the 1 site credit, failed SMS refund the 3
// SMS credits. See server/lib/pipeline.js for the full lifecycle.
app.post('/api/campaign/run', async (req, res) => {
  const {
    businesses,
    csv,
    niche,
    templateId,
    templateKey,
    templateFile,
    smsTemplate,
    name,
    plan,
  } = req.body || {};

  // Resolve user identity: prefer cookie session, fall back to legacy ownerKey
  let ownerKey = req.body?.ownerKey || req.query?.ownerKey || null;
  if (!ownerKey) {
    const token = parseSessionCookie(req);
    if (token) {
      const payload = await verifySessionToken(token);
      if (payload) ownerKey = `user_${payload.sub}`;
    }
  }

  let leads = Array.isArray(businesses) ? businesses : [];
  if (!leads.length && csv) leads = parseCsv(csv);

  if (!leads.length) {
    return res.status(400).json({ ok: false, error: 'No businesses or CSV provided' });
  }

  // Pre-create the campaign row so the dashboard can poll its status even
  // before the first SSE event arrives. We do a *read-only* pre-flight
  // credit check before creating any rows, then charge exactly once with
  // the real campaign id once we have it. This guarantees:
  //   - 402 returns a clean JSON error (not SSE)
  //   - No orphan campaign rows on failure
  //   - Exactly one ledger entry per campaign
  let campaignId = null;
  let leadIds = [];
  if (ownerKey) {
    try {
      const acct = ensureAccount(ownerKey, plan);
      if (acct) {
        const totalCost = leads.length * COST_PER_LEAD;
        checkBalance(ownerKey, totalCost); // throws 402 on insufficient

        const c = createCampaign({
          ownerKey,
          niche,
          name: name || null,
          leads,
          smsTemplate,
          csv: typeof csv === 'string' ? csv : null,
        });
        campaignId = c.id;
        const stored = listLeads(c.id);
        leadIds = stored.map((l) => l.id);
        // Charge against the real campaign id. If this throws (race condition
        // where another campaign drained the account between check and
        // charge), the campaign row exists but no charge was made — the
        // pipeline will run for free. Acceptable for v1; the next iteration
        // moves the charge inside createCampaign() for full atomicity.
        charge(ownerKey, totalCost, 'campaign_charge', { type: 'campaign', id: campaignId });
      }
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ ok: false, error: err.message, needed: err.needed, available: err.available });
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  // Always echo the campaign id so the client can fetch /api/campaigns/:id.
  if (campaignId) send({ type: 'campaign', campaignId });

  try {
    await runPipeline({
      businesses: leads,
      niche,
      templateId,
      templateKey,
      templateFile,
      smsTemplate,
      onEvent: send,
      ownerKey,
      campaignId,
      leadIds,
    });
  } catch (err) {
    send({ type: 'error', error: err.message });
    if (campaignId) markCampaignFailed(campaignId, err.message);
  } finally {
    res.end();
  }
});

// ---- Site Deploy Pipeline ----------------------------------------------------
// Sites-only pipeline: compiles and deploys sites without SMS.
// Cost: SITE_COST_PER_LEAD = 1 credit per lead (no SMS).
app.post('/api/site-deploy/run', async (req, res) => {
  const {
    businesses,
    csv,
    niche,
    templateId,
    templateKey,
    templateFile,
    name,
    plan,
  } = req.body || {};

  let ownerKey = req.body?.ownerKey || req.query?.ownerKey || null;
  if (!ownerKey) {
    const token = parseSessionCookie(req);
    if (token) {
      const payload = await verifySessionToken(token);
      if (payload) ownerKey = `user_${payload.sub}`;
    }
  }

  let leads = Array.isArray(businesses) ? businesses : [];
  if (!leads.length && csv) leads = parseCsv(csv);

  if (!leads.length) {
    return res.status(400).json({ ok: false, error: 'No businesses or CSV provided' });
  }

  let campaignId = null;
  let leadIds = [];
  if (ownerKey) {
    try {
      const acct = ensureAccount(ownerKey, plan);
      if (acct) {
        const totalCost = leads.length * SITE_COST_PER_LEAD;
        checkBalance(ownerKey, totalCost);

        const c = createCampaign({
          ownerKey,
          niche,
          name: name || null,
          leads,
          smsTemplate: null,
          csv: typeof csv === 'string' ? csv : null,
          type: 'site-deploy',
        });
        campaignId = c.id;
        const stored = listLeads(c.id);
        leadIds = stored.map((l) => l.id);
        charge(ownerKey, totalCost, 'site_deploy_charge', { type: 'campaign', id: campaignId });
      }
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ ok: false, error: err.message, needed: err.needed, available: err.available });
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  if (campaignId) send({ type: 'campaign', campaignId });

  try {
    await runPipeline({
      businesses: leads,
      niche,
      templateId,
      templateKey,
      templateFile,
      skipSms: true,
      onEvent: send,
      ownerKey,
      campaignId,
      leadIds,
    });
  } catch (err) {
    send({ type: 'error', error: err.message });
    if (campaignId) markCampaignFailed(campaignId, err.message);
  } finally {
    res.end();
  }
});

// ---- Site Editor API -------------------------------------------------------

// All sites ever generated for this owner — across BOTH site-deploy campaigns
// AND email campaigns. Powers the Dashboard's "Sites Generated" panel so the
// user can see every deployed site, regardless of which campaign type
// produced it. Each row carries its `source` ('site-deploy' | 'email') so
// the UI can render separated badges and filter pills.
//
// IMPORTANT: this MUST be registered BEFORE the `/api/sites/:slug` catch-all
// below — otherwise Express matches "all" as a slug and returns 404.
app.get('/api/sites/all', authenticate, (req, res) => {
  try {
    const ownerKey = (() => {
      if (req.userId) return `user_${req.userId}`;
      const explicit = req.headers['x-owner-key'] || req.query.ownerKey || req.body?.ownerKey;
      if (explicit) return String(explicit).trim();
      return req.ownerKey || 'dashboard';
    })();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });

    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const sourceFilter = req.query.source; // 'site-deploy' | 'email' | undefined (all)

    const rows = [];

    if (!sourceFilter || sourceFilter === 'site-deploy') {
      // Site-deploy campaigns → live URLs in `campaign_leads.site_url`.
      const sdRows = db.prepare(`
        SELECT
          'site-deploy'                                  AS source,
          cl.id                                          AS lead_id,
          cl.campaign_id                                 AS campaign_id,
          c.name                                         AS campaign_name,
          c.niche                                        AS niche,
          c.status                                       AS campaign_status,
          c.started_at                                   AS campaign_started_at,
          cl.name                                        AS business_name,
          cl.city                                        AS city,
          cl.phone                                       AS phone,
          cl.niche                                       AS lead_niche,
          cl.site_url                                    AS site_url,
          cl.slug                                        AS slug,
          cl.site_status                                 AS lead_status,
          cl.created_at                                  AS created_at
        FROM campaign_leads cl
        JOIN campaigns c ON c.id = cl.campaign_id
        WHERE c.owner_key = ?
          AND cl.site_url IS NOT NULL
          AND cl.site_url != ''
        ORDER BY cl.created_at DESC
        LIMIT ?
      `).all(ownerKey, limit);
      rows.push(...sdRows);
    }

    if (!sourceFilter || sourceFilter === 'email') {
      // Email campaigns → live URLs in `email_leads.generated_site_url`.
      const emRows = db.prepare(`
        SELECT
          'email'                                        AS source,
          el.id                                          AS lead_id,
          el.campaign_id                                 AS campaign_id,
          ec.email_subject                               AS campaign_name,
          ec.niche                                       AS niche,
          ec.status                                      AS campaign_status,
          ec.started_at                                  AS campaign_started_at,
          el.business_name                               AS business_name,
          el.city                                        AS city,
          el.phone                                       AS phone,
          ec.niche                                       AS lead_niche,
          el.generated_site_url                          AS site_url,
          el.slug                                        AS slug,
          el.send_status                                 AS lead_status,
          COALESCE(el.sent_at, el.created_at)            AS created_at
        FROM email_leads el
        JOIN email_campaigns ec ON ec.id = el.campaign_id
        WHERE ec.user_id = ?
          AND el.generated_site_url IS NOT NULL
          AND el.generated_site_url != ''
        ORDER BY COALESCE(el.sent_at, el.created_at) DESC
        LIMIT ?
      `).all(ownerKey, limit);
      rows.push(...emRows);
    }

    // Aggregate counts for the header pills.
    const counts = {
      total: rows.length,
      siteDeploy: rows.filter(r => r.source === 'site-deploy').length,
      email: rows.filter(r => r.source === 'email').length,
    };

    // Sort merged rows newest-first so the UI shows the freshest site at the top.
    rows.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    res.json({ ok: true, sites: rows, counts });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// List all deployed sites (for the "Get HTML Code" picker).
app.get('/api/sites', async (_req, res) => {
  try {
    const sites = await listSites();
    res.json({ ok: true, sites, aiEnabled: isAiEnabled() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Load one site's current HTML for editing.
app.get('/api/sites/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    if (!isValidSlug(slug) || !(await siteExists(slug))) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    const html = await readSite(slug);
    res.json({ ok: true, slug, html });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Save edits to a site (persist locally; does NOT redeploy).
app.put('/api/sites/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const html = req.body?.html;
    if (!isValidSlug(slug) || !(await siteExists(slug))) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    if (typeof html !== 'string' || !html.trim()) {
      return res.status(400).json({ ok: false, error: 'html is required' });
    }
    const url = await writeSite(slug, html);
    res.json({ ok: true, slug, url });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Save + redeploy a site to Cloudflare Pages (live).
app.post('/api/sites/:slug/deploy', async (req, res) => {
  try {
    const { slug } = req.params;
    const html = req.body?.html;
    if (!isValidSlug(slug) || !(await siteExists(slug))) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    if (typeof html === 'string' && html.trim()) {
      await writeSite(slug, html);
    }
    const result = await publishBatch();
    const url = `${result.deploymentUrl || ''}` || null;
    res.json({ ok: true, slug, deploy: result, url });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// AI code edit (SSE). Streams Claude's HTML output chunk-by-chunk so the
// editor can refresh its live preview as the code is written.
// Supports user-supplied anthropicApiKey for BYOK usage.
app.post('/api/ai/edit', async (req, res) => {
  const { html, instruction, history, anthropicApiKey } = req.body || {};

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  // Require either a user-supplied key or a server-side key
  const hasUserKey = typeof anthropicApiKey === 'string' && anthropicApiKey.trim().length > 10;
  if (!hasUserKey && !isAiEnabled()) {
    send({ type: 'error', error: 'AI editor needs an Anthropic key. Add yours below or configure ANTHROPIC_API_KEY on the server.' });
    return res.end();
  }
  if (typeof html !== 'string' || !html.trim() || typeof instruction !== 'string' || !instruction.trim()) {
    send({ type: 'error', error: 'html and instruction are required.' });
    return res.end();
  }

  try {
    send({ type: 'start' });
    const full = await streamEdit(
      { html, instruction, history, anthropicApiKey },
      (delta, isThinking) => {
        if (isThinking) {
          send({ type: 'thinking', delta });
        } else {
          send({ type: 'chunk', delta });
        }
      },
    );
    send({ type: 'done', html: cleanHtmlOutput(full) });
  } catch (err) {
    send({ type: 'error', error: err.message });
  } finally {
    res.end();
  }
});

// ---- Booking system API ----------------------------------------------------

// Create a booking (called by injected widgets on live sites + the chatbot).
app.post('/api/bookings', (req, res) => {
  try {
    const booking = createBooking(req.body || {});
    res.json({ ok: true, id: booking.id, booking });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// List bookings (dashboard), optionally filtered by site slug.
app.get('/api/bookings', (req, res) => {
  try {
    const slug = typeof req.query.slug === 'string' && req.query.slug ? req.query.slug : null;
    res.json({ ok: true, bookings: listBookings(slug) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update a booking's status (confirm / cancel).
app.patch('/api/bookings/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });
    const booking = updateBookingStatus(id, req.body?.status);
    res.json({ ok: true, booking });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ---- Booking chatbot -------------------------------------------------------

// One conversational turn. Body: { slug, sessionId?, message, businessName?, services? }
app.post('/api/chat', async (req, res) => {
  try {
    const result = await chatTurn(req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ---- Site add-ons (booking + chatbot widget toggles) -----------------------

app.get('/api/sites/:slug/addons', async (req, res) => {
  try {
    const { slug } = req.params;
    if (!isValidSlug(slug) || !(await siteExists(slug))) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    res.json({ ok: true, slug, addons: getAddons(slug) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/sites/:slug/addons', async (req, res) => {
  try {
    const { slug } = req.params;
    if (!isValidSlug(slug) || !(await siteExists(slug))) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    const booking = Boolean(req.body?.booking);
    const chatbot = Boolean(req.body?.chatbot);
    const result = await setAddons(slug, { booking, chatbot });
    res.json({ ok: true, slug, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ---- Site Gate (single hardcoded password unlocks the dashboard) ----------
// Replaces the previous email/Google/bcrypt/JWT auth flow. The gate sets a
// signed cookie (12h TTL) which is the only "session" the dashboard needs.
// See server/lib/siteGate.js for the full implementation.

app.post('/api/site-gate', handleSiteGateLogin);
app.post('/api/site-gate/logout', handleSiteGateLogout);
app.get('/api/site-gate/status', handleSiteGateStatus);

// Protect everything behind the gate. The site-gate routes, /api/health,
// /api/webhooks/telnyx, /sites/* static, and the static /assets/* are
// excluded inside gateProtected() so we never lock ourselves out.
//
// Browser entry points (/app, /dashboard) need to be protected too — without
// them, an unauthenticated visitor would just get the SPA shell, the SPA
// would see no cookie, and AppRouter would silently bounce them back to /.
const GATE_PROTECTED_PREFIXES = [
  '/app', '/dashboard', '/messages', '/campaigns', '/credits', '/bookings',
  '/sites', '/templates', '/templates-raw', '/ai', '/owner',
];
app.use(gateProtected(GATE_PROTECTED_PREFIXES));

// Diagnostic: confirm cookies are flowing in both directions. No secrets, no
// token values — just booleans + config flags. Safe to leave in for now.
app.get('/api/_diag/cookies', (req, res) => {
  const hasInbound = Boolean(req.headers.cookie);
  const gateCookieName = 'lunao_site_gate';
  const hasGate = Boolean(req.cookies?.[gateCookieName]);
  let hasOutbound = false;
  res.cookie('lunao_diag', '1', {
    httpOnly: true,
    secure: req.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60_000,
  });
  // Read back the header Express is about to send. express sets a single
  // Set-Cookie header per res.cookie() call.
  hasOutbound = Boolean(res.getHeaders()['set-cookie']);
  res.json({
    ok: true,
    inboundCookieHeader: hasInbound,
    inboundGateCookie: hasGate,
    outboundSetCookie: hasOutbound,
    reqProtocol: req.protocol,
    reqSecure: req.secure,
    nodeEnv: process.env.NODE_ENV,
    trustProxy: app.get('trust proxy'),
    xForwardedProto: req.headers['x-forwarded-proto'] || null,
    xForwardedFor: req.headers['x-forwarded-for'] || null,
    host: req.headers.host,
  });
});

// Middleware: require an authenticated dashboard session.
//
// In v2 the gate cookie (lunao_site_gate) is the only "session" we have —
// there is no per-user table anymore. Any caller that already passed the
// gateProtected() middleware is considered authenticated. The legacy
// `ownerKey` header/query/body is still honored for back-compat with the
// localStorage-based dashboard and the Owner App's dev-mode fallback.
async function authenticate(req, res, next) {
  const legacyKey = req.headers['x-owner-key'] || req.query.ownerKey || req.body?.ownerKey;
  if (legacyKey) {
    req.ownerKey = String(legacyKey);
    return next();
  }
  // gateProtected() sits in front of every API route that uses authenticate.
  // If we got here, the cookie is valid. Stamp req.userKey for handlers.
  req.userKey = 'dashboard';
  req.ownerKey = req.ownerKey || 'dashboard';
  next();
}

// Serve the locally compiled sites (dry-run live preview).
app.use('/sites', express.static(SITES_DIR, { extensions: ['html'] }));

// Serve the gate page (public/site-gate.html) — small standalone page, served
// directly from source so it works in both dev and prod. The gate middleware
// redirects unauthenticated browser requests here.
app.get('/site-gate', (_req, res) => {
  const gatePath = path.join(ROOT_DIR, 'public', 'site-gate.html');
  if (fs.existsSync(gatePath)) {
    return res.sendFile(gatePath);
  }
  // Fallback if the file is missing — keep the gate working rather than
  // throwing a confusing 404 to the user.
  res.status(500).send('Site gate page missing. Please redeploy.');
});

// In production, serve the built frontend.
const distDir = path.join(ROOT_DIR, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/sites')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// Serve the locally compiled sites (dry-run live preview).
app.use('/sites', express.static(SITES_DIR, { extensions: ['html'] }));

// ---- Owner Auth (invite code IS the login) -----------------------------------
// Single-use codes are generated externally per site. Here we accept any valid-
// format code and bind the caller to the matching site.

const OWNER_CODE_RE = /^LUNAO-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

function generateToken(code) {
  // Simple opaque token — in production replace with a real JWT or DB session.
  return `lunao.${Buffer.from(code).toString('base64url')}.${Date.now()}`;
}

app.post('/api/owner/redeem', (req, res) => {
  try {
    const { code, deviceLabel, platform } = req.body || {};
    if (typeof code !== 'string' || !isValidCodeFormat(code)) {
      return res.status(400).json({ ok: false, error: 'Invalid invite code format. Expected LUNAO-XXXX-XXXX.' });
    }
    const trimmed = code.trim().toUpperCase();
    const devMode = req.query.devMode === '1' || req.query.devMode === 'true';

    // Real invite-code path: look the code up in the table and bind to its slug.
    if (!devMode) {
      const row = findByCode(trimmed);
      if (!row) {
        return res.status(404).json({ ok: false, error: 'Invalid or revoked invite code.' });
      }
      if (row.revokedAt) {
        return res.status(404).json({ ok: false, error: 'This invite code has been revoked.' });
      }
      // Look up the site to attach business metadata.
      const sites = listSitesSync();
      const target = sites.find((s) => s.slug === row.slug);
      if (!target) {
        return res.status(404).json({ ok: false, error: 'No site found for this code.' });
      }
      touchCode(trimmed, deviceLabel);
      const token = generateToken(trimmed);
      return res.json({
        ok: true,
        token,
        slug: target.slug,
        businessName: target.title,
        niche: target.niche,
        siteUrl: target.url,
        inviteCode: { id: row.id, code: row.code, label: row.label },
      });
    }

    // Dev-mode escape hatch (?devMode=1): original fuzzy-match behavior.
    // Used by local testing where no codes have been issued yet.
    const sites = listSitesSync();
    const target = sites.find((s) => s.slug.includes(trimmed.replace('LUNAO-', '').toLowerCase().replace(/[^a-z0-9-]/g, ''))) || sites[0];
    if (!target) {
      return res.status(404).json({ ok: false, error: 'No site found for this code.' });
    }
    const token = generateToken(trimmed);
    res.json({ ok: true, token, slug: target.slug, businessName: target.title, niche: target.niche, siteUrl: target.url, devMode: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// listSitesSync: same logic as the async listSites() but returns synchronously
// so the redeem endpoint can map a code to a site without async/await overhead.
function listSitesSync() {
  let entries = [];
  try { entries = fs.readdirSync(SITES_DIR, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidSlug(entry.name)) continue;
    const file = path.join(SITES_DIR, entry.name, 'index.html');
    let html = '';
    try { html = fs.readFileSync(file, 'utf8'); } catch { continue; }
    out.push({
      slug: entry.name,
      title: titleFromHtml(html) || entry.name,
      niche: nicheFromHtml(html),
      url: `${siteBaseUrl()}/${entry.name}/`,
      updatedAt: (() => { try { return fs.statSync(file).mtimeMs; } catch { return null; } })(),
    });
  }
  out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return out;
}

app.get('/api/owner/me', (req, res) => {
  // In production: verify Bearer token, return owner profile.
  // Here we return a stub so the app can test the real endpoint.
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Unauthorized. Send Authorization: Bearer <token>.' });
  }
  // Parse the slug from the token (matches redeem token format).
  try {
    const payload = token.split('.')[1] || '';
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    const codeMatch = decoded.match(/LUNAO-[A-Z0-9]{4}-[A-Z0-9]{4}/i);
    const code = codeMatch ? codeMatch[0] : null;
    const sites = listSitesSync();
    let target = sites[0];
    if (code) {
      const hint = code.replace('LUNAO-', '').toLowerCase().replace(/[^a-z0-9-]/g, '');
      target = sites.find((s) => s.slug.includes(hint)) || target;
    }
    if (!target) return res.status(404).json({ ok: false, error: 'Profile not found.' });
    res.json({ ok: true, slug: target.slug, businessName: target.title, niche: target.niche, siteUrl: target.url });
  } catch {
    return res.status(401).json({ ok: false, error: 'Invalid token.' });
  }
});

app.post('/api/owner/push-token', (req, res) => {
  // In production: store the Expo push token keyed by slug and send push on
  // every new booking for that slug via Expo's push service.
  // Here we acknowledge receipt so the app flow completes.
  const { token, platform, slug } = req.body || {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ ok: false, error: 'token is required.' });
  }
  console.log(`[push-token] registered for ${slug || 'unknown'} on ${platform || 'unknown'}: ${token.slice(0, 20)}...`);
  res.json({ ok: true, registered: true });
});

// ---- Conversations (chat history) -------------------------------------------

app.get('/api/sites/:slug/conversations', async (req, res) => {
  try {
    const { slug } = req.params;
    if (!isValidSlug(slug) || !(await siteExists(slug))) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    // Group messages into sessions, return last message + counts per session.
    const sessions = db.prepare('SELECT id, created_at FROM chat_sessions WHERE slug = ? ORDER BY created_at DESC').all(slug);
    const conversations = [];
    for (const s of sessions) {
      const msgs = db.prepare('SELECT role, content, created_at FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT 1').get(s.id);
      const count = db.prepare('SELECT COUNT(*) as n FROM chat_messages WHERE session_id = ?').get(s.id).n;
      const hasBooking = db.prepare("SELECT COUNT(*) as n FROM bookings WHERE slug = ? AND created_at >= ?").get(slug, s.created_at).n > 0;
      conversations.push({
        id: s.id,
        slug,
        createdAt: s.created_at,
        lastMessage: msgs ? msgs.content : '',
        lastRole: msgs ? msgs.role : 'assistant',
        messageCount: count,
        booked: hasBooking,
      });
    }
    res.json({ ok: true, conversations });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/chat/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const session = db.prepare('SELECT id, slug, created_at FROM chat_sessions WHERE id = ?').get(id);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Session not found.' });
    }
    const messages = db.prepare('SELECT role, content, created_at FROM chat_messages WHERE session_id = ? ORDER BY id ASC').all(id);
    res.json({
      ok: true,
      session: { id: session.id, slug: session.slug, createdAt: session.created_at },
      messages: messages.map((m) => ({ role: m.role, content: m.content, createdAt: m.created_at })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Invite codes (per-site, agency-issued) -------------------------------
// The dashboard's Editor "Invite Client" drawer uses these. Codes are
// scoped to one slug at creation time and consumed by the Owner App's
// POST /api/owner/redeem (handled above).

// List every code (active, used, revoked) for a given site.
app.get('/api/sites/:slug/invite-codes', async (req, res) => {
  try {
    const { slug } = req.params;
    if (!isValidSlug(slug) || !(await siteExists(slug))) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    res.json({ ok: true, codes: listCodes(slug) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Mint a new LUNAO-XXXX-XXXX bound to this slug.
app.post('/api/sites/:slug/invite-codes', async (req, res) => {
  try {
    const { slug } = req.params;
    if (!isValidSlug(slug) || !(await siteExists(slug))) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    const label = typeof req.body?.label === 'string' ? req.body.label.trim().slice(0, 64) || null : null;
    const code = createCode(slug, label);
    res.json({ ok: true, code });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update a code (revoke, rename).
app.patch('/api/invite-codes/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });
    const existing = findById(id);
    if (!existing) return res.status(404).json({ ok: false, error: 'Code not found' });

    let updated = existing;
    if (req.body?.revoked === true) {
      updated = revokeCode(id) || updated;
    } else if (req.body?.revoked === false && updated.revokedAt) {
      // Allow un-revoke (clear the revoked_at timestamp).
      db.prepare('UPDATE invite_codes SET revoked_at = NULL WHERE id = ?').run(id);
      updated = findById(id) || updated;
    }
    if (typeof req.body?.label === 'string') {
      const label = req.body.label.trim().slice(0, 64) || null;
      updated = renameCode(id, label) || updated;
    }
    res.json({ ok: true, code: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Quick "is this code still valid?" lookup. Returns safe fields only
// (never the slug) so an agency can verify a code shared by a client
// without exposing which business it belongs to.
app.get('/api/invite-codes/:code', (req, res) => {
  try {
    const { code } = req.params;
    if (!isValidCodeFormat(code)) {
      return res.status(400).json({ ok: false, error: 'Invalid code format' });
    }
    const safe = findByCodeSafe(code);
    if (!safe) return res.status(404).json({ ok: false, error: 'Code not found' });
    res.json({ ok: true, code: safe });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Credits (server-side source of truth) -------------------------------
// GET /api/credits?ownerKey=...   -> { account, plan, balance, ledger, ... }
// POST /api/credits/topup         -> { ownerKey, plan } -> ensureAccount()
// GET /api/credits/ledger         -> per-user credit ledger rows
//
// The dashboard passes the current user identity (currently a stable browser
// key stored in localStorage) as `ownerKey`. In production this will be the
// authenticated session id or user id from the agency's auth system.

app.get('/api/credits', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });
    const plan = req.query.plan ? String(req.query.plan) : null;
    const account = plan ? ensureAccount(ownerKey, plan) : getAccount(ownerKey);
    if (!account) return res.json({ ok: true, account: null, plans: PLAN_BALANCE, costPerLead: COST_PER_LEAD });
    res.json({
      ok: true,
      account,
      plans: PLAN_BALANCE,
      costPerLead: COST_PER_LEAD,
    });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

app.post('/api/credits/topup', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : req.body?.ownerKey;
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });
    if (!PLAN_BALANCE[plan]) return res.status(400).json({ ok: false, error: 'Unknown plan tier' });
    const account = ensureAccount(ownerKey, plan);
    res.json({ ok: true, account, plans: PLAN_BALANCE });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

app.get('/api/credits/ledger', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });
    const limit = parseInt(req.query.limit, 10) || 50;
    res.json({ ok: true, ledger: listLedger(ownerKey, limit) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Campaign history + per-campaign detail ------------------------------

app.get('/api/campaigns', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });
    const limit = parseInt(req.query.limit, 10) || 50;
    res.json({ ok: true, campaigns: listCampaigns(ownerKey, { limit }) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/campaigns/:id', authenticate, (req, res) => {
  try {
    const c = getCampaign(req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    const leads = listLeads(c.id);
    const sms = listSmsForCampaign(c.id);
    res.json({ ok: true, campaign: c, leads, sms });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Refund any remaining SMS charges for a campaign (manual admin tool).
// Idempotent: refunds are recorded in the ledger with (reason, ref_type, ref_id)
// and we no-op on repeat calls.
app.post('/api/campaigns/:id/refund', authenticate, (req, res) => {
  try {
    const c = getCampaign(req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    if (!c.ownerKey) return res.status(400).json({ ok: false, error: 'Campaign has no owner' });
    const leads = listLeads(c.id);
    let refundedCount = 0;
    for (const lead of leads) {
      if (lead.smsStatus === 'failed' || lead.smsStatus === 'skipped') {
        refund(c.ownerKey, 3, 'sms_failed_refund', { type: 'lead', id: String(lead.id) });
        refundedCount++;
      }
      if (lead.siteStatus === 'failed') {
        refund(c.ownerKey, 1, 'site_failed_refund', { type: 'lead', id: String(lead.id) });
      }
    }
    const account = getAccount(c.ownerKey);
    res.json({ ok: true, refundedLeads: refundedCount, account });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// Soft-cancel an in-flight campaign. The runPipeline() loop checks the
// campaign status column on every lead boundary and exits cleanly when it
// sees 'cancelled'. The current lead in flight is allowed to finish
// (Cloudflare deploy / Telnyx send already in progress) — we just stop
// starting new ones. Idempotent: cancelling twice is a no-op.
app.post('/api/campaigns/:id/cancel', authenticate, (req, res) => {
  try {
    const c = getCampaign(req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    if (c.status === 'completed' || c.status === 'failed' || c.status === 'cancelled') {
      return res.json({ ok: true, status: c.status, alreadyTerminal: true });
    }
    markCampaignCancelled(c.id);
    res.json({ ok: true, status: 'cancelled' });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// Soft-cancel an in-flight email campaign. Same semantics as the SMS
// cancel route — the runEmailPipeline() loop exits cleanly at the next
// lead boundary.
app.post('/api/email-campaigns/:id/cancel', authenticate, (req, res) => {
  try {
    const c = getEmailCampaign(req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'Email campaign not found' });
    if (c.status === 'completed' || c.status === 'failed' || c.status === 'cancelled') {
      return res.json({ ok: true, status: c.status, alreadyTerminal: true });
    }
    markEmailCampaignCancelled(c.id);
    res.json({ ok: true, status: 'cancelled' });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// EMAIL CAMPAIGN API ENDPOINTS
// =============================================================================

// ---- Dashboard Stats ----
//
// One-shot read for the Dashboard's "Today" counters and the celebration
// card on the new EmailCampaignWizard. All four queries use columns that
// already exist on `site_history`, `campaigns`, `email_campaigns`, and
// `email_leads` — no new tables, no migrations.
//
// "Today" is computed as midnight (local server time) → now, in unix epoch
// seconds, matching the INTEGER epoch columns used throughout the schema.

app.get('/api/stats/dashboard', authenticate, (req, res) => {
  try {
    // Prefer an explicit ownerKey (X-Owner-Key header / query / body) for
    // localStorage-style callers. Fall back to the gate-only `dashboard`
    // namespace so the live dashboard works even without per-user auth.
    const ownerKey = (() => {
      if (req.userId) return `user_${req.userId}`;
      const explicit = req.headers['x-owner-key'] || req.query.ownerKey || req.body?.ownerKey;
      if (explicit) return String(explicit).trim();
      return req.ownerKey || 'dashboard';
    })();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });

    const startOfToday = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    const now = Math.floor(Date.now() / 1000);

    // Sites deployed today: any site_history row stamped today for this owner.
    const sitesDeployedTodayRow = db.prepare(
      'SELECT COUNT(*) AS n FROM site_history WHERE owner_key = ? AND created_at >= ?'
    ).get(ownerKey, startOfToday);
    const sitesDeployedToday = Number(sitesDeployedTodayRow?.n) || 0;

    // Lifetime sites generated: sum the cached counters on the user's two
    // campaign tables. site_history itself isn't a perfect lifetime counter
    // (Studio saves can re-write history for the same slug), so we lean on
    // the aggregated per-campaign columns which are updated whenever a real
    // lead finishes the deploy phase.
    const sitesEmailRow = db.prepare(
      'SELECT COALESCE(SUM(sites_generated), 0) AS n FROM email_campaigns WHERE user_id = ?'
    ).get(ownerKey);
    const sitesSmsRow = db.prepare(
      'SELECT COALESCE(SUM(sites_generated), 0) AS n FROM campaigns WHERE owner_key = ?'
    ).get(ownerKey);
    const sitesDeployedTotal =
      (Number(sitesEmailRow?.n) || 0) + (Number(sitesSmsRow?.n) || 0);

    // Emails sent today: per-lead send_status rows for this owner's campaigns
    // that were stamped with a sent_at timestamp today.
    const emailsSentTodayRow = db.prepare(
      `SELECT COUNT(*) AS n
         FROM email_leads l
         JOIN email_campaigns c ON c.id = l.campaign_id
        WHERE c.user_id = ?
          AND l.send_status IN ('sent', 'delivered')
          AND l.sent_at IS NOT NULL
          AND l.sent_at >= ?`
    ).get(ownerKey, startOfToday);
    const emailsSentToday = Number(emailsSentTodayRow?.n) || 0;

    // Lifetime emails sent — cached counter on the email_campaigns row.
    const emailsTotalRow = db.prepare(
      'SELECT COALESCE(SUM(emails_sent), 0) AS n FROM email_campaigns WHERE user_id = ?'
    ).get(ownerKey);
    const emailsSentTotal = Number(emailsTotalRow?.n) || 0;

    res.json({
      ok: true,
      stats: {
        sitesDeployedToday,
        sitesDeployedTotal,
        emailsSentToday,
        emailsSentTotal,
        // Surface a couple of helpful metadata fields for the UI:
        // `asOf` is the server clock the snapshot was taken at (seconds).
        // `windowStart` is the start-of-today epoch the "today" counters
        // are anchored to — clients use it for any client-side sanity
        // checks (e.g. hidden by an hour or stale).
        asOf: now,
        windowStart: startOfToday,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Today's email send log — used by the EmailsTodayLog component on the
// Dashboard so the user can see per-send details without opening a campaign.
app.get('/api/email-logs/today', authenticate, (req, res) => {
  try {
    const ownerKey = (() => {
      if (req.userId) return `user_${req.userId}`;
      const explicit = req.headers['x-owner-key'] || req.query.ownerKey || req.body?.ownerKey;
      if (explicit) return String(explicit).trim();
      return req.ownerKey || 'dashboard';
    })();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });

    const startOfToday = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

    const rows = db.prepare(`
      SELECT
        el.id,
        el.campaign_id,
        ec.email_subject  AS campaign_name,
        el.account_id,
        ea.email          AS account_email,
        ll.email          AS recipient_email,
        ll.business_name  AS recipient_name,
        el.subject,
        el.sent_at,
        el.delivery_status,
        ll.generated_site_url
      FROM email_logs el
      JOIN email_campaigns ec  ON ec.id = el.campaign_id
      JOIN email_leads   ll   ON ll.id = el.lead_id
      LEFT JOIN email_accounts ea ON ea.id = el.account_id
      WHERE ec.user_id  = ?
        AND el.sent_at   >= ?
      ORDER BY el.sent_at DESC
      LIMIT 200
    `).all(ownerKey, startOfToday);

    res.json({ ok: true, logs: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Email Campaigns CRUD ----

// List email campaigns for a user
app.get('/api/email-campaigns', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });
    const limit = parseInt(req.query.limit, 10) || 50;
    const campaigns = listEmailCampaigns(ownerKey, limit);
    res.json({ ok: true, campaigns });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get single email campaign with leads
app.get('/api/email-campaigns/:id', authenticate, (req, res) => {
  try {
    const campaign = getEmailCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    const leads = listEmailLeads(campaign.id);
    res.json({ ok: true, campaign, leads });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create a new email campaign (draft)
app.post('/api/email-campaigns', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.body?.ownerKey || '').trim();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });
    
    const csvLeads = Array.isArray(req.body?.leads) ? req.body.leads : [];
    
    const campaign = createEmailCampaign({
      userId: ownerKey,
      niche: req.body?.niche,
      templateId: req.body?.templateId,
      templateKey: req.body?.templateKey,
      leadSource: req.body?.leadSource || 'csv',
      targetVolume: csvLeads.length || req.body?.targetVolume || 0,
      city: req.body?.city,
      category: req.body?.category,
      emailSubject: req.body?.emailSubject,
      emailBody: req.body?.emailBody,
      csvSnapshot: req.body?.csvSnapshot,
      leads: csvLeads,
    });
    
    res.json({ ok: true, campaign });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update email campaign
app.put('/api/email-campaigns/:id', authenticate, (req, res) => {
  try {
    const campaign = getEmailCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    
    // Update allowed fields
    const allowedFields = ['niche', 'template_id', 'template_key', 'lead_source', 'target_volume', 
      'city', 'category', 'email_subject', 'email_body', 'status'];
    
    const updates = [];
    const values = [];
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }
    
    if (updates.length > 0) {
      values.push(req.params.id);
      db.prepare(`UPDATE email_campaigns SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }
    
    const updated = getEmailCampaign(req.params.id);
    res.json({ ok: true, campaign: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete email campaign
app.delete('/api/email-campaigns/:id', authenticate, (req, res) => {
  try {
    const campaign = getEmailCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    
    // Delete associated leads and logs
    db.prepare('DELETE FROM email_leads WHERE campaign_id = ?').run(req.params.id);
    db.prepare('DELETE FROM email_logs WHERE campaign_id = ?').run(req.params.id);
    db.prepare('DELETE FROM email_campaigns WHERE id = ?').run(req.params.id);
    
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Email Account Management ----

// List connected email accounts for a user
app.get('/api/email-accounts', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });
    
    const accounts = listEmailAccounts(ownerKey);

    // Defensive dedupe by (provider, email): last-connected wins. The
    // unique index in db.js prevents new dupes, but legacy rows from before
    // the index existed could still show up twice. The wizard MUST never
    // surface two cards for the same address.
    const dedupByEmail = new Map();
    for (const acc of accounts) {
      const key = `${acc.provider}::${(acc.email || '').toLowerCase()}`;
      const existing = dedupByEmail.get(key);
      if (!existing || (acc.connected_at || 0) > (existing.connected_at || 0)) {
        dedupByEmail.set(key, acc);
      }
    }
    const deduped = Array.from(dedupByEmail.values());

    // Add computed fields for client display.
    // The health math (rolling 24h, non-linear %, health_ruined warning) lives
    // entirely on the server so every page that shows this card agrees.
    const accountsWithMetrics = deduped.map(acc => {
      const health = getAccountHealth(acc.id);
      return {
        id: acc.id,
        user_id: acc.user_id,
        provider: acc.provider,
        email: acc.email,
        display_name: acc.display_name,
        daily_cap: health?.dailyCap ?? acc.daily_cap,
        connected_at: acc.connected_at,
        status: acc.status,
        // Rolling 24h, not calendar day:
        sends_today: health?.sendsToday ?? acc.sends_today,
        sends_this_week: acc.sends_this_week,
        remaining_today: health?.remainingToday ?? 0,
        // v3: pause toggle + battery gauge — surfaced alongside the
        // pre-existing Gmail-health math so the picker can render both.
        paused: health?.paused ?? acc.paused ?? 0,
        battery_capacity: health?.batteryCapacity ?? acc.battery_capacity ?? 300,
        battery_percent: health?.batteryPercent ?? null,
        battery_label: health?.batteryLabel ?? 'unknown',
        health_percent: health?.healthPercent ?? null,
        health_label: health?.healthLabel ?? 'unknown',
        bounce_rate_7d: acc.bounce_rate_7d,
        last_successful_send: acc.last_successful_send,
        token_status: acc.status === 'needs_attention' ? 'needs_reconnect' : 'active',
        health,
      };
    });
    
    res.json({ ok: true, accounts: accountsWithMetrics });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get single account health
app.get('/api/email-accounts/:id/health', authenticate, (req, res) => {
  try {
    const health = getAccountHealth(req.params.id);
    if (!health) return res.status(404).json({ ok: false, error: 'Account not found' });
    res.json({ ok: true, health });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Probe every connected account's refresh token. Lightweight — only
// validates against Google's OAuth endpoint, never Gmail itself. Designed
// to be called right before the user moves to the next step in the Email
// Campaign wizard so dead tokens block the transition with a clear error.
app.post('/api/email-accounts/probe-all', authenticate, async (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || req.body?.ownerKey || '').trim();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });
    const out = await probeAllEmailAccountTokens(ownerKey);
    res.json(out);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Probe a single account's token.
app.post('/api/email-accounts/:id/probe', authenticate, async (req, res) => {
  try {
    const account = getEmailAccount(req.params.id);
    if (!account) return res.status(404).json({ ok: false, error: 'Account not found' });
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    if (ownerKey && account.user_id !== ownerKey) {
      return res.status(403).json({ ok: false, error: 'Not your account' });
    }
    const result = await probeEmailAccountToken(req.params.id);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Pause/Resume toggle — user-controlled per-account. Soft warning only.
// Per the spec: "users can still use emails even after running out of 100%
// battery — let them use it". We don't gate `canAccountSend` on this; we
// only mark the row so the picker UI can show the Pause badge + warning
// card. The campaign will still send if the user clicks Launch.
app.post('/api/email-accounts/:id/pause', authenticate, (req, res) => {
  try {
    const account = getEmailAccount(req.params.id);
    if (!account) return res.status(404).json({ ok: false, error: 'Account not found' });
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || req.body?.ownerKey || '').trim();
    if (ownerKey && account.user_id !== ownerKey) {
      return res.status(403).json({ ok: false, error: 'Not your account' });
    }
    const updated = setEmailAccountPaused(req.params.id, true);
    const health = getAccountHealth(req.params.id);
    res.json({ ok: true, account: updated, health });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/email-accounts/:id/resume', authenticate, (req, res) => {
  try {
    const account = getEmailAccount(req.params.id);
    if (!account) return res.status(404).json({ ok: false, error: 'Account not found' });
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || req.body?.ownerKey || '').trim();
    if (ownerKey && account.user_id !== ownerKey) {
      return res.status(403).json({ ok: false, error: 'Not your account' });
    }
    const updated = setEmailAccountPaused(req.params.id, false);
    const health = getAccountHealth(req.params.id);
    res.json({ ok: true, account: updated, health });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete/Disconnect email account
app.delete('/api/email-accounts/:id', authenticate, (req, res) => {
  try {
    const account = getEmailAccount(req.params.id);
    if (!account) return res.status(404).json({ ok: false, error: 'Account not found' });
    
    deleteEmailAccount(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Gmail OAuth flow (Connect Gmail button) ----

// Build the provider's authorization URL. The frontend opens this URL, the
// user approves on Google's own consent screen, and Google redirects back to
// /api/email-accounts/callback with a one-time `code`.
const oauthStateStore = new Map(); // state -> { ownerKey, createdAt }
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function ownerKeyForCallback(req) {
  const legacyKey = req.headers['x-owner-key'] || req.query.ownerKey || req.body?.ownerKey;
  if (legacyKey) return String(legacyKey);
  return req.userId ? `user_${req.userId}` : 'dashboard';
}

function redirectBase() {
  return process.env.OAUTH_REDIRECT_BASE || `http://localhost:${PORT}`;
}

app.get('/api/email-accounts/oauth/url', authenticate, (req, res) => {
  try {
    const provider = String(req.query.provider || '');
    if (provider !== 'gmail' && provider !== 'outlook') {
      return res.status(400).json({ ok: false, error: 'Unsupported provider' });
    }
    if (provider === 'gmail' && !googleOAuth.enabled) {
      return res.status(503).json({
        ok: false,
        error: 'Gmail OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.',
      });
    }

    const ownerKey = ownerKeyForCallback(req);
    const state = `lk_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
    oauthStateStore.set(state, { ownerKey, createdAt: Date.now() });

    const redirectUri = `${redirectBase()}/api/email-accounts/callback`;
    let url;
    if (provider === 'gmail') {
      url = buildGmailAuthUrl({ redirectUri, state });
    } else {
      // Placeholder for Outlook until Microsoft Graph is wired.
      url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=${encodeURIComponent(state)}`;
    }

    res.json({ ok: true, url, redirectUri });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Provider redirect target. Exchanges the one-time code for tokens, looks up
// the user's Gmail profile, encrypts the refresh_token with AES-256-GCM, and
// stores it in email_accounts. Then shows a friendly page that bounces back
// to the dashboard (window.close) and tells the user it worked.
app.get('/api/email-accounts/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  // Friendly HTML shell so the user always sees SOMETHING, even on errors.
  const sendHtml = (title, body, autoClose = true) => {
    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f6f3; color: #1f2937; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
      .card { background: white; padding: 32px 40px; border-radius: 14px; box-shadow: 0 8px 30px rgba(15,23,42,0.08); max-width: 480px; text-align: center; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { color: #6b7280; margin: 0 0 16px; line-height: 1.5; }
      .spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid #e5e7eb; border-top: #1f2937 solid; animation: spin 0.8s linear infinite; margin: 8px auto 0; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .ok { color: #047857; }
      .err { color: #b91c1c; }
    </style></head>
    <body><div class="card"><h1>${title}</h1>${body}${autoClose ? '<div class="spinner"></div>' : ''}</div>
    <script>
      ${autoClose ? `setTimeout(function(){ try { window.close(); } catch(e) {} }, 1500);` : ''}
    </script></body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  };
  
  if (error) {
    return sendHtml(
      'Connection cancelled',
      `<p class="err">Google returned: <strong>${escapeHtml(String(error))}</strong></p><p>Close this window and try again from the dashboard.</p>`,
      false,
    );
  }
  if (!code || !state) {
    return sendHtml('Invalid callback', '<p class="err">Missing code or state from Google.</p>', false);
  }
  
  const stateData = oauthStateStore.get(String(state));
  if (!stateData) {
    return sendHtml('Session expired', '<p class="err">Please return to the dashboard and click Connect again.</p>', false);
  }
  if (Date.now() - stateData.createdAt > OAUTH_STATE_TTL_MS) {
    oauthStateStore.delete(String(state));
    return sendHtml('Session timed out', '<p class="err">Restart the connection from the dashboard.</p>', false);
  }
  
  try {
    const redirectUri = `${redirectBase()}/api/email-accounts/callback`;
    
    // Gmail only for now
    const tokens = await exchangeGmailCode({ code: String(code), redirectUri });
    const profile = await getGmailUserProfile(tokens.access_token);
    
    const encrypted = encryptRefreshTokenForStorage(tokens.refresh_token);
    if (!encrypted) {
      throw new Error('Failed to encrypt refresh token. Check EMAIL_TOKEN_ENCRYPTION_KEY.');
    }
    
    const userId = stateData.ownerKey;
    const account = createEmailAccount({
      userId,
      provider: 'gmail',
      email: profile.email,
      displayName: profile.displayName,
      encryptedRefreshToken: encrypted,
      dailyCap: 80,
    });
    
    oauthStateStore.delete(String(state));
    
    return sendHtml(
      'Gmail connected',
      `<p class="ok"><strong>${escapeHtml(profile.email)}</strong> is ready to send.</p><p>You can close this window — your dashboard has updated.</p>`,
      true,
    );
  } catch (err) {
    return sendHtml('Connection failed', `<p class="err">${escapeHtml(err.message)}</p><p>Close this window and try again.</p>`, false);
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---- Suppression List ----

// Get suppression list
app.get('/api/email-suppression', authenticate, (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 1000;
    const list = getSuppressionList(limit);
    res.json({ ok: true, suppression_list: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Add to suppression list
app.post('/api/email-suppression', authenticate, (req, res) => {
  try {
    const { email, reason, source } = req.body || {};
    if (!email || !reason) {
      return res.status(400).json({ ok: false, error: 'email and reason are required' });
    }
    
    addToSuppression(email, reason, source || 'manual');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Check if email is suppressed
app.get('/api/email-suppression/check', authenticate, (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).json({ ok: false, error: 'email query param is required' });
    
    const entry = isEmailSuppressed(email);
    res.json({ ok: true, suppressed: !!entry, entry });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Email Discovery (Places API + Crawler) ----

// Discover leads via Places API
app.post('/api/email-campaigns/:id/discover-places', authenticate, async (req, res) => {
  try {
    const campaign = getEmailCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    
    const { city, category, limit = 50 } = req.body || {};
    if (!city || !category) {
      return res.status(400).json({ ok: false, error: 'city and category are required' });
    }
    
    // This will be handled by the Places API crawler module
    // For now, return a placeholder response
    res.json({ 
      ok: true, 
      discovered: 0,
      message: 'Places API discovery is queued. The pipeline will discover leads with websites.' 
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get leads pending email discovery for a campaign
app.get('/api/email-campaigns/:id/pending-discovery', authenticate, (req, res) => {
  try {
    const leads = getLeadsPendingEmailDiscovery(req.params.id);
    res.json({ ok: true, leads });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Email Campaign Run (SSE) ----

// Run email campaign pipeline
app.post('/api/email-campaigns/:id/run', async (req, res) => {
  const campaignId = req.params.id;
  const { accountIds } = req.body || {};
  
  const campaign = getEmailCampaign(campaignId);
  if (!campaign) {
    return res.status(404).json({ ok: false, error: 'Campaign not found' });
  }
  
  if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
    return res.status(400).json({ ok: false, error: 'At least one email account is required' });
  }
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering (Railway/Cloudflare)
  res.flushHeaders?.();

  const send = (event) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (err) {
      // Client disconnected mid-write — swallow so the server pipeline
      // keeps running in the background and the campaign completes.
      console.warn(`[email-run] SSE write failed for ${campaignId}: ${err.message}`);
    }
  };

  // Heartbeat keeps the connection alive during long Cloudflare deploys
  // (60-90s) so the browser/proxy doesn't time out the stream.
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {}
  }, 15000);

  // Clean up the heartbeat if the browser closes the connection early.
  req.on('close', () => {
    clearInterval(heartbeat);
    // Don't end the response — the pipeline itself decides when to close.
  });

  try {
    send({ type: 'campaign', campaignId });

    // Import the email pipeline runner
    const { runEmailPipeline } = await import('./lib/emailPipeline.js');

    await runEmailPipeline({
      campaignId,
      accountIds,
      onEvent: send,
    });

  } catch (err) {
    send({ type: 'error', error: err.message });
    updateEmailCampaignStatus(campaignId, 'cancelled');
  } finally {
    clearInterval(heartbeat);
    try { res.end(); } catch {}
  }
});

// ---- Test SMS (Settings "Send test message" button) ----------------------

app.post('/api/test-sms', authenticate, async (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : req.body?.ownerKey;
    const { to, text } = req.body || {};
    const dest = toE164(to);
    if (!dest) return res.status(400).json({ ok: false, error: 'Invalid destination phone' });
    if (!telnyx.enabled) {
      return res.json({
        ok: true,
        status: 'simulated',
        to: dest,
        message: 'SMS master switch is OFF. Set SMS_ENABLED=true to send real messages.',
      });
    }
    const body = text || 'Lunao test message — if you received this, the SMS pipeline is live. ✓';
    const result = await sendSms({ to: dest, text: body });
    if (ownerKey) {
      logSmsAttempt({
        ownerKey,
        to: dest,
        from: telnyx.from,
        body,
        status: result.status,
        telnyxId: result.id || null,
        errorCode: result.errorCode || null,
        errorMessage: result.error || null,
        segmentCount: result.segmentCount || countSegments(body),
        costCredits: 0,
      });
    }
    res.json({
      ok: result.status !== 'failed',
      status: result.status,
      to: dest,
      id: result.id || null,
      simulated: !!result.simulated,
      error: result.error || null,
      errorCode: result.errorCode || null,
    });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ---- Telnyx webhook (inbound SMS + delivery receipts) --------------------
// Configure in Telnyx Mission Control: Messaging > Webhooks -> point to
// https://<your-api>/api/webhooks/telnyx. We accept all of:
//   - message.received  -> inbound reply
//   - message.finalized / message.delivered / message.failed -> delivery
//   - message.sent -> outbound accepted

app.post('/api/webhooks/telnyx', (req, res) => {
  try {
    const payload = req.body || {};
    const events = Array.isArray(payload.data) ? payload.data : [payload];

    let inboundCount = 0;
    let deliveryCount = 0;
    let updated = 0;

    for (const evt of events) {
      const eventType = String(evt.event_type || evt.record_type || '').toLowerCase();
      const msg = evt.payload || evt.data || evt;
      const telnyxId = msg.id || evt.id || null;
      const from = msg.from?.phone_number || msg.from || '';
      const to = msg.to?.phone_number || (Array.isArray(msg.to) ? msg.to[0]?.phone_number : msg.to) || '';
      const body = msg.text || msg.body || '';
      const status = msg.status || eventType;

      logInbound({
        telnyxId,
        from,
        to,
        body,
        kind: eventType.includes('received') ? 'inbound' : 'delivery',
        status,
        raw: evt,
      });

      if (eventType.includes('received') || eventType === 'message.received') {
        inboundCount++;
      } else {
        deliveryCount++;
        const sms = findSmsByTelnyxId(telnyxId);
        if (sms) {
          let newStatus = sms.status;
          if (eventType.includes('delivered') || status === 'delivered') newStatus = 'delivered';
          else if (eventType.includes('failed') || status === 'failed') newStatus = 'failed';
          else if (eventType.includes('sent') || status === 'sent') newStatus = 'sent';
          if (newStatus !== sms.status) {
            updateSmsStatus(sms.id, {
              status: newStatus,
              error_code: newStatus === 'failed' ? (msg.errors?.[0]?.code || 'E_DELIVERY_FAILED') : null,
              error_message: newStatus === 'failed' ? (msg.errors?.[0]?.detail || 'Delivery failed') : null,
            });
            db.prepare('UPDATE campaign_leads SET sms_status = ? WHERE id = ?').run(newStatus, sms.leadId);
            updated++;
          }
        }
      }
    }

    res.json({ ok: true, inbound: inboundCount, delivery: deliveryCount, updated });
  } catch (err) {
    console.error('[telnyx-webhook] error:', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
});

// ---- Telnyx live status (for the Settings panel) -------------------------
app.get('/api/sms/status', (_req, res) => {
  try {
    res.json({
      ok: true,
      enabled: telnyx.enabled,
      live: telnyx.live,
      from: telnyx.from || null,
      hasMessagingProfile: Boolean(telnyx.messagingProfileId),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Owner SMS log (per-owner aggregated view) ---------------------------
app.get('/api/owner/sms', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });
    const limit = parseInt(req.query.limit, 10) || 100;
    res.json({ ok: true, sms: listSmsForOwner(ownerKey, limit) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Send a one-off SMS from the dashboard Messages pane. Mirrors what the
// campaign runner does per-lead: writes an sms_logs row, charges 3 credits,
// calls Telnyx, refunds on failure, and updates status as the webhook lands.
app.post('/api/owner/sms', authenticate, async (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.body?.ownerKey || req.query.ownerKey || 'dashboard').trim();
    const { to, text, leadName } = req.body || {};
    const dest = toE164(to);
    if (!dest) return res.status(400).json({ ok: false, error: 'Invalid destination phone' });
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'text is required' });
    }
    if (text.length > 1600) {
      return res.status(400).json({ ok: false, error: 'text exceeds 1600 chars (Telnyx limit)' });
    }

    // Credit gate: one-off sends cost 3 credits (same as campaign SMS).
    const balance = checkBalance(ownerKey);
    if (balance.available < 3) {
      return res.status(402).json({ ok: false, error: 'Insufficient credits', needed: 3, available: balance.available });
    }
    const chargeResult = charge(ownerKey, 3, 'oneoff_sms_charge', { to: dest, leadName: leadName || null });

    // Persist the log row up front so the UI can show the message immediately.
    const segments = countSegments(text);
    const row = logSmsAttempt({
      campaignId: null,
      leadId: null,
      ownerKey,
      toNumber: dest,
      fromNumber: telnyx.from || null,
      body: text,
      status: 'queued',
      telnyxId: null,
      errorCode: null,
      errorMessage: null,
      segmentCount: segments,
      costCredits: 3,
    });

    if (!telnyx.enabled) {
      // Master switch off — keep the row, refund the credits.
      updateSmsStatus({ id: row.id, status: 'simulated' });
      refund(ownerKey, 3, 'oneoff_sms_simulated_refund', { smsId: row.id });
      return res.json({ ok: true, status: 'simulated', smsId: row.id });
    }

    try {
      const result = await sendSms({ to: dest, text });
      updateSmsStatus({
        id: row.id,
        status: result.status || 'sent',
        telnyxId: result.id || null,
        errorCode: result.errorCode || null,
        errorMessage: result.errorMessage || null,
      });
      if (result.status === 'failed') {
        refund(ownerKey, 3, 'oneoff_sms_failed_refund', { smsId: row.id });
      }
      return res.json({ ok: true, status: result.status || 'sent', smsId: row.id, telnyxId: result.id || null });
    } catch (err) {
      updateSmsStatus({ id: row.id, status: 'failed', errorMessage: err.message });
      refund(ownerKey, 3, 'oneoff_sms_failed_refund', { smsId: row.id });
      return res.status(502).json({ ok: false, error: err.message, smsId: row.id });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Site Studio — blank canvas → AI builds site → history + turn into template
// ---------------------------------------------------------------------------

// List site history (previous builds for a given slug).
app.get('/api/site-history', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    const { parentSlug } = req.query;
    let sql = 'SELECT * FROM site_history WHERE owner_key = ? ORDER BY created_at DESC';
    const params = [ownerKey];
    if (parentSlug) {
      sql = 'SELECT * FROM site_history WHERE owner_key = ? AND parent_slug = ? ORDER BY created_at DESC';
      params.push(parentSlug);
    }
    const rows = db.prepare(sql).all(...params);
    res.json({
      ok: true,
      history: rows.map((r) => ({
        id: r.id,
        parentSlug: r.parent_slug,
        title: r.title,
        niche: r.niche,
        html: r.html,
        snapshotLabel: r.snapshot_label,
        isTemplate: Boolean(r.is_template),
        templateId: r.template_id,
        templateName: r.template_name,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create a new site history entry (Studio saves after each AI generation).
app.post('/api/site-history', authenticate, async (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.body?.ownerKey || req.query?.ownerKey || '').trim();
    const { parentSlug, title = '', niche = '', html, snapshotLabel = '', templateId = null, templateName = null } = req.body || {};
    if (!html || typeof html !== 'string') {
      return res.status(400).json({ ok: false, error: 'html is required' });
    }
    const id = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      'INSERT INTO site_history (id, owner_key, parent_slug, title, niche, html, snapshot_label, is_template, template_id, template_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
    ).run(id, ownerKey, parentSlug || `studio-${id}`, title, niche, html, snapshotLabel, templateId || null, templateName || null, now);
    res.json({
      ok: true,
      entry: { id, parentSlug: parentSlug || `studio-${id}`, title, niche, snapshotLabel, isTemplate: false, templateId, templateName, createdAt: now },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Load a single history entry.
app.get('/api/site-history/:id', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    const row = db.prepare('SELECT * FROM site_history WHERE id = ? AND owner_key = ?').get(req.params.id, ownerKey);
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({
      ok: true,
      entry: {
        id: row.id,
        parentSlug: row.parent_slug,
        title: row.title,
        niche: row.niche,
        html: row.html,
        snapshotLabel: row.snapshot_label,
        isTemplate: Boolean(row.is_template),
        templateId: row.template_id,
        templateName: row.template_name,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Turn a history entry into a named template (saves to custom_templates).
app.post('/api/site-history/:id/convert-to-template', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.body?.ownerKey || req.query?.ownerKey || '').trim();
    const { name, categoryId = null, niche = '', templateId: existingTemplateId = null } = req.body || {};

    const row = db.prepare('SELECT * FROM site_history WHERE id = ? AND owner_key = ?').get(req.params.id, ownerKey);
    if (!row) return res.status(404).json({ ok: false, error: 'History entry not found' });

    const templateName = name?.trim() || `Template ${new Date().toLocaleDateString()}`;
    const templateId = existingTemplateId || `tmpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const slug = templateName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const now = Math.floor(Date.now() / 1000);

    // Insert into custom_templates if not already a template
    if (!row.is_template) {
      // Save raw version (with {{PLACEHOLDERS}}) — extract placeholders from the HTML
      const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;
      const placeholdersUsed = [...new Set([...row.html.matchAll(PLACEHOLDER_RE)].map((m) => m[1]))];
      const CORE = ['BUSINESS_NAME', 'CITY', 'PHONE_DISPLAY'];
      const extras = placeholdersUsed.filter((p) => !CORE.includes(p));
      const allPlaceholders = [...CORE, ...extras];

      const DEMO_VALUES = {
        BUSINESS_NAME: row.title || 'My Business',
        CITY: 'Austin, TX',
        PHONE_DISPLAY: '(512) 555-0000',
        PHONE_RAW: '5125550000',
        STATE: 'TX',
        YEARS_IN_BUSINESS: '2012',
        EMAIL: 'hello@example.com',
        ADDRESS: '123 Main St',
        GOOGLE_RATING: '4.8',
        GOOGLE_REVIEW_COUNT: '120',
        INSTAGRAM_HANDLE: 'mybiz',
        FACEBOOK_URL: 'https://facebook.com/mybiz',
        SITE_URL: 'https://example.com',
        DOCTOR_NAME: 'Dr. Smith',
        AVERAGE_RATING: '4.8',
        MEMBERS_COUNT: '1,200',
        TRAINERS_COUNT: '8',
      };

      const previewHtml = allPlaceholders.reduce(
        (html, key) => html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), DEMO_VALUES[key] || key),
        row.html,
      );

      db.prepare(
        `INSERT INTO custom_templates (id, owner_key, category_id, name, slug, niche, raw_html, preview_html, style_tags, used_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?)`,
      ).run(templateId, ownerKey, categoryId || null, templateName, slug, niche || row.niche, row.html, previewHtml, now);

      // Mark history entry as converted
      db.prepare(
        'UPDATE site_history SET is_template = 1, template_id = ?, template_name = ? WHERE id = ?',
      ).run(templateId, templateName, req.params.id);
    }

    res.json({
      ok: true,
      template: {
        id: templateId,
        name: templateName,
        slug,
        niche: niche || row.niche,
        categoryId: categoryId || null,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete a history entry.
app.delete('/api/site-history/:id', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    const row = db.prepare('SELECT * FROM site_history WHERE id = ? AND owner_key = ?').get(req.params.id, ownerKey);
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    db.prepare('DELETE FROM site_history WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Upload and process a raw HTML file — inject {{PLACEHOLDERS}} via AI.
app.post('/api/upload-template/process', authenticate, async (req, res) => {
  try {
    const { html, niche = 'Local Business', anthropicApiKey } = req.body || {};
    if (!html || typeof html !== 'string' || html.trim().length < 100) {
      return res.status(400).json({ ok: false, error: 'A valid HTML file (min 100 chars) is required.' });
    }

    const hasUserKey = typeof anthropicApiKey === 'string' && anthropicApiKey.trim().length > 0;
    const { generateTemplateHtml, isAiEnabled } = await import('./lib/anthropic.js');

    if (!hasUserKey && !isAiEnabled()) {
      return res.status(422).json({ ok: false, error: 'AI editor not configured. Add ANTHROPIC_API_KEY to server env or provide your own key.' });
    }

    // Build an injection prompt: scan the HTML and rewrite to use placeholders
    const injectionSystem = `You are an elite front-end engineer. A user has uploaded a raw HTML website for a local business. Your job is to rewrite it so it uses placeholder tokens for personalization.

CRITICAL RULES:
1. Find every occurrence of what appears to be a local business name (2-4 capitalized words, not common words like "Home", "Services", "Contact", "About", etc.) and replace it with {{BUSINESS_NAME}}.
2. Find every city/location string (e.g. "Austin, TX", "New York") and replace with {{CITY}}.
3. Find every phone number displayed in text (e.g. "(512) 555-0100") and replace with {{PHONE_DISPLAY}}.
4. Find every tel: link href value and replace the phone part with {{PHONE_RAW}}.
5. Replace {{BUSINESS_NAME}} SHORT occurrences (logo/brand words) with {{BUSINESS_NAME_SHORT}}.
6. If the HTML already uses {{PLACEHOLDER}} tokens, leave them as-is.
7. Keep EVERYTHING else byte-for-byte identical — same CSS, same JS, same structure.
8. Output ONLY the complete rewritten HTML — no markdown fences, no explanations, no comments outside the HTML.
9. If you can't determine what a value represents, leave it unchanged rather than risk breaking the page.
10. For Instagram/Facebook links: if a handle or URL is present, replace with {{INSTAGRAM_HANDLE}} / {{FACEBOOK_URL}} if possible, otherwise leave as-is.
11. NEVER invent values — only replace what you can clearly identify.`;

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const { anthropic: anthropicCfg } = await import('./lib/config.js');
    const client = hasUserKey
      ? new Anthropic({ apiKey: anthropicApiKey.trim() })
      : new Anthropic({ apiKey: anthropicCfg.apiKey });

    const trimmed = html.trim();
    // First 2000 chars as context so the AI knows the site's style
    const context = trimmed.length > 2000 ? trimmed.substring(0, 2000) + '\n... (truncated) ...' : trimmed;

    const stream = await client.messages.stream({
      model: anthropicCfg.model,
      max_tokens: 24000,
      system: injectionSystem,
      messages: [{
        role: 'user',
        content: `Here is a raw HTML website. Rewrite it to use {{BUSINESS_NAME}}, {{CITY}}, {{PHONE_DISPLAY}}, {{PHONE_RAW}} placeholders as described in your instructions. Keep everything else identical.\n\nHTML:\n${context}`,
      }],
    });

    let rawHtml = '';
    stream.on('text', (delta) => { rawHtml += delta; });
    await stream.finalMessage();

    // Strip accidental markdown fences
    rawHtml = (rawHtml || '').trim();
    const fence = rawHtml.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
    if (fence) rawHtml = fence[1].trim();

    // Build preview: substitute demo values
    const PLACEHOLDER_RE = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g;
    const DEMO = {
      BUSINESS_NAME: 'Radiant Smiles Dental',
      BUSINESS_NAME_SHORT: 'Radiant',
      CITY: 'Austin, TX',
      STATE: 'TX',
      PHONE_DISPLAY: '(512) 555-0199',
      PHONE_RAW: '5125550199',
      EMAIL: 'hello@example.com',
      ADDRESS: '3801 Capital of Texas Hwy, Austin, TX',
      GOOGLE_RATING: '4.9',
      GOOGLE_REVIEW_COUNT: '342',
      INSTAGRAM_HANDLE: 'radiant_smiles',
      FACEBOOK_URL: 'https://facebook.com/radiantsmiles',
    };
    const previewHtml = rawHtml.replace(PLACEHOLDER_RE, (_, key) =>
      key in DEMO ? DEMO[key] : `{{${key}}}`,
    );

    res.json({ ok: true, rawHtml, previewHtml });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Processing failed';
    res.status(500).json({ ok: false, error: msg });
  }
});

// ---------------------------------------------------------------------------
// Unified template registry — the ONE source of truth
// ---------------------------------------------------------------------------
//
// Returns BOTH the 8 built-in templates and the user's own custom
// templates (uploads, AI generations, Studio history conversions) in a
// single payload. The frontend uses this to populate the picker, the
// preview iframe, and the campaign wizard — all from the same list.
//
//   GET /api/templates           -> { builtins: [...], customs: [...], all: [...] }
//   GET /api/templates/:key/preview -> { html, name, niche, key, source }
//
// `key` is the unified template identifier:
//   - built-in: "barber-dark-luxury", "hvac-everest", ...
//   - custom:   "tmpl_xxx" (matches custom_templates.id)

import { resolveTemplate, listTemplates, loadPreviewHtml, NICHE_LIST } from './lib/templates.js';

// Back-compat: expose the niche list derived from the built-in registry.
// The frontend can fall back to its own static list if this 404s.
app.get('/api/niches', (req, res) => {
  res.json({ ok: true, niches: NICHE_LIST });
});

// Unified list — built-ins + this user's customs.
app.get('/api/templates', authenticate, async (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    const payload = await listTemplates(ownerKey || null);
    res.json({ ok: true, ...payload });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Built-in preview iframe source. Always public — the demo data has no
// PII. Custom templates are previewed through the auth-gated
// /api/custom-templates/:id/preview route instead, so we never accidentally
// serve someone else's uploaded HTML to a different user.
app.get('/api/templates/:key/preview', async (req, res) => {
  try {
    const resolved = await resolveTemplate(req.params.key, null);
    if (resolved.source !== 'builtin') {
      return res.status(404).json({ ok: false, error: 'Custom templates must be previewed through /api/custom-templates/:id/preview' });
    }
    const html = await loadPreviewHtml(resolved);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.send(html);
  } catch (err) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

// Resolve a single template descriptor (no HTML body).
app.get('/api/templates/:key', authenticate, async (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    const resolved = await resolveTemplate(req.params.key, ownerKey || null);
    res.json({ ok: true, template: resolved });
  } catch (err) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Template Lab — AI-powered custom template generation + management
// ---------------------------------------------------------------------------

// List template categories for the current owner.
app.get('/api/template-categories', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    const cats = db.prepare(
      'SELECT id, name, color, icon, sort_order FROM template_categories WHERE owner_key = ? ORDER BY sort_order ASC, created_at ASC',
    ).all(ownerKey);
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM custom_templates WHERE category_id = ?');
    const result = cats.map((c) => {
      const { count } = countStmt.get(c.id);
      return { id: c.id, name: c.name, color: c.color, icon: c.icon, sortOrder: c.sort_order, templateCount: count };
    });
    res.json({ ok: true, categories: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create a new template category.
app.post('/api/template-categories', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.body?.ownerKey || req.query.ownerKey || '').trim();
    const { name, color = '#2563EB', icon = 'layout' } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'name is required' });
    }
    const id = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Math.floor(Date.now() / 1000);
    const maxOrder = db.prepare(
      'SELECT MAX(sort_order) as m FROM template_categories WHERE owner_key = ?',
    ).get(ownerKey);
    const sortOrder = (maxOrder?.m ?? -1) + 1;
    db.prepare(
      'INSERT INTO template_categories (id, owner_key, name, color, icon, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, ownerKey, name.trim(), color, icon, sortOrder, now);
    res.json({ ok: true, category: { id, name: name.trim(), color, icon, sortOrder, templateCount: 0 } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update a template category.
app.put('/api/template-categories/:id', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    const { name, color, icon, sortOrder } = req.body || {};
    const existing = db.prepare(
      'SELECT * FROM template_categories WHERE id = ? AND owner_key = ?',
    ).get(req.params.id, ownerKey);
    if (!existing) return res.status(404).json({ ok: false, error: 'Category not found' });
    const updates = [];
    const values = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (color !== undefined) { updates.push('color = ?'); values.push(color); }
    if (icon !== undefined) { updates.push('icon = ?'); values.push(icon); }
    if (sortOrder !== undefined) { updates.push('sort_order = ?'); values.push(sortOrder); }
    if (updates.length === 0) return res.json({ ok: true, category: existing });
    values.push(req.params.id, ownerKey);
    db.prepare(`UPDATE template_categories SET ${updates.join(', ')} WHERE id = ? AND owner_key = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM template_categories WHERE id = ?').get(req.params.id);
    res.json({ ok: true, category: { id: updated.id, name: updated.name, color: updated.color, icon: updated.icon, sortOrder: updated.sort_order } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete a template category (templates move to uncategorized).
app.delete('/api/template-categories/:id', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    const existing = db.prepare(
      'SELECT * FROM template_categories WHERE id = ? AND owner_key = ?',
    ).get(req.params.id, ownerKey);
    if (!existing) return res.status(404).json({ ok: false, error: 'Category not found' });
    db.prepare('UPDATE custom_templates SET category_id = NULL WHERE category_id = ?').run(req.params.id);
    db.prepare('DELETE FROM template_categories WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// List custom templates for the current owner.
app.get('/api/custom-templates', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    const { categoryId } = req.query;
    let rows;
    if (categoryId) {
      rows = db.prepare(
        'SELECT id, category_id, name, slug, niche, style_tags, used_count, created_at FROM custom_templates WHERE owner_key = ? AND category_id = ? ORDER BY created_at DESC',
      ).all(ownerKey, categoryId);
    } else {
      rows = db.prepare(
        'SELECT id, category_id, name, slug, niche, style_tags, used_count, created_at FROM custom_templates WHERE owner_key = ? ORDER BY created_at DESC',
      ).all(ownerKey);
    }
    const templates = rows.map((r) => ({
      id: r.id, categoryId: r.category_id || null, name: r.name, slug: r.slug,
      niche: r.niche, styleTags: r.style_tags, usedCount: r.used_count, createdAt: r.created_at,
    }));
    res.json({ ok: true, templates });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get the preview HTML for a specific custom template (iframe-safe, pre-filled with demo data).
app.get('/api/custom-templates/:id/preview', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    const t = db.prepare(
      'SELECT * FROM custom_templates WHERE id = ? AND owner_key = ?',
    ).get(req.params.id, ownerKey);
    if (!t) return res.status(404).json({ ok: false, error: 'Template not found' });
    res.json({ ok: true, html: t.preview_html, name: t.name, niche: t.niche });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Generate a new template via AI — THE CORE ENDPOINT.
// Body: { prompt, niche, categoryId?, name?, ownerKey?, anthropicApiKey? }
app.post('/api/custom-templates/generate', authenticate, async (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.body?.ownerKey || req.query?.ownerKey || '').trim();
    const { prompt, niche = 'Local Business', categoryId = null, name, anthropicApiKey } = req.body || {};

    // Input validation
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 20) {
      return res.status(400).json({ ok: false, error: 'Prompt must be at least 20 characters.' });
    }
    if (prompt.trim().length > 2000) {
      return res.status(400).json({ ok: false, error: 'Prompt must be 2000 characters or fewer.' });
    }

    // Credit gate: 2 credits per generation
    const balance = checkBalance(ownerKey);
    if (balance.available < 2) {
      return res.status(402).json({ ok: false, error: 'Insufficient credits. Need 2 credits to generate a template.', needed: 2, available: balance.available });
    }

    // Charge 2 credits upfront
    charge(ownerKey, 2, 'template_generate', null);

    let rawHtml, previewHtml;
    try {
      ({ rawHtml, previewHtml } = await import('./lib/anthropic.js').then((m) =>
        m.generateTemplateHtml(prompt.trim(), niche, anthropicApiKey),
      ));
    } catch (genErr) {
      // Refund the 2 credits on AI failure
      refund(ownerKey, 2, 'template_gen_failed_refund', null);
      const msg = genErr instanceof Error ? genErr.message : 'Generation failed';
      // Distinguish between missing key and invalid key
      const isMissingKey = msg.includes('missing ANTHROPIC_API_KEY') || msg.includes('not configured');
      const isInvalidKey = msg.includes('401') || msg.includes('invalid') || msg.includes('Unauthorized') || msg.includes('authentication_error');
      if (isInvalidKey) {
        return res.status(401).json({ ok: false, error: 'Your Anthropic key is invalid. Please check it and try again.' });
      }
      return res.status(422).json({ ok: false, error: msg });
    }

    // Persist to DB
    const id = `tmpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const slug = (name || `template-${id}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const now = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO custom_templates (id, owner_key, category_id, name, slug, niche, raw_html, preview_html, style_tags, used_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    ).run(id, ownerKey, categoryId || null, name || `AI Template ${new Date().toLocaleDateString()}`, slug, niche, rawHtml, previewHtml, '', now);

    res.json({
      ok: true,
      template: { id, name: name || 'AI Template', slug, niche },
      creditsCharged: 2,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update a custom template (name, category, style tags).
app.put('/api/custom-templates/:id', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    const existing = db.prepare(
      'SELECT * FROM custom_templates WHERE id = ? AND owner_key = ?',
    ).get(req.params.id, ownerKey);
    if (!existing) return res.status(404).json({ ok: false, error: 'Template not found' });

    const { name, categoryId, styleTags } = req.body || {};
    const updates = [];
    const values = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (categoryId !== undefined) { updates.push('category_id = ?'); values.push(categoryId || null); }
    if (styleTags !== undefined) { updates.push('style_tags = ?'); values.push(styleTags); }

    if (updates.length > 0) {
      values.push(req.params.id, ownerKey);
      db.prepare(`UPDATE custom_templates SET ${updates.join(', ')} WHERE id = ? AND owner_key = ?`).run(...values);
    }

    const updated = db.prepare('SELECT * FROM custom_templates WHERE id = ?').get(req.params.id);
    res.json({
      ok: true,
      template: {
        id: updated.id, name: updated.name, slug: updated.slug, niche: updated.niche,
        categoryId: updated.category_id || null, styleTags: updated.style_tags,
        usedCount: updated.used_count, createdAt: updated.created_at,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete a custom template.
app.delete('/api/custom-templates/:id', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    const existing = db.prepare(
      'SELECT * FROM custom_templates WHERE id = ? AND owner_key = ?',
    ).get(req.params.id, ownerKey);
    if (!existing) return res.status(404).json({ ok: false, error: 'Template not found' });
    db.prepare('DELETE FROM custom_templates WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// In Railway (and any other PaaS), PORT is injected by the platform. We also
// log the public base URL so the boot banner shows what Twilio / Cloudflare
// should point at.
const PUBLIC_BASE =
  process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : PUBLIC_API_BASE_URL || `http://localhost:${PORT}`;

// ---- Startup self-check ---------------------------------------------------
// Verify the raw template directory is present and populated. On Railway, the
// `public/templates-raw/` folder MUST be committed to git; if it isn't, every
// campaign will silently fail with "Raw template not found" and the dashboard
// will show "0 sites generated" with no obvious error. This check makes that
// scenario loud and unmissable in the boot log and on /api/health.
import { existsSync, readdirSync } from 'node:fs';
import { TEMPLATES_RAW_DIR } from './lib/config.js';

function checkTemplates() {
  if (!existsSync(TEMPLATES_RAW_DIR)) {
    return { ok: false, count: 0, path: TEMPLATES_RAW_DIR, reason: 'directory missing' };
  }
  const files = readdirSync(TEMPLATES_RAW_DIR).filter((f) => f.endsWith('.html'));
  if (files.length === 0) {
    return { ok: false, count: 0, path: TEMPLATES_RAW_DIR, reason: 'directory is empty' };
  }
  return { ok: true, count: files.length, path: TEMPLATES_RAW_DIR, reason: null };
}

export const templatesCheck = checkTemplates();

app.listen(PORT, () => {
  const mode = modeSummary();
  console.log(`\n  Lunao pipeline API  ->  http://localhost:${PORT}`);
  console.log(`  Public base        : ${PUBLIC_BASE}`);
  console.log(`  Telnyx SMS         : ${mode.telnyx}`);
  console.log(`  Cloudflare Pages   : ${mode.cloudflare}`);
  console.log(`  Google Maps        : ${mode.googleMaps}`);
  console.log(`  AI Editor          : ${mode.aiEditor}`);
  console.log(`  Chatbot            : ${mode.chatbot}`);
  console.log(`  Site base URL      : ${mode.siteBaseUrl}`);
  console.log(`  DB                 : ${process.env.DATABASE_URL ? 'Postgres (Railway)' : 'SQLite (local)'}`);
  console.log(`  Auth cookies       : secure=${process.env.NODE_ENV === 'production'} sameSite=lax trustProxy=${app.get('trust proxy')}`);
  if (templatesCheck.ok) {
    console.log(`  Raw templates      : ${templatesCheck.count} files at ${templatesCheck.path}`);
  } else {
    console.log(`  Raw templates      : MISSING (${templatesCheck.reason}) at ${templatesCheck.path}`);
    console.log(`                     Campaigns will fail with "0 sites generated".`);
    console.log(`                     Fix: git add public/templates-raw/*.html && git commit && git push.`);
  }
  console.log('');
});
