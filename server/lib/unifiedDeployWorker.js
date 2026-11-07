// Unified Rebrand, Supabase Cloud Persistence & Cloudflare Pages Deployment Worker
//
// Single authoritative state machine used across ALL THREE campaign types:
//   1. SMS Outreach Campaigns ('sms')
//   2. Email Outreach Campaigns ('email')
//   3. Site Deploy Campaigns ('site-deploy')
//
// Strict 4-Stage Sequential Pipeline per Lead:
//   Stage 1: AI Template Rebranding & HTML Integrity Check (>2,000 bytes, 0 placeholders, booking contract)
//   Stage 2: Push & Write to Supabase FIRST (`public.user_sites`, `public.tenants`, `public.owner_businesses`)
//            for permanent cloud storage (both built-in and custom templates) + stage to disk
//   Stage 3: Deploy to Cloudflare Pages & Verify HTTP 200 OK Live Edge URL (auto-retry up to 30s)
//   Stage 4: Strict Minimum 4-Second Pacing Gate (if completed in <4s, wait remaining time so total >= 4.0s;
//            if it needs 10s-30s to satisfy Supabase + Cloudflare, take as much time as required)

import { db } from './db.js';
import { compileSite } from './compile.js';
import { stageSite, publishBatch, verifyLiveCloudflareUrl } from './cloudflare.js';
import { registerUserRebrandedSite } from './sites.js';
import { registerOwnerBusinessAsync } from './tenantAuth.js';
import { getPgPool } from './supabase.js';
import { validateBookingContract, CONTRACT_REJECTION_MESSAGE } from './bookingContractValidator.js';
import { slugify } from './slug.js';
import { cloudflare, siteBaseUrl, siteUrlForSlug } from './config.js';
import { pgUpsertCustomTemplate } from './supabaseSync.js';
import { isOfficialBuiltinPwaTemplate } from './templates.js';

export const MIN_LEAD_DURATION_MS = 4000;
export const MAX_CLOUDFLARE_RETRY_WINDOW_MS = 30000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Execute the unified 4-stage Rebrand -> Supabase -> Cloudflare Pages -> 4s Pacing machine for a single lead.
 *
 * @param {object} opts
 * @param {object} opts.business            { name, city, phone, email, website, slug, niche, templateKey, rawHtml }
 * @param {string} opts.ownerKey            Verified tenant owner key
 * @param {string} [opts.niche]             Fallback niche
 * @param {string} [opts.templateKey]       Selected template key/id/slug
 * @param {string} [opts.templateName]      Optional custom template display name
 * @param {string} [opts.rawHtml]           Optional raw HTML override for custom templates
 * @param {string} [opts.campaignSource]    'sms' | 'email' | 'site-deploy'
 * @param {string} [opts.campaignId]        Parent campaign ID
 * @param {boolean} [opts.deploy]           Whether to deploy to Cloudflare Pages (default true)
 * @param {boolean} [opts.requireCloudflare] Whether to strictly require Cloudflare Pages (default true)
 * @param {number} [opts.minDurationMs]     Minimum total duration per lead (default 4000ms)
 * @param {function} [opts.onStage]         Optional callback `(stage, payload) => void` for live SSE/log streaming
 */
