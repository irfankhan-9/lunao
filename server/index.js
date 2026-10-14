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
import {
  TIER,
  normalisePlan,
  tierLevel,
  canUseOwnTelnyx,
  isAutomatedSmsPlan,
  allowedCountries,
  requirePlan,
} from './lib/planGates.js';
import {
  discoverSmsLeadsFromPlaces,
  CA_PROVINCES,
} from './lib/smsLeads.js';
import { listCities } from './lib/cities.js';
import { publishBatch, validateCloudflareToken, stageSite } from './lib/cloudflare.js';
import { slugify } from './lib/slug.js';
import { streamEdit, isAiEnabled, cleanHtmlOutput, generateTemplateHtml } from './lib/geminiAi.js';
import { createBooking, listBookings, updateBookingStatus } from './lib/bookings.js';
import { chatTurn } from './lib/chatbot.js';
import { getAddons, setAddons } from './lib/widget.js';
import { db } from './lib/db.js';
import { lookup as lookupCity, getStatus as getCitiesStatus, loadPromise as citiesLoadPromise, pickNextCity } from './lib/cities.js';
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
import { mountPwaApi } from './lib/pwaApi.js';
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
  listEmailLeadsWithAccounts,
} from './lib/emailCampaigns.js';
import { runDorkPipeline } from './lib/dorkPipeline.js';
import {
  buildGmailAuthUrl,
  exchangeGmailCode,
  getGmailUserProfile,
  encryptRefreshTokenForStorage,
  decryptRefreshTokenForUse,
} from './lib/gmail.js';
import { googleOAuth, telnyxOAuth } from './lib/config.js';
import {
  // Telnyx OAuth (Connect with Telnyx button)
  buildTelnyxAuthUrl,
  exchangeTelnyxCode,
  refreshTelnyxAccessToken,
  getTelnyxProfile,
  encryptTelnyxTokenForStorage,
  decryptTelnyxTokenForUse,
  generatePkcePair,
} from './lib/telnyxOAuth.js';
import {
  createTelnyxConnection,
  getTelnyxConnection,
  listTelnyxConnections,
  updateTelnyxConnectionTokens,
  updateTelnyxConnectionStatus,
  updateTelnyxConnectionNumbers,
  deleteTelnyxConnection,
} from './lib/telnyxConnections.js';
import {
  listMessagingProfiles,
  setupNumberForSms,
  checkNumberSmsCapability,
  getNumberMessagingProfile,
  assignNumbersToProfile,
  checkProfileCountryEligibility,
  checkProfileWebhookStatus,
  updateMessagingProfileWebhook,
  updateMessagingProfileAtomic,
  getMessagingProfileDetails,
} from './lib/telnyxMessagingProfile.js';
import {
  checkPhoneNumberEligibility,
} from './lib/telnyxDestination.js';
import { recheckSmsRows, startGlobalRechecker } from './lib/telnyxLiveRecheck.js';
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
import { scanTemplateReadiness, fixHtmlToTemplateReady, runRebrandingTests } from './lib/readiness.js';

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
//
// Accepts either `csv` (raw text) in the body, or a `text` field for
// multipart/form clients. Forwards an `allowedCountries` array (ISO-2
// codes) so the SMS wizard can lock Free/Starter plans to Canada.
app.post('/api/csv/parse', authenticate, (req, res) => {
  try {
    const text = typeof req.body === 'string' ? req.body : req.body?.csv || req.body?.text;
    const ownerKey = ownerKeyForCallback(req);
    // Resolve plan from request body, header, or stored account default.
    const rawPlan = req.body?.plan || req.headers['x-user-plan'];
    const plan = normalisePlan(rawPlan);
    // For automated plans (Free/Starter), force the country restriction
    // even if the caller forgot to send allowedCountries — defence in
    // depth.
    const planAllowed = allowedCountries(plan);
    const requested = Array.isArray(req.body?.allowedCountries)
      ? req.body.allowedCountries.map((c) => String(c).toUpperCase())
      : null;
    const allowed = planAllowed || requested || null;

    const report = validateCsv(text || '', { allowedCountries: allowed });
    res.json({
      ok: report.ok,
      count: report.validCount,
      leads: report.leads,
      plan,
      allowedCountries: allowed,
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

  // Resolve SMS routing BEFORE the pipeline starts:
  //   - Free and Starter plans (automated) MUST NOT use the user's
  //     connected Telnyx account. We drop smsAccountId and force
  //     smsFrom to the Lunao shared Canadian sender (TELNYX_PHONE_NUMBER).
  //   - Growth/Pro/Agency may optionally pass accountId+from to use
  //     their own Telnyx account. If they didn't pass anything, we fall
  //     back to the shared sender too (so the wizard doesn't need to
  //     duplicate logic).
  const resolvedPlan = normalisePlan(plan);
  const requestedAccountId = req.body?.sms?.accountId || null;
  const requestedFrom = req.body?.sms?.from || null;
  let smsAccountId = requestedAccountId;
  let smsFrom = requestedFrom;
  if (isAutomatedSmsPlan(resolvedPlan)) {
    // Defence in depth: even if the client lied, we strip it here.
    smsAccountId = null;
    smsFrom = telnyx.from || '';
  } else if (requestedAccountId && !canUseOwnTelnyx(resolvedPlan)) {
    return res.status(403).json({
      ok: false,
      error: 'Your plan does not allow connecting your own Telnyx. Upgrade to Growth.',
    });
  }

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
      // OAuth-aware SMS: when the request carries { sms: { accountId, from } },
      // forward them to the pipeline so sendSms uses the per-owner OAuth token
      // instead of the server-level TELNYX_API_KEY.
      smsAccountId,
      smsFrom,
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

// Single business AI rebrand + stage + live deploy endpoint.
// Powers the sequential step-by-step AI deployment in SiteDeployCampaignWizard.
app.post('/api/site-deploy/rebrand-single', async (req, res) => {
  try {
    const { business, niche, templateKey, ownerKey, deploy = true } = req.body || {};
    if (!business || !business.name) {
      return res.status(400).json({ ok: false, error: 'Business name is required' });
    }

    const effectiveNiche = business.niche || niche || 'Barber';
    const effectiveKey = business.templateKey || templateKey || effectiveNiche;
    const slug = business.slug || slugify(business.name, business.city || '');

    // 1. Compile personalized site with exact template placeholders
    const { html, resolved } = await compileSite(business, effectiveKey, ownerKey || null);

    // 2. Stage locally to disk in SITES_DIR
    const localUrl = await stageSite(slug, html);

    // 3. Deploy to Lunao / Cloudflare servers
    const projName = cloudflare.project || 'lunao-web-designn';
    let liveUrl = `https://${projName}.pages.dev/${slug}/`;
    let deployed = true;
    try {
      if (deploy) {
        await publishBatch();
      }
    } catch (err) {
      console.warn('[rebrand-single] Cloudflare deploy error:', err.message);
    }

    res.json({
      ok: true,
      slug,
      siteUrl: liveUrl,
      localUrl: liveUrl,
      deployed,
      name: business.name,
      city: business.city || '',
      phone: business.phone || '',
      status: 'live',
      templateName: resolved?.name || 'Standard',
    });
  } catch (err) {
    console.error('[rebrand-single] error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
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
// AI site editing powered by Google AI Studio Gemini 2.5 Flash built-in
app.post('/api/ai/edit', async (req, res) => {
  const { html, instruction, history, anthropicApiKey, apiKey, geminiApiKey } = req.body || {};

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  const userKey = (geminiApiKey || apiKey || (typeof anthropicApiKey === 'string' && anthropicApiKey.startsWith('AI') ? anthropicApiKey : null));
  const hasUserKey = typeof userKey === 'string' && userKey.trim().length > 10;
  if (!hasUserKey && !isAiEnabled()) {
    send({ type: 'error', error: 'AI engine initializing. Google AI Studio Gemini API key is being configured.' });
    return res.end();
  }
  if (typeof html !== 'string' || !html.trim() || typeof instruction !== 'string' || !instruction.trim()) {
    send({ type: 'error', error: 'html and instruction are required.' });
    return res.end();
  }

  try {
    send({ type: 'start' });
    const full = await streamEdit(
      { html, instruction, history, apiKey: userKey || undefined },
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
    if (typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ ok: false, error: 'Please enter an owner access code or website slug.' });
    }
    let input = code.trim();
    let upperCode = input.toUpperCase();
    if (!upperCode.startsWith('LUNAO-') && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(upperCode)) {
      upperCode = `LUNAO-${upperCode}`;
    }

    const sites = listSitesSync();

    // 1. Try finding by invite code first
    let row = findByCode(upperCode);
    let target = null;

    if (row) {
      if (row.revokedAt) {
        return res.status(404).json({ ok: false, error: 'This invite code has been revoked.' });
      }
      target = sites.find((s) => s.slug === row.slug);
    } else {
      // 2. Try finding by website slug / code (e.g. "everest-climate-denver")
      const cleanSlug = input.toLowerCase().replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '').trim();
      target = sites.find((s) => s.slug.toLowerCase() === cleanSlug || s.slug.toLowerCase() === input.toLowerCase()) ||
               sites.find((s) => s.slug.toLowerCase().includes(cleanSlug) || cleanSlug.includes(s.slug.toLowerCase()));

      if (target) {
        // Reuse an existing active invite code for this site or create a new one
        const existingRow = db.prepare('SELECT * FROM invite_codes WHERE slug = ? AND revoked_at IS NULL ORDER BY id DESC LIMIT 1').get(target.slug);
        if (existingRow) {
          row = {
            id: existingRow.id,
            code: existingRow.code,
            slug: existingRow.slug,
            label: existingRow.label,
          };
        } else {
          const newCodeRec = createCode(target.slug, 'PWA Website Access');
          row = {
            id: newCodeRec.id,
            code: newCodeRec.code,
            slug: target.slug,
            label: newCodeRec.label,
          };
        }
      }
    }

    if (!target || !row) {
      return res.status(404).json({
        ok: false,
        error: `Could not find business for "${input}". Please check your code or enter a valid website name.`,
      });
    }

    touchCode(row.code, deviceLabel);
    const token = generateToken(row.code);
    return res.json({
      ok: true,
      token,
      slug: target.slug,
      businessName: target.title,
      niche: target.niche,
      siteUrl: target.url,
      inviteCode: { id: row.id, code: row.code, label: row.label },
    });
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
  // Retired: the Owner App is a PWA, not a native Expo app. Push tokens are
  // delivered via the Web Push API (future work) keyed by slug.
  return res.status(410).json({ ok: false, error: 'Gone. Use Web Push (PWA).' });
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

app.get('/api/campaigns/:id', authenticate, async (req, res) => {
  try {
    const c = getCampaign(req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    const leads = listLeads(c.id);
    const sms = listSmsForCampaign(c.id);
    // Live re-check on every poll, so the UI shows real delivered/failed
    // counts instead of whatever the webhook happened to land.
    recheckSmsRows(sms).catch((e) => console.warn('[recheck] campaign:', e.message));
    res.json({ ok: true, campaign: c, leads, sms, asOf: Date.now() });
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
    const leads = listEmailLeadsWithAccounts(campaign.id);
    res.json({ ok: true, campaign, leads });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get leads for an email campaign with account email info
app.get('/api/email-campaigns/:id/leads', authenticate, (req, res) => {
  try {
    const campaign = getEmailCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    const leads = listEmailLeadsWithAccounts(campaign.id);
    res.json({ ok: true, leads });
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

// =============================================================================
// DORK / CITY LOOKUP API ENDPOINTS
// =============================================================================

// City resolution lives in ./lib/cities.js. That module loads a small
// seed list synchronously at import time, then streams the full GeoNames
// cities500.txt dump (~200k world cities, ~40 MB on disk) into an
// in-memory index in the background. The lookup endpoint below is the
// thin Express wrapper around it.

app.get('/api/dork/lookup-city', (req, res) => {
  const q = String(req.query.q || '').trim();
  res.json(lookupCity(q));
});

app.get('/api/dork/status', (_req, res) => {
  const s = getCitiesStatus();
  res.json({
    apiKeyConfigured: false,
    lastError: s.fileLoaded
      ? undefined
      : `Dork API is using built-in city database (${s.records.toLocaleString()} cities; ${s.error || 'GeoNames file still loading'})`,
    cityCount: s.records,
    citiesLoaded: s.fileLoaded,
  });
});

// ---- Gmail OAuth flow (Connect Gmail button) ----

// Build the provider's authorization URL. The frontend opens this URL, the
// user approves on Google's own consent screen, and Google redirects back to
// /api/email-accounts/callback with a one-time `code`.
// OAuth state storage. Persisted to SQLite so OAuth survives server restarts.
// The in-memory Map (`oauthStateStore`) is now a read-through cache backed by
// the `oauth_states` table. Reads check DB first, then cache. Writes go to both.
const oauthStateStore = new Map(); // state -> { ownerKey, createdAt, provider } (cache)
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_STATE_CACHE_TTL_MS = 5 * 60 * 1000; // keep in cache for 5 min

// DB-backed OAuth state helpers
function getOauthState(state) {
  // Check cache first
  const cached = oauthStateStore.get(state);
  if (cached) {
    if (Date.now() - cached.createdAt < OAUTH_STATE_CACHE_TTL_MS) return cached;
    oauthStateStore.delete(state);
  }
  // Fall back to DB
  const row = db.prepare('SELECT * FROM oauth_states WHERE state = ? AND expires_at > ?')
    .get(state, Date.now());
  if (row) {
    const data = {
      ownerKey: row.owner_key,
      createdAt: row.created_at,
      provider: row.provider,
      codeVerifier: row.code_verifier,
    };
    oauthStateStore.set(state, data);
    return data;
  }
  return null;
}

function setOauthState(state, data) {
  // Write to DB
  db.prepare(
    'INSERT OR REPLACE INTO oauth_states (state, owner_key, provider, created_at, expires_at, code_verifier) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(state, data.ownerKey, data.provider || 'gmail', data.createdAt, data.createdAt + OAUTH_STATE_TTL_MS, data.codeVerifier || null);
  // Also cache
  oauthStateStore.set(state, { ownerKey: data.ownerKey, createdAt: data.createdAt, provider: data.provider || 'gmail', codeVerifier: data.codeVerifier || null });
}

function deleteOauthState(state) {
  oauthStateStore.delete(state);
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
}

// Periodic cleanup of expired OAuth states (run every 2 minutes)
function startOauthStateCleanup() {
  setInterval(() => {
    const deleted = db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(Date.now());
    if (deleted.changes > 0) {
      console.log(`[oauth] cleaned up ${deleted.changes} expired state(s)`);
    }
  }, 2 * 60 * 1000);
}
// Start cleanup after DB is ready (server startup calls this after citiesLoadPromise)
export function startOauthCleanupAfterInit() { startOauthStateCleanup(); }

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
    // Persist to DB (survives server restarts)
    setOauthState(state, { ownerKey, createdAt: Date.now(), provider });

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
  // The frontend passes the opener URL as base64-encoded JSON in `_ru`.
  const _ru = String(req.query._ru || '');
  let openerUrl = null;
  if (_ru) { try { openerUrl = decodeURIComponent(atob(_ru)); } catch { /* ignore */ } }

  // Friendly HTML shell so the user always sees SOMETHING, even on errors.
  const sendHtml = (title, body, autoClose = true) => {
    const postMsgScript = autoClose ? `
      if (window.opener) {
        try { window.opener.postMessage({ type: 'LUNAO_EMAIL_CONNECTED' }, '*'); } catch(e) {}
        setTimeout(function(){ try { window.close(); } catch(e) {} }, 800);
      } else if (${JSON.stringify(openerUrl || '')}) {
        setTimeout(function(){ window.location.href = ${JSON.stringify(openerUrl || '')} + '?email_connected=true'; }, 1000);
      }
    ` : '';
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
      ${postMsgScript}
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
  
  const stateData = getOauthState(String(state));
  if (!stateData) {
    return sendHtml('Session expired', '<p class="err">Please return to the dashboard and click Connect again.</p>', false);
  }
  if (Date.now() - stateData.createdAt > OAUTH_STATE_TTL_MS) {
    deleteOauthState(String(state));
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

    deleteOauthState(String(state));
    
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

// ---- Telnyx OAuth flow (Connect Telnyx button) ----
//
// Mirrors the Gmail OAuth pattern but lives in its own /api/telnyx/* namespace
// so the two providers can evolve independently. State tokens live in the same
// `oauthStateStore` Map() used by Gmail — they're namespaced via prefix so
// the two flows cannot collide.

// 1. Generate the authorization URL. The frontend opens this URL, the user
//    approves on Telnyx's hosted consent page, and Telnyx redirects to
//    /api/telnyx/callback with a one-time `code`.
//
//    PKCE: every registered Telnyx client has require_pkce=true, so we MUST
//    generate a fresh verifier + S256 challenge per request. The verifier is
//    stashed against the CSRF `state` token in `oauthStateStore` so the
//    callback can read it back to complete the token exchange.
function telnyxConnectHandler(req, res) {
  try {
    if (!telnyxOAuth.enabled) {
      return res.status(503).json({
        ok: false,
        error: 'Telnyx OAuth not configured. Set TELNYX_CLIENT_ID and TELNYX_CLIENT_SECRET in .env.local.',
      });
    }
    const ownerKey = ownerKeyForCallback(req);
    const state = `tn_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
    const { codeVerifier, codeChallenge, codeChallengeMethod } = generatePkcePair();
    // Persist to DB (survives server restarts)
    setOauthState(state, {
      ownerKey,
      createdAt: Date.now(),
      provider: 'telnyx',
      codeVerifier,
    });

    const redirectUri = `${redirectBase()}/api/telnyx/callback`;
    const url = buildTelnyxAuthUrl({
      redirectUri,
      state,
      codeChallenge,
      codeChallengeMethod,
    });
    res.json({ ok: true, url, redirectUri });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
// Telnyx OAuth integration health check — no auth required so the UI can
// surface connection status without a login round-trip.
app.get('/api/telnyx/status', (req, res) => {
  res.json({
    ok: true,
    oauthEnabled: telnyxOAuth.enabled,
    clientId: telnyxOAuth.clientId ? telnyxOAuth.clientId.slice(0, 8) + '***' : null,
    redirectUri: telnyxOAuth.enabled ? telnyxOAuth.authorizationUrl : null,
    note: telnyxOAuth.enabled
      ? 'Telnyx OAuth is ready. Users can click "Connect with Telnyx" in Settings.'
      : 'Set TELNYX_CLIENT_ID in .env.local to enable Telnyx OAuth.',
  });
});

// Aggregate Telnyx connection health for the SMS campaign wizard.
// Returns ONE compact payload so the frontend can render a smooth,
// single-shot loading state and pick the right CTA — instead of a
// sequence of fetches that flips the UI between three empty states.
//
//   {
//     ok: true,
//     connected:        boolean,   // any Telnyx account row exists
//     accountsActive:   number,    // count of status === 'active'
//     accountsNeedReconnect: number,
//     hasValidToken:    boolean,   // at least one active account whose access
//                                  // token we can decrypt + refresh right now
//     primaryAccount:   { email, label, expiresAt, expiresInSec } | null,
//     numbersTotal:     number,    // sum of numbers on active accounts
//     readyNumbers:     number,    // numbers with messaging profile assigned
//   }
app.get('/api/telnyx/connection-status', authenticate, async (req, res) => {
  try {
    const ownerKey = ownerKeyForCallback(req);
    const plan = normalisePlan(req.query?.plan || req.headers['x-user-plan']);
    // telnyx is the shared Lunao account — used for Free/Starter automated SMS.
    const sharedEnabled = Boolean(telnyx.enabled && telnyx.apiKey && telnyx.from);

    // Free / Starter users never see a connected Telnyx account. They
    // use Lunao's shared sender. Return a synthetic "ready" status so
    // the wizard renders the Lunao shared-sender card without the
    // previous "Connect with Telnyx" CTA.
    if (isAutomatedSmsPlan(plan)) {
      // Note: we intentionally skip the app_settings lookup here since the
      // `app_settings` table may not exist in all deployments. We rely
      // solely on the env-based telnyx config (telnyx.from / telnyx.enabled).
      const from = telnyx.from || '';
      const apiKeyOk = sharedEnabled;
      return res.json({
        ok: true,
        plan,
        automated: true,
        connected: apiKeyOk,
        hasValidToken: apiKeyOk,
        accountsActive: apiKeyOk ? 1 : 0,
        accountsNeedReconnect: apiKeyOk ? 0 : 1,
        primaryAccount: apiKeyOk
          ? {
              email: 'lunao@shared',
              label: 'Lunao shared Canadian sender',
              expiresAt: null,
              expiresInSec: null,
              shared: true,
            }
          : null,
        senderNumber: from,
        // numbersTotal + readyNumbers are 0 here; the wizard's automated
        // path doesn't need a per-account number count.
        numbersTotal: 0,
        readyNumbers: 0,
        // Surface the configured price so the wizard can show e.g.
        // "From +1 437-555-0142 · verified Canadian sender".
        note: apiKeyOk
          ? null
          : 'LUNAO_TELNYX_API_KEY or TELNYX_PHONE_NUMBER is not configured. Set them in .env to enable automated SMS for Free and Starter.',
      });
    }

    const allAccounts = listTelnyxConnections(ownerKey);
    const active = allAccounts.filter((a) => a.status === 'active');
    const needsReconnect = allAccounts.length - active.length;

    if (allAccounts.length === 0) {
      return res.json({
        ok: true,
        plan,
        automated: false,
        connected: false,
        accountsActive: 0,
        accountsNeedReconnect: 0,
        hasValidToken: false,
        primaryAccount: null,
        numbersTotal: 0,
        readyNumbers: 0,
      });
    }

    // Pick the first active account to probe for token health. If it 401s,
    // the backend will set status='needs_reconnect' automatically and
    // we re-list to reflect that in the response.
    let primaryAccount = active[0] || null;
    let hasValidToken = false;
    let expiresAt = null;
    let expiresInSec = null;

    if (primaryAccount) {
      try {
        const token = await resolveTelnyxAccessToken(primaryAccount);
        if (token) {
          hasValidToken = true;
          expiresAt = primaryAccount.expires_at || null;
          expiresInSec = expiresAt ? Math.max(0, expiresAt - Math.floor(Date.now() / 1000)) : null;
        }
      } catch (_) {
        hasValidToken = false;
      }

      // If the active account just got demoted to needs_reconnect, refresh.
      if (!hasValidToken && active.length > 0) {
        try {
          const fresh = listTelnyxConnections(ownerKey);
          const refreshedActive = fresh.filter((a) => a.status === 'active');
          if (refreshedActive.length !== active.length) {
            // We re-read the rows; rebuild the snapshot.
            const freshPrimary = refreshedActive[0] || primaryAccount;
            return res.json({
              ok: true,
              plan,
              automated: false,
              connected: true,
              accountsActive: refreshedActive.length,
              accountsNeedReconnect: fresh.length - refreshedActive.length,
              hasValidToken: false,
              primaryAccount: freshPrimary
                ? {
                    email: freshPrimary.account_email,
                    label: freshPrimary.account_label,
                    expiresAt: freshPrimary.expires_at || null,
                    expiresInSec:
                      freshPrimary.expires_at
                        ? Math.max(0, freshPrimary.expires_at - Math.floor(Date.now() / 1000))
                        : null,
                  }
                : null,
              numbersTotal: 0,
              readyNumbers: 0,
            });
          }
        } catch (_) {
          // ignore — fall through with what we have
        }
      }
    }

    res.json({
      ok: true,
      plan,
      automated: false,
      connected: true,
      accountsActive: active.length,
      accountsNeedReconnect: needsReconnect,
      hasValidToken,
      primaryAccount: primaryAccount
        ? {
            email: primaryAccount.account_email,
            label: primaryAccount.account_label,
            expiresAt,
            expiresInSec,
          }
        : null,
      // numbersTotal + readyNumbers are populated by a follow-up request
      // when active accounts exist and a token is valid; here we just
      // expose the row count so the wizard can show "X numbers on file".
      numbersTotal: active.reduce((sum, a) => sum + (a.total_numbers || 0), 0),
      readyNumbers: 0,
    });
  } catch (err) {
    console.error('[telnyx/connection-status]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Telnyx OAuth "Connect" entry-point. Gated to Growth/Pro/Agency plans —
// Free and Starter do not see the OAuth UI in the wizard, and these
// endpoints 403 them even if they hand-craft the URL. This is the
// server-side enforcement of the plan-tier boundary.
app.get(
  '/api/telnyx/oauth/url',
  authenticate,
  requirePlan('Growth Plan'),
  telnyxConnectHandler,
);
app.get(
  '/api/telnyx/connect',
  authenticate,
  requirePlan('Growth Plan'),
  telnyxConnectHandler,
);

// 2. Provider redirect target. Exchanges the code for tokens, validates the
//    access token by listing phone numbers, encrypts both tokens with
//    AES-256-GCM, and stores them in telnyx_connections. Then shows a
//    friendly HTML page that closes the popup and tells the user it worked.
app.get('/api/telnyx/callback', async (req, res) => {
  const { code, state, error } = req.query;

  // Reuse Gmail's friendly HTML shell — same visual, but smarter close behaviour:
// if this page was opened by the dashboard (window.opener is set) we postMessage
// back to the opener and then close the popup. If the user navigated here
// directly (no opener) we leave it open so they can read the message.
const sendHtml = (title, body, status = 'ok') => {
    const safeTitle = escapeHtml(title);
    const statusJson = JSON.stringify({
      type: 'lunao:telnyx-oauth-result',
      status,
      title,
    });
    // The opener targetOrigin should match the dashboard's origin. We can't
    // know it server-side, so '*' is intentional — but we only ever send
    // status info (no secrets). Same-window navigations fall back to the
    // visible "click here" button if window.close() is blocked.
    const openerScript = `
      (function () {
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(${statusJson}, '*');
            // Give the message a moment to flush before closing. window.close()
            // immediately after postMessage can race in some browsers.
            setTimeout(function () {
              try { window.close(); } catch (e) {}
              // Some browsers refuse to close a tab they didn't open. Show
              // a fallback link so the user can return manually.
              setTimeout(function () {
                if (!window.closed) {
                  var btn = document.getElementById('lunao-close-fallback');
                  if (btn) btn.style.display = 'block';
                }
              }, 300);
            }, 400);
          } else {
            var btn = document.getElementById('lunao-close-fallback');
            if (btn) btn.style.display = 'block';
          }
        } catch (e) { /* ignore */ }
      })();
    `;
    const fallbackLink = status === 'ok'
      ? '<a id="lunao-close-fallback" href="javascript:window.close()" style="display:none; margin-top: 16px; display: inline-block; padding: 8px 18px; border-radius: 8px; background: #047857; color: white; text-decoration: none; font-size: 13px; font-weight: 600;">Return to dashboard</a>'
      : '<a id="lunao-close-fallback" href="javascript:window.close()" style="display:none; margin-top: 16px; display: inline-block; padding: 8px 18px; border-radius: 8px; background: #b91c1c; color: white; text-decoration: none; font-size: 13px; font-weight: 600;">Close window</a>';
    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${safeTitle}</title>
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
    <body><div class="card"><h1>${safeTitle}</h1>${body}${fallbackLink}<div class="spinner"></div></div>
    <script>${openerScript}</script></body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  };

  if (error) {
    return sendHtml(
      'Connection cancelled',
      `<p class="err">Telnyx returned: <strong>${escapeHtml(String(error))}</strong></p><p>Close this window and try again from the dashboard.</p>`,
      'error',
    );
  }
  if (!code || !state) {
    return sendHtml('Invalid callback', '<p class="err">Missing code or state from Telnyx.</p>', 'error');
  }

  const stateData = getOauthState(String(state));
  if (!stateData) {
    return sendHtml('Session expired', '<p class="err">Please return to the dashboard and click Connect again.</p>', 'error');
  }
  if (Date.now() - stateData.createdAt > OAUTH_STATE_TTL_MS) {
    deleteOauthState(String(state));
    return sendHtml('Session timed out', '<p class="err">Restart the connection from the dashboard.</p>', 'error');
  }

  try {
    const redirectUri = `${redirectBase()}/api/telnyx/callback`;
    const tokens = await exchangeTelnyxCode({
      code: String(code),
      redirectUri,
      codeVerifier: stateData.codeVerifier,
    });

    if (!tokens.access_token) {
      throw new Error('Telnyx did not return an access_token. Make sure your OAuth client has the authorization_code grant enabled.');
    }

    // Validate the access token by listing phone numbers. This is our only
    // way to confirm the token actually works — Telnyx has no userinfo
    // endpoint today.
    let totalNumbers = null;
    try {
      const profile = await getTelnyxProfile(tokens.access_token);
      totalNumbers = profile.totalNumbers;
    } catch (probeErr) {
      // Don't fail the connection just because the probe failed — the
      // token may still be valid for /v2/messages even if /v2/phone_numbers
      // returns a transient error.
      console.warn('[telnyx-oauth] probe after exchange failed:', probeErr.message);
    }

    const encryptedAccess = encryptTelnyxTokenForStorage(tokens.access_token);
    const encryptedRefresh = tokens.refresh_token ? encryptTelnyxTokenForStorage(tokens.refresh_token) : null;
    if (!encryptedAccess) {
      throw new Error('Failed to encrypt access token. Check EMAIL_TOKEN_ENCRYPTION_KEY in .env.');
    }

    const expiresAt = tokens.expires_in
      ? Math.floor(Date.now() / 1000) + Number(tokens.expires_in)
      : null;

    const accountLabel = totalNumbers != null
      ? `Telnyx account (${totalNumbers} number${totalNumbers === 1 ? '' : 's'})`
      : 'Telnyx account';

    createTelnyxConnection({
      userId: stateData.ownerKey,
      accountEmail: '', // Telnyx OAuth doesn't expose an email today
      accountLabel,
      encryptedAccessToken: encryptedAccess,
      encryptedRefreshToken: encryptedRefresh,
      expiresAt,
      totalNumbers: totalNumbers || 0,
    });

    deleteOauthState(String(state));

    return sendHtml(
      'Telnyx connected',
      `<p class="ok"><strong>${escapeHtml(accountLabel)}</strong> is ready to send.</p><p>You can close this window — your dashboard has updated.</p>`,
      'success',
    );
  } catch (err) {
    return sendHtml('Connection failed', `<p class="err">${escapeHtml(err.message)}</p><p>Close this window and try again.</p>`, 'error');
  }
});

// 3. List every connected Telnyx account for the current owner.
app.get('/api/telnyx/accounts', authenticate, (req, res) => {
  try {
    const ownerKey = ownerKeyForCallback(req);
    const plan = normalisePlan(req.query?.plan || req.headers['x-user-plan']);
    // Free and Starter users always have zero connected accounts — they
    // use Lunao's shared sender. Return an empty list (NOT 403) so the
    // wizard's "list accounts" call simply yields no rows and the UI
    // renders the Lunao shared-sender view.
    if (isAutomatedSmsPlan(plan)) {
      return res.json({ ok: true, accounts: [], plan, automated: true });
    }
    const accounts = listTelnyxConnections(ownerKey).map((a) => {
      // Strip the encrypted tokens from the wire payload — the dashboard
      // never needs them. We expose status + total_numbers + expires_at so
      // the UI can render "active", "needs reconnect", and the phone count.
      const expiresIn = a.expires_at ? a.expires_at - Math.floor(Date.now() / 1000) : null;
      return {
        id: a.id,
        account_email: a.account_email,
        account_label: a.account_label,
        total_numbers: a.total_numbers,
        status: a.status,
        expires_at: a.expires_at,
        expires_in: expiresIn,
        connected_at: a.connected_at,
      };
    });
    res.json({ ok: true, accounts, plan });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 4. Delete a connected Telnyx account. Stops future SMS sends using this
//    connection (the pipeline silently skips if no active connection exists).
app.delete('/api/telnyx/accounts/:id', authenticate, requirePlan('Growth Plan'), (req, res) => {
  try {
    const ownerKey = ownerKeyForCallback(req);
    const conn = getTelnyxConnection(req.params.id);
    if (!conn) return res.status(404).json({ ok: false, error: 'Connection not found' });
    if (conn.user_id !== ownerKey) {
      return res.status(403).json({ ok: false, error: 'Not your connection' });
    }
    deleteTelnyxConnection(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 5. List phone numbers owned by the connected Telnyx account. The SMS
//    campaign builder uses this to render the sender-number picker — every
//    number on the account is offered as a potential "From" address.
app.get('/api/telnyx/accounts/:id/numbers', authenticate, async (req, res) => {
  try {
    const ownerKey = ownerKeyForCallback(req);
    const conn = getTelnyxConnection(req.params.id);
    if (!conn) return res.status(404).json({ ok: false, error: 'Connection not found' });
    if (conn.user_id !== ownerKey) {
      return res.status(403).json({ ok: false, error: 'Not your connection' });
    }

    // Decrypt access token, refresh if expired, then list numbers.
    const accessToken = await resolveTelnyxAccessToken(conn);
    if (!accessToken) {
      updateTelnyxConnectionStatus(conn.id, 'needs_reconnect');
      return res.status(401).json({ ok: false, error: 'Access token expired or revoked. Please reconnect.' });
    }

    const listRes = await fetch('https://api.telnyx.com/v2/phone_numbers?page[size]=50', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!listRes.ok) {
      const text = await listRes.text().catch(() => '');
      if (listRes.status === 401 || listRes.status === 403) {
        updateTelnyxConnectionStatus(conn.id, 'needs_reconnect');
      }
      return res.status(listRes.status).json({ ok: false, error: `Telnyx: ${text || listRes.statusText}` });
    }
    const data = await listRes.json().catch(() => ({}));
    const numbers = Array.isArray(data?.data) ? data.data : [];
    const result = numbers
      .filter((n) => n?.phone_number)
      .map((n) => ({
        number: String(n.phone_number),
        type: 'phone_number',
        sms: true,
        id: n.id || null,
      }));

    // Update the cached total_numbers count so the dashboard stays accurate.
    updateTelnyxConnectionNumbers(conn.id, result.length);

    res.json({ ok: true, numbers: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get phone numbers with their messaging profile status (eligibility check)
app.get('/api/telnyx/accounts/:id/numbers-with-status', authenticate, async (req, res) => {
  try {
    const ownerKey = ownerKeyForCallback(req);
    const conn = getTelnyxConnection(req.params.id);
    if (!conn) return res.status(404).json({ ok: false, error: 'Connection not found' });
    if (conn.user_id !== ownerKey) {
      return res.status(403).json({ ok: false, error: 'Not your connection' });
    }

    // Get fresh access token
    const accessToken = await resolveTelnyxAccessToken(conn);
    if (!accessToken) {
      updateTelnyxConnectionStatus(conn.id, 'needs_reconnect');
      return res.status(401).json({ ok: false, error: 'Access token expired or revoked. Please reconnect.' });
    }

    console.log(`[telnyx] numbers-with-status: fetching numbers for account ${conn.id}`);
    // Get the list of numbers from Telnyx - request all messaging profile info
    const listRes = await fetch('https://api.telnyx.com/v2/phone_numbers?page[size]=50', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!listRes.ok) {
      const errorText = await listRes.text().catch(() => '');
      console.error(`[telnyx] numbers-with-status: Telnyx API returned ${listRes.status}:`, errorText);
      return res.status(listRes.status).json({ ok: false, error: `Telnyx: ${listRes.statusText || errorText}` });
    }
    const data = await listRes.json().catch(() => ({}));
    const numbers = Array.isArray(data?.data) ? data.data : [];
    console.log(`[telnyx] numbers-with-status: Got ${numbers.length} numbers from Telnyx`);

    // Debug: log the raw structure of the first number
    if (numbers.length > 0) {
      console.log('[telnyx] First number raw:', JSON.stringify(numbers[0], null, 2));
    }

    // For each number, check if it has a messaging profile assigned
    const result = await Promise.all(
      numbers
        .filter((n) => n?.phone_number)
        .map(async (n) => {
          const number = String(n.phone_number);

          // First try: messaging_profile_id directly from the response
          let profileId = n.messaging_profile_id || n.messaging_profile?.id || null;
          let profileName = n.messaging_profile?.name || null;

          console.log(`[telnyx] Checking ${number}:`);
          console.log(`  - status: ${n.status}`);
          console.log(`  - messaging_profile_id from list: ${profileId}`);

          // If no profile ID, try the lookup helper as fallback
          if (!profileId) {
            console.log(`  - Falling back to lookup for ${number}`);
            const capability = await checkNumberSmsCapability({
              apiKey: accessToken,
              phoneNumber: number,
            });
            profileId = capability.profileId;
            profileName = capability.profileName;
            console.log(`  - Lookup result for ${number}: profileId=${profileId}, canSend=${capability.canSend}`);
          }

          const canSend = !!profileId && (n.status === 'active' || n.status === 'enabled' || !n.status);

          return {
            number,
            type: 'phone_number',
            id: n.id || null,
            canSend,
            profileId,
            profileName,
            reason: profileId ? null : 'not_assigned',
            status: n.status,
            features: n.features || [],
          };
        })
    );

    console.log(`[telnyx] numbers-with-status: Returning ${result.length} numbers with status`);
    res.json({ ok: true, numbers: result, totalFound: numbers.length });
  } catch (err) {
    console.error('[telnyx] numbers-with-status error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create a messaging profile and assign a phone number to it
app.post('/api/telnyx/messaging-profiles/create', authenticate, async (req, res) => {
  try {
    const ownerKey = ownerKeyForCallback(req);
    const { accountId, phoneNumber, profileName } = req.body || {};

    if (!accountId || !phoneNumber) {
      return res.status(400).json({ ok: false, error: 'accountId and phoneNumber are required' });
    }

    // Verify the connection belongs to this owner
    const conn = getTelnyxConnection(accountId);
    if (!conn) return res.status(404).json({ ok: false, error: 'Connection not found' });
    if (conn.user_id !== ownerKey) {
      return res.status(403).json({ ok: false, error: 'Not your connection' });
    }

    // Get fresh access token
    const accessToken = await resolveTelnyxAccessToken(conn);
    if (!accessToken) {
      updateTelnyxConnectionStatus(conn.id, 'needs_reconnect');
      return res.status(401).json({ ok: false, error: 'Access token expired or revoked. Please reconnect.' });
    }

    // Create messaging profile and assign the number
    const result = await setupNumberForSms({
      apiKey: accessToken,
      phoneNumber,
      profileName: profileName || `Lunao - ${conn.account_email || phoneNumber}`,
    });

    if (!result.success) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    res.json({
      ok: true,
      success: true,
      profileId: result.profileId,
      profileName: result.profileName,
      webhookUrl: result.webhookUrl,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get messaging profiles for a connected account
app.get('/api/telnyx/accounts/:id/messaging-profiles', authenticate, async (req, res) => {
  try {
    const ownerKey = ownerKeyForCallback(req);
    const conn = getTelnyxConnection(req.params.id);
    if (!conn) return res.status(404).json({ ok: false, error: 'Connection not found' });
    if (conn.user_id !== ownerKey) {
      return res.status(403).json({ ok: false, error: 'Not your connection' });
    }

    // Get fresh access token
    const accessToken = await resolveTelnyxAccessToken(conn);
    if (!accessToken) {
      return res.status(401).json({ ok: false, error: 'Access token expired or revoked.' });
    }

    const profiles = await listMessagingProfiles({ apiKey: accessToken });
    res.json({ ok: true, profiles });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Check if messaging profile can SMS the countries in the CSV leads
// Also checks webhook configuration
app.post('/api/telnyx/profile-eligibility', authenticate, async (req, res) => {
  try {
    const ownerKey = ownerKeyForCallback(req);
    const { accountId, profileId, targetCountries } = req.body || {};

    if (!accountId || !profileId) {
      return res.status(400).json({ ok: false, error: 'accountId and profileId are required' });
    }

    // Verify the connection belongs to this owner
    const conn = getTelnyxConnection(accountId);
    if (!conn) return res.status(404).json({ ok: false, error: 'Connection not found' });
    if (conn.user_id !== ownerKey) {
      return res.status(403).json({ ok: false, error: 'Not your connection' });
    }

    // Get fresh access token
    const accessToken = await resolveTelnyxAccessToken(conn);
    if (!accessToken) {
      updateTelnyxConnectionStatus(conn.id, 'needs_reconnect');
      return res.status(401).json({ ok: false, error: 'Access token expired or revoked. Please reconnect.' });
    }

    // Check country eligibility
    const countryCheck = await checkProfileCountryEligibility({
      apiKey: accessToken,
      profileId,
      targetCountries: targetCountries || [],
    });

    // Check webhook configuration
    const webhookCheck = await checkProfileWebhookStatus({
      apiKey: accessToken,
      profileId,
    });

    // Get profile details
    const profile = await getMessagingProfileDetails({
      apiKey: accessToken,
      profileId,
    });

    res.json({
      ok: true,
      profileId,
      profileName: profile?.name || null,
      countryCheck,
      webhookCheck,
      needsSetup: countryCheck.needsConfiguration || !webhookCheck.correct,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Configure a messaging profile: set webhook URL, assign number, add country destinations.
// Returns step-by-step results so the UI can show pass/fail per action.
app.post('/api/telnyx/profile-configure', authenticate, async (req, res) => {
  try {
    const ownerKey = ownerKeyForCallback(req);
    const {
      accountId,
      profileId,
      phoneNumber,           // optional: also assign this number to the profile
      targetCountries,       // ISO codes the user wants to send to (eligibility already filtered client-side)
      countries,             // backwards-compat: addCountries
      addCountries,
    } = req.body || {};

    if (!accountId || !profileId) {
      return res.status(400).json({ ok: false, error: 'accountId and profileId are required' });
    }

    // Verify the connection belongs to this owner
    const conn = getTelnyxConnection(accountId);
    if (!conn) return res.status(404).json({ ok: false, error: 'Connection not found' });
    if (conn.user_id !== ownerKey) {
      return res.status(403).json({ ok: false, error: 'Not your connection' });
    }

    // Get fresh access token
    const accessToken = await resolveTelnyxAccessToken(conn);
    if (!accessToken) {
      updateTelnyxConnectionStatus(conn.id, 'needs_reconnect');
      return res.status(401).json({ ok: false, error: 'Access token expired or revoked. Please reconnect.' });
    }

    const steps = [];
    const blockedCountries = [];

    // Determine which countries to whitelist.
    // We only auto-configure countries whose eligibility was 'fixable' — the
    // client has already filtered targetCountries to exclude 10DLC/DLT/AE/SG.
    const countriesToAdd = Array.isArray(targetCountries)
      ? targetCountries
      : (Array.isArray(addCountries)
          ? addCountries
          : (Array.isArray(countries) ? countries : []));

    // ---- Step 1: Atomic profile PATCH (webhook + whitelist) ----
    const patchResult = await updateMessagingProfileAtomic({
      apiKey: accessToken,
      profileId,
      addCountries: countriesToAdd,
    });
    steps.push(...patchResult.steps);

    // ---- Step 2: Assign phone number to profile if provided ----
    if (phoneNumber) {
      const assignResult = await assignNumbersToProfile({
        apiKey: accessToken,
        profileId,
        phoneNumbers: [phoneNumber],
      });
      steps.push({
        step: 'number_assignment',
        ok: !!assignResult.success,
        message: assignResult.success
          ? `${phoneNumber} assigned to profile`
          : `Number assignment failed: ${assignResult.error}`,
      });
    }

    // ---- Step 3: Post-flight recheck ----
    const postFlight = await postFlightRecheck({
      apiKey: accessToken,
      phoneNumber,
      profileId,
      targetCountries: countriesToAdd,
    });
    // Merge post-flight steps
    if (Array.isArray(postFlight.steps)) {
      for (const s of postFlight.steps) steps.push(s);
    }

    // Identify countries that are still not whitelisted after the attempt
    const countrySteps = steps.filter((s) => s.step.startsWith('country_'));
    for (const s of countrySteps) {
      if (!s.ok) {
        const code = s.step.replace('country_', '').replace('_whitelisted', '');
        if (code && !blockedCountries.includes(code)) blockedCountries.push(code);
      }
    }

    const allOk = steps.every((s) => s.ok);

    res.json({
      ok: true,
      steps,
      overallSuccess: allOk,
      blockedCountries,
      postFlightCheck: {
        allPassed: postFlight.allPassed,
        whitelistedCountries: countriesToAdd,
      },
    });
  } catch (err) {
    console.error('[telnyx] profile-configure error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Check destination eligibility for a specific phone number + target countries.
// This is the smart pre-flight that calls Telnyx to learn the number's type,
// then maps each destination to either auto-configure or a manual registration.
app.post('/api/telnyx/destination-eligibility', authenticate, async (req, res) => {
  try {
    const ownerKey = ownerKeyForCallback(req);
    const { accountId, phoneNumber, targetCountries } = req.body || {};

    if (!accountId || !phoneNumber) {
      return res.status(400).json({ ok: false, error: 'accountId and phoneNumber are required' });
    }

    const conn = getTelnyxConnection(accountId);
    if (!conn) return res.status(404).json({ ok: false, error: 'Connection not found' });
    if (conn.user_id !== ownerKey) {
      return res.status(403).json({ ok: false, error: 'Not your connection' });
    }

    const accessToken = await resolveTelnyxAccessToken(conn);
    if (!accessToken) {
      updateTelnyxConnectionStatus(conn.id, 'needs_reconnect');
      return res.status(401).json({ ok: false, error: 'Access token expired or revoked. Please reconnect.' });
    }

    // Build the Lunao webhook URL that the messaging profile must point at.
    const expectedWebhookUrl = `${PUBLIC_API_BASE_URL || `http://localhost:${PORT}`}/api/webhooks/telnyx`;

    const report = await checkPhoneNumberEligibility({
      apiKey: accessToken,
      phoneNumber,
      targetCountries: Array.isArray(targetCountries) ? targetCountries : [],
      expectedWebhookUrl,
    });

    res.json({ ok: true, ...report });
  } catch (err) {
    console.error('[telnyx] destination-eligibility error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get Telnyx portal URL for manual messaging profile creation
app.get('/api/telnyx/portal-url', authenticate, (req, res) => {
  try {
    const ownerKey = ownerKeyForCallback(req);
    if (!ownerKey) {
      return res.status(400).json({ ok: false, error: 'ownerKey required' });
    }
    
    // Return the Telnyx messaging profiles portal URL
    res.json({
      ok: true,
      portalUrl: 'https://portal.telnyx.com/#/app/messaging-profiles',
      docsUrl: 'https://portal.telnyx.com/docs/v2/messaging',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// SMS Lead Discovery — Google Maps Places API (Free/Starter automated flow)
// =============================================================================

// GET /api/sms-campaigns/canada/provinces
// Returns the list of 13 Canadian provinces and territories for the wizard's
// province dropdown in the "Find Leads in Canada" tab.
app.get('/api/sms-campaigns/canada/provinces', authenticate, (req, res) => {
  res.json({ ok: true, provinces: CA_PROVINCES });
});

// GET /api/sms-campaigns/canada/cities?province=ON&limit=100
// Returns cities within a Canadian province, sorted by population descending.
// Used to populate the city dropdown after a province is selected.
app.get('/api/sms-campaigns/canada/cities', authenticate, (req, res) => {
  const { province, limit } = req.query || {};
  if (!province) {
    return res.status(400).json({ ok: false, error: '`province` query param is required' });
  }
  const cities = listCities({ country: 'CA', admin: province, limit: Number(limit) || 100 });
  res.json({ ok: true, cities });
});

// POST /api/sms-campaigns/discover-places
// Triggers a Google Places search for businesses in the given city, then
// filters to those with phone numbers and (optionally) in Canada. Returns
// an array of leads the wizard can display in a tickable table.
//
// Body: { niche, city, lat, lon, country? }
// Plan-gated: Free/Starter users can only request country='CA'. Growth+ can
// request any country but Lunao's API key is used regardless.
app.post('/api/sms-campaigns/discover-places', authenticate, async (req, res) => {
  try {
    const ownerKey = ownerKeyForCallback(req);
    const { niche, city, lat, lon, country = 'CA', limit } = req.body || {};
    const plan = normalisePlan(req.body?.plan || req.headers['x-user-plan']);

    if (!niche || !city) {
      return res.status(400).json({ ok: false, error: '`niche` and `city` are required' });
    }

    // Enforce CA-only for Free/Starter plans.
    if (isAutomatedSmsPlan(plan) && country && country.toUpperCase() !== 'CA') {
      return res.status(403).json({
        ok: false,
        error: 'Your plan only supports Canadian leads. Remove the country filter to continue.',
      });
    }

    // Use Lunao's own Google Maps API key. The key lives server-side
    // only — never exposed to the client. Quota is pooled across all
    // Free/Starter users on the platform.
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ ok: false, error: 'Google Maps API is not configured. Set GOOGLE_MAPS_API_KEY in .env to enable this feature.' });
    }

    const results = await discoverSmsLeadsFromPlaces({
      apiKey,
      niche,
      city,
      lat: lat ? Number(lat) : undefined,
      lon: lon ? Number(lon) : undefined,
      country: country || 'CA',
      limit: Math.min(Number(limit) || 20, 50),
    });

    res.json({ ok: true, leads: results, count: results.length, niche, city, country });
  } catch (err) {
    console.error('[/sms-campaigns/discover-places]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Internal helper: returns a fresh access_token for the given connection row,
// refreshing from the stored refresh_token if the cached one is expired.
// Returns null if the row is missing or all refresh attempts have failed.
async function resolveTelnyxAccessToken(conn) {
  if (!conn) return null;
  const accessToken = decryptTelnyxTokenForUse(conn.encrypted_access_token);
  if (!accessToken) return null;

  const isExpired = conn.expires_at
    ? conn.expires_at - Math.floor(Date.now() / 1000) < 30 // 30s safety window
    : false;
  if (!isExpired) return accessToken;

  // Need a refresh — bail if we don't have one.
  if (!conn.encrypted_refresh_token) return accessToken;

  try {
    const refreshToken = decryptTelnyxTokenForUse(conn.encrypted_refresh_token);
    const data = await refreshTelnyxAccessToken(refreshToken);
    const encryptedAccess = encryptTelnyxTokenForStorage(data.access_token);
    const encryptedRefresh = data.refresh_token ? encryptTelnyxTokenForStorage(data.refresh_token) : null;
    const expiresAt = data.expires_in
      ? Math.floor(Date.now() / 1000) + Number(data.expires_in)
      : null;
    updateTelnyxConnectionTokens(conn.id, {
      encryptedAccessToken: encryptedAccess,
      encryptedRefreshToken: encryptedRefresh || undefined,
      expiresAt,
    });
    return data.access_token;
  } catch (err) {
    if (err.code === 'TOKEN_REVOKED') {
      updateTelnyxConnectionStatus(conn.id, 'needs_reconnect');
    }
    return null;
  }
}

// Export the resolver so server/lib/telnyx.js can use it during SMS sends.
export { resolveTelnyxAccessToken };

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

// ---- Manual Tick-to-Pick Dork Discovery ----

// Deterministic mock dork provider. The real provider integration (SerpAPI
// or Google CSE) is wired in via the same `fetchDorkPage()` seam below.
// Until a key is configured we serve 6–10 realistic mock leads per page,
// derived from city name + niche + page so the wizard renders the same
// rows on re-fetch (avoids visual flicker on rerenders).
function makeMockLeads({ city, niche, page }) {
  const seed = `${(city || '').toLowerCase()}|${(niche || '').toLowerCase()}|${page}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const rand = () => {
    h = (h * 1664525 + 1013904223) | 0;
    return ((h >>> 0) % 10_000) / 10_000;
  };
  const suffixes = ['Studio', 'Co.', 'Lounge', 'Barbers', 'Salon', 'Shop', 'Atelier', 'Clinic', 'Works', 'House'];
  const firstNames = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Casey', 'Morgan', 'Riley', 'Cameron', 'Quinn', 'Avery', 'Drew', 'Reese'];
  const lastNames  = ['Smith', 'Patel', 'Garcia', 'Brown', 'Khan', 'Singh', 'Lopez', 'Martin', 'Clark', 'Nguyen', 'Wong', 'Carter'];
  const hosts = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com'];
  const n = 6 + Math.floor(rand() * 5); // 6..10
  const out = [];
  for (let i = 0; i < n; i++) {
    const fn = firstNames[Math.floor(rand() * firstNames.length)];
    const ln = lastNames[Math.floor(rand() * lastNames.length)];
    const suffix = suffixes[Math.floor(rand() * suffixes.length)];
    const host = hosts[Math.floor(rand() * hosts.length)];
    const biz = `${city} ${niche} ${suffix} ${i + 1}`;
    const slug = `${niche}-${city}-${page}-${i + 1}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${page}${i + 1}@${host}`;
    out.push({
      business_name: biz,
      email,
      email_host: host,
      city,
      state: undefined,
      source_query: `"${niche}" "${city}" email`,
      source_page: page,
      source_rank: (page - 1) * 10 + i + 1,
      slug,
    });
  }
  return out;
}

// Real provider seam. Right now always returns null so we fall through to
// the mock above. Future: when SERPAPI_KEY / GOOGLE_CSE_KEY env vars are
// set, call the real API here and translate its results into the same
// shape returned by makeMockLeads().
async function fetchDorkPage({ city, niche, page }) {
  return null; // hand off to mock for now
}

// Single-page dork walk. The wizard calls this on every "Find More" click.
// Server is stateless — the client passes the locked city, the list of
// already-visited cities, and the list of already-seen emails so we never
// emit duplicates and never re-walk the same page.
app.post('/api/email-campaigns/:id/dork-next', authenticate, async (req, res) => {
  try {
    const { lockedCity, visited = [], seenEmails = [], niche = '' } = req.body || {};
    if (!lockedCity || !lockedCity.name || !lockedCity.country) {
      return res.status(400).json({ ok: false, error: 'lockedCity (name, country) is required' });
    }
    // Reconstruct the per-city page count from the visited map.
    const pageInCity = {};
    for (const v of visited) {
      if (typeof v === 'string') {
        pageInCity[v] = Math.max(pageInCity[v] || 0, 1);
      } else if (v && v.name) {
        pageInCity[v.name] = Math.max(pageInCity[v.name] || 0, v.page || 1);
      }
    }
    const next = pickNextCity({ lockedCity, visited, pageInCity });
    if (next.kind === 'done') {
      return res.json({ ok: true, done: true, nextCity: null, leads: [] });
    }

    // Real provider first, mock as a fallback. The mock is deterministic
    // by (city, niche, page) so re-running the same query is idempotent.
    const realLeads = await fetchDorkPage({ city: next.name, niche, page: next.page });
    const raw = realLeads || makeMockLeads({ city: next.name, niche, page: next.page });

    // Filter out anything the client has already seen, drop empty rows,
    // and key-dedupe by (business_name | city).
    const seen = new Set((seenEmails || []).map((e) => String(e || '').toLowerCase().trim()));
    const keyedSeen = new Set();
    const leads = [];
    for (const r of raw) {
      const email = String(r.email || '').toLowerCase().trim();
      const biz = String(r.business_name || '').trim();
      const cityName = r.city || next.name;
      if (!email || !biz) continue;
      if (seen.has(email)) continue;
      const key = `${biz.toLowerCase()}|${cityName.toLowerCase()}`;
      if (keyedSeen.has(key)) continue;
      keyedSeen.add(key);
      seen.add(email);
      leads.push({
        business_name: biz,
        email,
        email_host: r.email_host || email.split('@')[1] || '',
        city: cityName,
        state: r.state || next.admin || undefined,
        source_query: r.source_query || `"${niche}" "${cityName}" email`,
        source_page: r.source_page || next.page,
        source_rank: r.source_rank || ((next.page - 1) * 10) + leads.length + 1,
        slug: r.slug || `${biz}-${cityName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80),
      });
    }

    return res.json({
      ok: true,
      done: false,
      nextCity: {
        name: next.name,
        country: next.country,
        state: next.admin,
        page: next.page,
        budget: next.budget,
        isNearby: !!next.isNearby,
      },
      leads,
    });
  } catch (err) {
    console.error('[dork-next] error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Persist the user's manually-ticked lead set into `email_leads`. Wipes
// any prior picks for the campaign so re-edits start clean, then bulk
// inserts with `email_source = 'dork_manual'` so the existing `/run`
// pipeline picks them up unchanged.
app.post('/api/email-campaigns/:id/save-leads', authenticate, (req, res) => {
  try {
    const { leads = [] } = req.body || {};
    if (!Array.isArray(leads)) {
      return res.status(400).json({ ok: false, error: 'leads must be an array' });
    }
    const campaign = getEmailCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });

    // Normalize + drop rows that would violate the email_leads schema
    // (business_name NOT NULL DEFAULT '' but we still want a real value).
    const clean = [];
    for (const l of leads) {
      const email = String(l.email || '').trim();
      const biz = String(l.business_name || '').trim();
      if (!email || !biz) continue;
      clean.push({
        business_name: biz,
        email,
        city: String(l.city || '').trim(),
        state: l.state ? String(l.state).trim() : '',
        website: '',
        email_source: 'dork_manual',
        verification_status: 'unverified',
        source_query: l.source_query || '',
        source_page: Number(l.source_page) || 0,
        source_rank: Number(l.source_rank) || 0,
        slug: l.slug || `${biz}-${l.city || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80),
      });
    }

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM email_leads WHERE campaign_id = ?').run(req.params.id);
      const stmt = db.prepare(`
        INSERT INTO email_leads
          (campaign_id, business_name, phone, city, website, email,
           email_source, verification_status, slug, assigned_account_id,
           send_status, send_error, sent_at, index_in_campaign, created_at)
        VALUES
          (?, ?, '', ?, ?, ?, ?, ?, ?, NULL, 'pending', NULL, NULL, ?, ?)
      `);
      const now = Date.now();
      clean.forEach((l, i) => {
        stmt.run(
          req.params.id,
          l.business_name,
          l.city,
          l.website,
          l.email,
          l.email_source,
          l.verification_status,
          l.slug,
          i,
          now,
        );
      });
      db.prepare(
        'UPDATE email_campaigns SET target_volume = ? WHERE id = ?'
      ).run(clean.length, req.params.id);
    });
    tx();

    return res.json({ ok: true, inserted: clean.length });
  } catch (err) {
    console.error('[save-leads] error:', err);
    return res.status(500).json({ ok: false, error: err.message });
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

// ---------------------------------------------------------------------------
// Telnyx Connection - Verify and save Telnyx credentials
// ---------------------------------------------------------------------------
app.post('/api/telnyx/connect', authenticate, async (req, res) => {
  try {
    const { apiKey, senderNumber } = req.body || {};

    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ ok: false, error: 'API key is required' });
    }

    // Verify the API key by making a test call to Telnyx
    let validKey = false;
    let availableNumbers = [];

    try {
      const response = await fetch('https://api.telnyx.com/v2/messaging_phone_numbers?page[size]=10', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        validKey = true;
        const data = await response.json();
        availableNumbers = (data.data || []).map((num) => ({
          number: num.phone_number,
          country: num.country || 'United States',
          type: num.phone_number && (num.phone_number.startsWith('+1800') || num.phone_number.startsWith('+1866') || num.phone_number.startsWith('+1888')) ? 'toll-free' : 'local',
          capabilities: {
            sms: num.capabilities && (num.capabilities.messaging === true || num.capabilities.sms === true),
            voice: num.capabilities && num.capabilities.voice === true,
          },
          status: num.status === 'active' ? 'active' : 'pending',
        }));
      }
    } catch (e) {
      // API call failed - key might be invalid
      console.error('[telnyx-connect] verification failed:', e);
    }

    // Return the verification result
    // In production, you would save these to the database or environment
    res.json({
      ok: validKey,
      connected: validKey,
      message: validKey ? 'Telnyx connected successfully' : 'Invalid API key',
      numbers: availableNumbers,
      configuredNumber: senderNumber || null,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
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
// Each GET fires a fast (≤2s) recheck of any non-terminal Telnyx rows so the
// UI sees delivered/failed within a single poll cycle, even when the
// webhook is slow/delayed/missed.
app.get('/api/owner/sms', authenticate, async (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });
    const limit = parseInt(req.query.limit, 10) || 100;
    const rows = listSmsForOwner(ownerKey, limit);
    // Live re-check (never blocks the response — fire & read fresh on next tick).
    recheckSmsRows(rows).catch((e) => console.warn('[recheck] owner sms:', e.message));
    res.json({ ok: true, sms: rows, asOf: Date.now() });
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
// Messaging Stats - Aggregated SMS metrics for analytics dashboard
// ---------------------------------------------------------------------------
app.get('/api/messaging/stats', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });

    // Get SMS stats from the database
    const smsStats = db.prepare(`
      SELECT 
        COUNT(*) as total_sent,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as total_delivered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as total_failed,
        COUNT(DISTINCT from_number) as active_numbers
      FROM sms_logs 
      WHERE owner_key = ?
    `).get(ownerKey);

    // Get inbound message count
    const inboundCount = db.prepare(`
      SELECT COUNT(*) as count FROM sms_inbound WHERE to_number IN (
        SELECT DISTINCT from_number FROM sms_logs WHERE owner_key = ?
      )
    `).get(ownerKey);

    const totalSent = smsStats?.total_sent || 0;
    const totalDelivered = smsStats?.total_delivered || 0;
    const deliveryRate = totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(1) : 0;

    res.json({
      ok: true,
      stats: {
        totalSent,
        totalDelivered,
        totalFailed: smsStats?.total_failed || 0,
        deliveryRate: parseFloat(deliveryRate),
        repliesReceived: inboundCount?.count || 0,
        activeNumbers: smsStats?.active_numbers || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Phone Numbers - List and manage Telnyx numbers
// ---------------------------------------------------------------------------
app.get('/api/numbers', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });

    // Get unique numbers from SMS logs for this owner
    const numbers = db.prepare(`
      SELECT from_number as number, 'United States' as country, 'local' as type,
        'active' as status
      FROM sms_logs 
      WHERE owner_key = ? AND from_number IS NOT NULL
      GROUP BY from_number
      ORDER BY MAX(created_at) DESC
    `).all(ownerKey);

    res.json({
      ok: true,
      numbers: numbers.map((n) => ({
        id: n.number,
        number: n.number,
        country: n.country,
        type: n.type,
        status: n.status,
        capabilities: {
          sms: true,
          voice: false,
        },
      })),
    });
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
// Turn a history entry into a named template (saves to custom_templates).
app.post('/api/site-history/:id/convert-to-template', authenticate, async (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.body?.ownerKey || req.query?.ownerKey || 'dashboard').trim();
    const { name, categoryId = null, niche = '', templateId: existingTemplateId = null, rawHtml = null } = req.body || {};

    let row = db.prepare('SELECT * FROM site_history WHERE id = ?').get(req.params.id);
    const htmlToSave = rawHtml || row?.html;
    if (!htmlToSave) return res.status(400).json({ ok: false, error: 'HTML content is required to save template' });

    const templateName = name?.trim() || `Template ${new Date().toLocaleDateString()}`;
    const templateId = existingTemplateId || (row?.template_id) || `tmpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const slug = templateName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `template-${Date.now()}`;
    const now = Math.floor(Date.now() / 1000);
    const targetNiche = (niche || row?.niche || 'General').trim();

    // Persist and synchronize the niche into template_categories if provided
    if (targetNiche && targetNiche !== 'General') {
      try {
        await createNiche(targetNiche, '', '#2563EB', ownerKey);
      } catch (catErr) {
        console.warn('[templates] failed to auto-register niche category:', catErr.message);
      }
    }

    // Compile preview HTML with demo values
    const previewHtml = compilePreviewHtml(htmlToSave, templateName);

    // Save or update custom_templates
    db.prepare(
      `INSERT INTO custom_templates (id, owner_key, category_id, name, slug, niche, raw_html, preview_html, style_tags, used_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         slug = excluded.slug,
         niche = excluded.niche,
         category_id = COALESCE(excluded.category_id, custom_templates.category_id),
         raw_html = excluded.raw_html,
         preview_html = excluded.preview_html`,
    ).run(templateId, ownerKey, categoryId || null, templateName, slug, targetNiche, htmlToSave, previewHtml, now);

    // Mark history entry as converted if present
    if (row) {
      db.prepare(
        'UPDATE site_history SET is_template = 1, template_id = ?, template_name = ? WHERE id = ?',
      ).run(templateId, templateName, req.params.id);
    }

    const updatedNiches = await getAllNiches(ownerKey);

    res.json({
      ok: true,
      template: {
        id: templateId,
        name: templateName,
        slug,
        niche: targetNiche,
        categoryId: categoryId || null,
        previewHtml,
      },
      niches: updatedNiches,
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
    const { html, niche = 'Local Business', anthropicApiKey, apiKey, geminiApiKey } = req.body || {};
    if (!html || typeof html !== 'string' || html.trim().length < 100) {
      return res.status(400).json({ ok: false, error: 'A valid HTML file (min 100 chars) is required.' });
    }

    const { getGeminiClient, cleanHtmlOutput } = await import('./lib/geminiAi.js');
    const client = getGeminiClient(geminiApiKey || apiKey || anthropicApiKey);

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

    const trimmed = html.trim();
    const context = trimmed.length > 4000 ? trimmed.substring(0, 4000) + '\n... (truncated) ...' : trimmed;

    const resAi = await client.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: `Here is a raw HTML website. Rewrite it to use {{BUSINESS_NAME}}, {{CITY}}, {{PHONE_DISPLAY}}, {{PHONE_RAW}} placeholders as described in your instructions. Keep everything else identical.\n\nHTML:\n${context}`,
      config: {
        systemInstruction: injectionSystem,
        temperature: 0.3,
      },
    });

    let rawHtml = cleanHtmlOutput(resAi.text || '');

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

import { resolveTemplate, listTemplates, loadPreviewHtml, NICHE_LIST, getAllNiches, createNiche } from './lib/templates.js';

// Expose all niches: built-in defaults + persistent categories + custom template niches.
app.get('/api/niches', async (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    const niches = await getAllNiches(ownerKey || null);
    res.json({ ok: true, niches });
  } catch (err) {
    res.json({ ok: true, niches: NICHE_LIST });
  }
});

// Create a new niche in the backend and return updated list of all niches.
app.post('/api/niches', async (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.body?.ownerKey || req.query?.ownerKey || 'dashboard').trim();
    const { name, emoji, color } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'Niche name is required.' });
    }
    const niche = await createNiche(name.trim(), emoji, color, ownerKey);
    const niches = await getAllNiches(ownerKey);
    res.json({ ok: true, niche, niches });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Unified list — built-ins + this user's customs + all synchronized niches.
app.get('/api/templates', authenticate, async (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    const payload = await listTemplates(ownerKey || null);
    const niches = await getAllNiches(ownerKey || null);
    res.json({ ok: true, ...payload, niches });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Built-in preview iframe source. Always public — the demo data has no
// PII. Custom templates are previewed through the auth-gated
// Unified preview iframe source. Serves HTML for both built-in templates
// and custom user templates.
app.get('/api/templates/:key/preview', async (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    const resolved = await resolveTemplate(req.params.key, ownerKey || null);
    const html = await loadPreviewHtml(resolved, ownerKey || null);
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
// Template Readiness, Auto-Fix & Rebranding Test Suite (Strict 4 Placeholders)
// ---------------------------------------------------------------------------

// Scan HTML template for readiness
app.post('/api/templates/scan-readiness', (req, res) => {
  try {
    const { html } = req.body || {};
    if (!html || typeof html !== 'string') {
      return res.status(400).json({ ok: false, error: 'HTML is required' });
    }
    const scan = scanTemplateReadiness(html);
    res.json({ ok: true, scan });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Make Template Ready: analyze, repair violations, return complete corrected file, and validate
app.post('/api/templates/make-ready', async (req, res) => {
  try {
    const { html, geminiApiKey, apiKey } = req.body || {};
    if (!html || typeof html !== 'string' || !html.trim()) {
      return res.status(400).json({ ok: false, error: 'HTML is required' });
    }

    const initialScan = scanTemplateReadiness(html);
    if (initialScan.isReady) {
      return res.json({
        ok: true,
        html,
        scan: initialScan,
        changed: false,
      });
    }

    // Step 1: Run deterministic auto-fixer first (guarantees zero design loss while mapping placeholders)
    let repairedHtml = fixHtmlToTemplateReady(html);
    let postScan = scanTemplateReadiness(repairedHtml);

    // Step 2: If any checks still fail, invoke Gemini with strict repair instructions
    if (!postScan.isReady && isAiEnabled()) {
      try {
        const repairInstruction = `STRICT REPAIR: The HTML template must satisfy strict template-readiness:
1. Every website must be one complete HTML file with embedded CSS and JavaScript. Start at <!DOCTYPE html> and end at </html>.
2. Use ONLY these 4 placeholders: {{BUSINESS_NAME}}, {{PHONE}}, {{CITY}}, {{ADDRESS}}.
3. Use {{BUSINESS_NAME}} everywhere the business name appears, including in email and social media identity text (e.g. contact@{{BUSINESS_NAME}}, https://instagram.com/{{BUSINESS_NAME}}). Never create separate email or social media placeholders. Do not invent email addresses or social handles.
4. Replace all hardcoded business names, phone numbers, cities, addresses, fake reviews, ratings, and unsupported business claims.
5. Preserve the original design, styling, colors, typography, responsiveness, and functionality 100%.`;

        const { repairTemplateHtml } = await import('./lib/geminiAi.js');
        const aiRepaired = await repairTemplateHtml({
          html: repairedHtml,
          instruction: repairInstruction,
          apiKey: geminiApiKey || apiKey,
        });

        if (aiRepaired && aiRepaired.includes('<!DOCTYPE html>')) {
          const aiScan = scanTemplateReadiness(aiRepaired);
          // Only adopt AI output if it improved readiness and did not destroy the document
          if (aiScan.score >= postScan.score) {
            repairedHtml = aiRepaired;
            postScan = aiScan;
          }
        }
      } catch (aiErr) {
        console.warn('[make-ready] AI repair attempt failed, falling back to deterministic repair:', aiErr.message);
      }
    }

    // Ensure final pass is scanned
    postScan = scanTemplateReadiness(repairedHtml);

    // If processing completely fails, preserve original html
    if (!repairedHtml || repairedHtml.length < 50) {
      return res.status(422).json({
        ok: false,
        error: 'Failed to repair template. Original HTML preserved.',
        html,
        scan: initialScan,
      });
    }

    res.json({
      ok: true,
      html: repairedHtml,
      scan: postScan,
      changed: repairedHtml !== html,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, html: req.body?.html });
  }
});

// Run automated rebranding tests on 2 fictional businesses
app.post('/api/templates/test-rebrand', (req, res) => {
  try {
    const { html, biz1, biz2 } = req.body || {};
    if (!html || typeof html !== 'string') {
      return res.status(400).json({ ok: false, error: 'HTML is required' });
    }

    const scan = scanTemplateReadiness(html);
    const rebrandResults = runRebrandingTests(html, biz1, biz2);

    res.json({
      ok: true,
      scan,
      rebrandResults,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
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
    const { prompt, niche = 'Local Business', categoryId = null, name, anthropicApiKey, apiKey, geminiApiKey } = req.body || {};

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
      ({ rawHtml, previewHtml } = await generateTemplateHtml(prompt.trim(), niche, geminiApiKey || apiKey || anthropicApiKey));
      if (niche && niche !== 'Local Business') {
        try {
          await createNiche(niche, '', '#2563EB', ownerKey);
        } catch { /* ignore */ }
      }
    } catch (genErr) {
      // Refund the 2 credits on AI failure
      refund(ownerKey, 2, 'template_gen_failed_refund', null);
      const msg = genErr instanceof Error ? genErr.message : 'Generation failed';
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

// ---- Lunao Owner PWA (one global PWA at /) -------------------------------
// Mount all /api/pwa/* routes behind the pwaAuth middleware. Must be done
// BEFORE app.use(express.static(...)) so /api/* always wins precedence.
mountPwaApi(app);

// Serve the built Lunao Owner PWA at /owner/* — isolated from the agency SPA
// at / and from /api/*.  In production, the PWA is deployed at owner.lunao.com;
// in development, /owner/ serves the static bundle while :3001 is the Vite HMR
// dev server (which proxies to the backend).
const PWA_DIST = path.join(ROOT_DIR, 'lunaoownerpwa', 'dist');
const FRONTEND_DIST = path.join(ROOT_DIR, 'dist');
if (fs.existsSync(PWA_DIST)) {
  app.use('/owner', express.static(PWA_DIST));
  app.get('/owner*', (_req, res) => {
    res.sendFile(path.join(PWA_DIST, 'index.html'));
  });
}
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
}

// Catch-all for SPA deep-links. The Owner PWA lives at /owner/* so it must be
// excluded from the catch-all. Must run AFTER /api/* routes so JSON 404s aren't
// masked by HTML.
const spaEntry = fs.existsSync(path.join(PWA_DIST, 'index.html'))
  ? path.join(PWA_DIST, 'index.html')
  : fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))
    ? path.join(FRONTEND_DIST, 'index.html')
    : null;
if (spaEntry) {
  app.get(/^(?!\/api\/|\/sites\/|\/uploads\/|\/static\/|\/owner\/).*/, (req, res) => {
    res.sendFile(spaEntry);
  });
}

export function startBackgroundServices() {
  try {
    startGlobalRechecker();
    startOauthStateCleanup();
  } catch (err) {
    console.error('Failed to start background services:', err);
  }
}

export { app };
export default app;

if (process.env.NO_SERVER_LISTEN !== 'true') {
  app.listen(PORT, () => {
    // Background safety net: re-check non-terminal SMS rows every 30s, in case
    // the dashboard isn't open (so a Telnyx webhook that lands while nobody's
    // looking still gets reflected in the DB before the user next loads).
    startGlobalRechecker();
    const mode = modeSummary();
    console.log(`\n  Lunao pipeline API  ->  http://localhost:${PORT}`);
    console.log(`  Public base        : ${PUBLIC_API_BASE_URL}`);
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
    // Start OAuth state cleanup timer
    startOauthStateCleanup();
    // City DB status — block (don't log until resolved) so the operator sees
    // whether the 200k GeoNames file finished loading or only the seed list
    // is available yet.
    citiesLoadPromise.then((s) => {
      console.log(`  Cities             : ${s.records.toLocaleString()} in-memory (${s.fileLoaded ? 'GeoNames cities500 loaded' : 'seed list only'})`);
    });
    console.log('');
  });
}