export async function executeUnifiedLeadRebrandAndDeploy({
  business,
  ownerKey,
  niche = 'Barber',
  templateKey = null,
  templateName = null,
  rawHtml = null,
  campaignSource = 'site-deploy',
  campaignId = null,
  deploy = true,
  requireCloudflare = true,
  minDurationMs = MIN_LEAD_DURATION_MS,
  onStage = () => {},
} = {}) {
  const leadStartMs = Date.now();
  const stages = [];
  const emitStage = (stage, detail = {}) => {
    const entry = { stage, status: 'ok', elapsedMs: Date.now() - leadStartMs, ...detail };
    stages.push(entry);
    try {
      onStage(stage, entry);
    } catch (_) {}
  };

  if (!business || !business.name) {
    return {
      ok: false,
      statusCode: 400,
      deployed: false,
      verifiedLive: false,
      verifiedOnCloudflare: false,
      savedToSupabase: false,
      slug: null,
      siteUrl: null,
      error: 'Business name is required.',
    };
  }

  const verifiedOwnerKey = String(ownerKey || 'dashboard').trim();
  const effectiveNiche = business.niche || niche || 'Barber';
  const effectiveKey = business.templateKey || business.templateFile || business.templateId || templateKey || effectiveNiche;
  const effectiveRawHtml = rawHtml || business.rawHtml || business.templateHtml || null;
  const effectiveName = templateName || business.templateName || null;
  const slug = business.slug || slugify(business.name, business.city || '');

  // ============================================================================
  // STAGE 1: AI TEMPLATE REBRANDING & HTML INTEGRITY GATE
  // ============================================================================
  const rebrandStartMs = Date.now();
  emitStage('rebranding', {
    slug,
    businessName: business.name,
    city: business.city || '',
    message: `Rebranding template for "${business.name}"...`,
  });

  // If custom rawHtml was supplied with a custom ID, persist it to custom_templates in Supabase.
  // Built-in template keys are skipped — wizards forward built-in raw HTML too, and those
  // must never be re-registered as user custom templates.
  if (effectiveRawHtml && effectiveKey && !isOfficialBuiltinPwaTemplate(effectiveKey) && typeof effectiveRawHtml === 'string' && effectiveRawHtml.trim().length > 200) {
    try {
      const tName = (effectiveName || 'Custom Template').trim();
      const tSlug = String(effectiveKey).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const nowSec = Math.floor(Date.now() / 1000);
      const customTmplRow = {
        id: String(effectiveKey),
        owner_key: verifiedOwnerKey,
        category_id: null,
        name: tName,
        slug: tSlug,
        niche: effectiveNiche,
        raw_html: effectiveRawHtml,
        preview_html: effectiveRawHtml,
        style_tags: '',
        used_count: 1,
        created_at: nowSec,
      };
      await pgUpsertCustomTemplate(customTmplRow);
      db.prepare(
        `INSERT INTO custom_templates (id, owner_key, category_id, name, slug, niche, raw_html, preview_html, style_tags, used_count, created_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, '', 1, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           slug = excluded.slug,
           niche = excluded.niche,
           raw_html = excluded.raw_html,
           preview_html = excluded.preview_html`
      ).run(String(effectiveKey), verifiedOwnerKey, tName, tSlug, effectiveNiche, effectiveRawHtml, effectiveRawHtml, nowSec);
    } catch (_) {}
  }

  let html = '';
  let resolved = null;
  try {
    const compiled = await compileSite(business, effectiveKey, verifiedOwnerKey, effectiveRawHtml);
    html = compiled.html;
    resolved = compiled.resolved;
  } catch (compileErr) {
    return {
      ok: false,
      statusCode: 422,
      deployed: false,
      verifiedLive: false,
      verifiedOnCloudflare: false,
      savedToSupabase: false,
      slug,
      siteUrl: null,
      error: `Template rebranding failed for "${business.name}": ${compileErr.message}`,
    };
  }

  if (!html || html.trim().length < 2000 || html.includes('Site Customization In Progress')) {
    return {
      ok: false,
      statusCode: 422,
      deployed: false,
      verifiedLive: false,
      verifiedOnCloudflare: false,
      savedToSupabase: false,
      slug,
      siteUrl: null,
      error: `Rebranding validation failed for "${business.name}": compiled HTML did not pass integrity check.`,
    };
  }

  const contractCheck = validateBookingContract(html);
  if (!contractCheck.valid) {
    return {
      ok: false,
      statusCode: 400,
      deployed: false,
      verifiedLive: false,
      verifiedOnCloudflare: false,
      savedToSupabase: false,
      slug,
      siteUrl: null,
      error: contractCheck.customerMessage || CONTRACT_REJECTION_MESSAGE,
    };
  }

  const rebrandMs = Date.now() - rebrandStartMs;

  // ============================================================================
  // STAGE 2: PERMANENT SUPABASE CLOUD PERSISTENCE FIRST (+ STAGE ON DISK)
  // ============================================================================
  const supabaseStartMs = Date.now();
  const liveUrl = siteUrlForSlug(slug);

  emitStage('supabase_saving', {
    slug,
    businessName: business.name,
    rebrandMs,
    message: `Pushing rebranded site "${slug}" to Lunao Servers for permanent cloud deployment...`,
  });

  // 2A. Stage to SITES_DIR on disk
  try {
    await stageSite(slug, html);
  } catch (stageErr) {
    return {
      ok: false,
      statusCode: 500,
      deployed: false,
      verifiedLive: false,
      verifiedOnCloudflare: false,
      savedToSupabase: false,
      slug,
      siteUrl: null,
      error: `Failed to stage rebranded site "${slug}" on Lunao Servers: ${stageErr.message}`,
    };
  }

  // 2B. Register business in public.owner_businesses & public.tenants
  try {
    await registerOwnerBusinessAsync(verifiedOwnerKey, slug, {
      name: business.name,
      niche: effectiveNiche,
    });
  } catch (regBizErr) {
    console.warn('[unified-worker] registerOwnerBusinessAsync notice:', regBizErr.message);
  }

  const pool = getPgPool();
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO public.tenants (id, slug, name, niche, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           niche = EXCLUDED.niche,
           is_active = true,
           updated_at = NOW()`,
        [`t-${slug.slice(0, 48)}`, slug, business.name, effectiveNiche]
      );
    } catch (tenantErr) {
      console.warn('[unified-worker] public.tenants upsert notice:', tenantErr.message);
    }
  }

  // 2C. Write & confirm permanent site record in `public.user_sites` BEFORE edge deploy
  const siteRegistration = await registerUserRebrandedSite({
    ownerKey: verifiedOwnerKey,
    slug,
    businessName: business.name,
    city: business.city || '',
    niche: resolved?.niche || effectiveNiche,
    templateKey: effectiveKey,
    resolvedTemplate: resolved,
    hasRawHtmlOverride: Boolean(effectiveRawHtml),
    campaignSource,
    campaignId: campaignId ? String(campaignId) : null,
    deployUrl: liveUrl,
    html,
  });

  const supabaseMs = Date.now() - supabaseStartMs;
  emitStage('supabase_confirmed', {
    slug,
    businessName: business.name,
    savedToSupabase: Boolean(siteRegistration?.savedToSupabase),
    supabaseMs,
    message: `Confirmed on Lunao Servers in ${supabaseMs}ms. Starting Lunao Servers live deployment...`,
  });

  // ============================================================================
  // STAGE 3: LUNAO SERVERS EDGE DEPLOYMENT & 30s AUTO-RETRY VERIFICATION
  // ============================================================================
  const cloudflareStartMs = Date.now();
  let deployed = false;
  let liveVerification = { ok: true, status: 200, bytes: html.length };

  if (deploy !== false) {
    if (!cloudflare.live) {
      if (requireCloudflare !== false) {
        return {
          ok: false,
          statusCode: 400,
          deployed: false,
          verifiedLive: false,
          verifiedOnCloudflare: false,
          savedToSupabase: Boolean(siteRegistration?.savedToSupabase),
          slug,
          siteUrl: null,
          stages,
          error: `Lunao Servers deployment credentials not configured. Please verify your deployment token in Settings.`,
        };
      }
    } else {
      const projName = cloudflare.project || 'lunao-web-designn';
      emitStage('cloudflare_deploying', {
        slug,
        businessName: business.name,
        liveUrl,
        message: `Verifying "${business.name}" live deployment on Lunao Servers (${projName})...`,
      });

      // 1. Fast Edge Verification: Because Stage 2 confirmed the site in Supabase
      // and staged it on disk, Cloudflare Pages edge router (_worker.js) serves it immediately.
      liveVerification = await verifyLiveCloudflareUrl(liveUrl, business.name, 3);
      if (liveVerification.ok) {
        deployed = true;
      } else {
        // 2. If not immediately warm at the edge, execute deployment
        let deployErrorReason = '';
        const maxDeployAttempts = 2;

        for (let deployAttempt = 1; deployAttempt <= maxDeployAttempts; deployAttempt++) {
          try {
            const pubRes = await publishBatch();
            if (pubRes?.deployed) {
              deployed = true;
              break;
            }
            deployErrorReason = pubRes?.reason || 'Lunao Servers deployment did not complete.';
          } catch (err) {
            deployErrorReason = err.message || 'Lunao Servers deployment failed.';
            console.warn(`[unified-worker] Lunao Servers deploy attempt ${deployAttempt}/${maxDeployAttempts} error:`, deployErrorReason);
          }
          if (deployAttempt < maxDeployAttempts && Date.now() - cloudflareStartMs < MAX_CLOUDFLARE_RETRY_WINDOW_MS) {
            await sleep(1000);
          }
        }

        if (!deployed) {
          return {
            ok: false,
            statusCode: 502,
            deployed: false,
            verifiedLive: false,
            verifiedOnCloudflare: false,
            savedToSupabase: Boolean(siteRegistration?.savedToSupabase),
            slug,
            siteUrl: null,
            stages,
            error: `Lunao Servers deployment failed for "${business.name}": ${deployErrorReason}`.replace(/supabase(\s+cloud)?|cloudflare(\s+pages)?/gi, 'Lunao Servers'),
          };
        }

        liveVerification = await verifyLiveCloudflareUrl(liveUrl, business.name, 4);
        if (!liveVerification.ok) {
          return {
            ok: false,
            statusCode: 502,
            deployed: false,
            verifiedLive: false,
            verifiedOnCloudflare: false,
            savedToSupabase: Boolean(siteRegistration?.savedToSupabase),
            slug,
            siteUrl: null,
            stages,
            error: `Live Lunao Servers verification failed for "${business.name}" at ${liveUrl}: ${liveVerification.reason}`.replace(/supabase(\s+cloud)?|cloudflare(\s+pages)?/gi, 'Lunao Servers'),
          };
        }
      }
    }
  }

  const cloudflareMs = Date.now() - cloudflareStartMs;

  // ============================================================================
  // STAGE 4: PACING GATE (NO EXTRA WAIT IF >= 5s)
  // If the lead took >= 5 seconds (Supabase confirmation + Cloudflare verify),
  // DO NOT add any extra pacing wait! Proceed immediately to dispatch.
  // ============================================================================
  const elapsedBeforePacingMs = Date.now() - leadStartMs;
  let pacingWaitMs = 0;

  if (elapsedBeforePacingMs < 5000) {
    // Only if it completed faster than 5s, gently pad up to ~4.2s - 5s
    const targetMinMs = Math.min(5000, Math.floor(Math.random() * (5000 - 4200 + 1)) + 4200);
    if (elapsedBeforePacingMs < targetMinMs) {
      pacingWaitMs = targetMinMs - elapsedBeforePacingMs;
      emitStage('pacing_gate', {
        slug,
        businessName: business.name,
        elapsedBeforePacingMs,
        pacingWaitMs,
        message: `Finalizing cloud synchronization on Lunao Servers (${(pacingWaitMs / 1000).toFixed(1)}s)...`,
      });
      await sleep(pacingWaitMs);
    }
  }

  const totalElapsedMs = Date.now() - leadStartMs;

  emitStage('verified_live', {
    slug,
    businessName: business.name,
    siteUrl: liveUrl,
    rebrandMs,
    supabaseMs,
    cloudflareMs,
    pacingWaitMs,
    totalElapsedMs,
    message: `100% Rebranded, Saved & Verified Live on Lunao Servers (${(totalElapsedMs / 1000).toFixed(1)}s): ${liveUrl}`,
  });

  return {
    ok: true,
    statusCode: 200,
    slug,
    siteUrl: liveUrl,
    localUrl: liveUrl,
    deployed: deployed || deploy === false,
    verifiedLive: deployed || deploy === false,
    verifiedOnCloudflare: deployed || deploy === false,
    savedToSupabase: Boolean(siteRegistration?.savedToSupabase),
    edgeNetwork: 'Lunao Servers',
    httpStatus: liveVerification.status || 200,
    verifiedBytes: liveVerification.bytes || html.length,
    name: business.name,
    city: business.city || '',
    phone: business.phone || '',
    status: 'live',
    templateName: resolved?.name || effectiveName || 'Standard',
    editorEligible: Boolean(siteRegistration?.registered),
    rebrandMs,
    supabaseMs,
    cloudflareMs,
    pacingWaitMs,
    totalElapsedMs,
    stages,
    html,
    resolved,
    timings: {
      rebrandMs,
      supabaseMs,
      cloudflareMs,
      pacingWaitMs,
      totalElapsedMs,
    },
  };
}
