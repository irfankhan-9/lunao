// End-to-end campaign pipeline orchestrator.
//
// Per PROJECT_CONTEXT.md the lifecycle for each business is:
//   (A) read raw template -> (B) replace placeholders -> (C) deploy ->
//   (D) build link -> (E) dispatch SMS
//
// For efficiency we compile + stage every site first, publish the whole batch
// to Cloudflare Pages once, then dispatch SMS. Events are streamed back via the
// onEvent callback so both the SSE API and the CLI can render live progress.
//
// Server-side persistence + credit enforcement are optional but strongly
// recommended. If `campaignId`, `leadIds`, `ownerKey` are passed, every lead
// outcome and SMS send is recorded in the database, and SMS failures are
// auto-refunded (3 credits per lead with no successful SMS).
import { compileSite } from './compile.js';
import { stageSite, publishBatch, validateCloudflareToken } from './cloudflare.js';
import { sendSms, renderSms, countSegments, toE164, fetchMessageStatus } from './telnyx.js';
import { slugify } from './slug.js';
import { cloudflare, telnyx, modeSummary } from './config.js';
import {
  recordLeadResult,
  logSmsAttempt,
  updateSmsStatus,
  getCampaign,
  finalizeCampaign,
  markCampaignFailed,
  markCampaignCancelled,
} from './campaigns.js';
import { refund, getAccount } from './credits.js';

const DEFAULT_SMS =
  "Hi, we noticed {{business_name}} doesn't have a website yet to showcase your services in {{city}}.\n\nWe built a beautiful custom preview for you — take a look: {{site_url}}\n\nReply YES to publish it instantly!\n\n— The Lunao Team";

// Cost model — kept in sync with src/App.tsx (COST_PER_LEAD = 4).
// 3 credits are reserved per lead for SMS (refunded on SMS failure),
// 1 credit is reserved for site gen (refunded on site gen failure).
export const COST_PER_LEAD = 4;
export const SMS_COST_PER_LEAD = 3;
export const SITE_COST_PER_LEAD = 1;

// When skipSms === true, Phase C is skipped entirely. Used by the
// sites-only "Site Deploy" campaign flow.
export async function runPipeline({
  businesses = [],
  niche,
  // The unified template key — built-in slug ("barber-dark-luxury"),
  // custom DB id ("tmpl_xxx"), or legacy niche string ("Barber").
  // The server's templates.js resolver handles all three forms.
  templateKey = null,
  // Legacy fields kept for back-compat with the older API surface.
  // templateId is the old "custom template id or t1..t8 client id";
  // templateFile is the raw file name under /public/templates-raw/.
  // Both are normalized through templates.js before use.
  templateId = null,
  templateFile = null,
  smsTemplate,
  skipSms = false,   // skip Phase C (SMS dispatch) — sites-only pipeline
  onEvent = () => {},
  // Server-side persistence + enforcement (optional but recommended).
  ownerKey = null,
  campaignId = null, // maps businesses[i] to leads[campaignId][i]
  leadIds = [],      // parallel array of DB lead ids; indexed by businesses[i]
} = {}) {
  // Resolve the user-supplied template selection into the unified key.
  // Priority: explicit templateKey > templateFile > templateId > per-row
  // niche > global niche. templates.js handles each form via its resolver.
  const resolvedKey = templateKey || templateFile || templateId || niche;

  const emit = (type, payload = {}) => onEvent({ type, ts: Date.now(), ...payload });
  const results = [];
  const template = smsTemplate || DEFAULT_SMS;
  const useDb = Boolean(ownerKey && campaignId && Array.isArray(leadIds) && leadIds.length === businesses.length);

  // ---- Server-side credit balance is owned by the route, not the pipeline.
  // The route (POST /api/campaign/run) is responsible for the pre-flight
  // charge and 402 response. By the time we get here the user has already
  // paid COST_PER_LEAD per business. We only handle the *refund* path
  // (site-failed, sms-failed) inside the pipeline.
  let account = null;
  if (ownerKey) {
    try {
      account = getAccount(ownerKey);
    } catch (err) {
      emit('credits:error', { error: err.message });
    }
  }
  if (ownerKey && account) {
    const charged = businesses.length * (skipSms ? SITE_COST_PER_LEAD : COST_PER_LEAD);
    emit('credits:charged', { amount: charged, balance: account.balance, source: 'route' });
  }

  emit('start', {
    total: businesses.length,
    niche: niche || '(per-row)',
    mode: modeSummary(),
    campaignId,
  });

  // Soft-cancel guard: between every lead boundary, peek at the DB row the
  // user can flip via POST /api/campaigns/:id/cancel. We never throw — just
  // bail out cleanly so the SSE stream gets a {type:'cancelled'} event and
  // closes. The current in-flight lead is allowed to finish naturally (a
  // Cloudflare deploy or Telnyx send already in progress will complete),
  // we just stop starting new ones.
  const checkCancelled = () => {
    if (!useDb) return false;
    try {
      const c = getCampaign(campaignId);
      if (c && c.status === 'cancelled') {
        emit('cancelled', { campaignId, processed: results.length, total: businesses.length });
        markCampaignCancelled(campaignId);
        return true;
      }
    } catch {
      /* ignore — keep running */
    }
    return false;
  };

  // Log to stdout so Railway deploy logs show the pipeline starting.
  console.log(`[pipeline] start campaignId=${campaignId} leads=${businesses.length} niche=${niche || '(per-row)'} templateId=${templateId || '(default)'} templateFile=${templateFile || '(none)'}`);

  // Phase A: compile + stage every personalized site.
  for (let i = 0; i < businesses.length; i++) {
    if (checkCancelled()) return { summary: null, results };
    const biz = businesses[i];
    const index = i + 1;
    const targetNiche = biz.niche || niche;
    // Per-row template override trumps the campaign-wide one when present.
    // resolvedKey above already picked the best campaign-wide key, but
    // some flows let individual rows specify their own (e.g. per-row
    // templateId coming from a rich CSV). Same resolution priority.
    const rowKey = biz.templateKey || biz.templateFile || biz.templateId || null;
    const effectiveKey = rowKey || resolvedKey || targetNiche;
    const slug = biz.slug || slugify(biz.name, biz.city);
    const leadId = useDb ? leadIds[i] : null;

    emit('site:compiling', { index, name: biz.name, slug });
    try {
      const { html, resolved } = await compileSite(biz, effectiveKey, ownerKey);
      const siteUrl = await stageSite(slug, html);
      const result = {
        index,
        name: biz.name,
        phone: biz.phone || '',
        city: biz.city || '',
        slug,
        templateKey: resolved.key,
        templateFile: resolved.rawFile || null,
        templateName: resolved.name,
        siteUrl,
        siteStatus: 'generated',
        smsStatus: 'pending',
        leadId,
      };
      results.push(result);
      if (useDb) {
        recordLeadResult(leadId, { siteStatus: 'generated', siteUrl, smsStatus: 'pending' });
      }
      emit('site:generated', { index, name: biz.name, slug, siteUrl, templateKey: resolved.key, templateFile: resolved.rawFile, templateName: resolved.name });
    } catch (err) {
      // Always log the full error to stdout so it shows up in Railway deploy
      // logs and is easy to diagnose. Previously this was only emitted as an
      // SSE event which the dashboard's UI sometimes swallowed.
      console.error(`[pipeline] site:failed #${index} "${biz.name}" (niche=${targetNiche}) -> ${err.message}`);
      if (err.stack) console.error(err.stack);
      const result = {
        index,
        name: biz.name,
        phone: biz.phone || '',
        city: biz.city || '',
        slug,
        siteStatus: 'failed',
        smsStatus: 'skipped',
        error: err.message,
        leadId,
      };
      results.push(result);
      if (useDb) {
        recordLeadResult(leadId, { siteStatus: 'failed', smsStatus: 'skipped', smsError: err.message });
      }
      // Refund the site-gen cost (1 credit) for this failed site.
      if (ownerKey && leadId) {
        try {
          refund(ownerKey, SITE_COST_PER_LEAD, 'site_failed_refund', { type: 'lead', id: String(leadId) });
        } catch (e) { /* ignore */ }
      }
      emit('site:failed', { index, name: biz.name, slug, error: err.message, niche: targetNiche });
    }
  }

  // Phase B: publish the whole staged directory to Cloudflare Pages (once).
  const staged = results.filter((r) => r.siteStatus === 'generated');
  // Outcome tracker: 'live' if Cloudflare accepted, 'local' if we only
  // wrote sites to disk (no Cloudflare creds), 'failed' if the upload
  // threw. The frontend uses this to flip the campaign row to a terminal
  // state so the wizard never gets stuck on "Deploying…".
  let deployOutcome = 'skipped';
  let deployError = null;
  if (staged.length) {
    emit('deploy:start', { count: staged.length, live: cloudflare.live });
    // Pre-flight: validate the Cloudflare token + project before invoking
    // wrangler. This gives the user a clear, actionable error in seconds
    // (with the fix steps) instead of waiting 30s for wrangler to fail
    // with a wall of cryptic stderr.
    if (cloudflare.live) {
      try {
        const tokenCheck = await validateCloudflareToken();
        if (!tokenCheck.ok) {
          console.error(`[pipeline] cloudflare pre-flight failed: ${tokenCheck.reason}`);
          if (tokenCheck.fix) console.error(`[pipeline] fix: ${tokenCheck.fix}`);
          emit('deploy:error', { error: tokenCheck.reason, fix: tokenCheck.fix || null });
          // Continue to wrangler anyway — it may have more context. But
          // the user will see the clear error message first.
        } else {
          console.log(`[pipeline] cloudflare pre-flight ok: token valid, project "${cloudflare.project}" accessible`);
        }
      } catch (e) {
        // Pre-flight network error: continue to wrangler.
      }
    }
    try {
      const publish = await publishBatch();
      emit('deploy:done', { ...publish, count: staged.length, outcome: cloudflare.live ? 'live' : 'local' });
      deployOutcome = cloudflare.live ? 'live' : 'local';
    } catch (err) {
      // Log loudly: a deploy error is the #1 cause of "blank site" reports.
      // The site HTML was written locally, but Cloudflare never received it.
      console.error(`[pipeline] deploy:error -> ${err.message}`);
      if (err.stack) console.error(err.stack);
      deployError = err.message;
      emit('deploy:error', { error: err.message });
      // Sites are still staged locally; mark but continue (SMS may be skipped).
      deployOutcome = 'failed';
    }
  } else {
    // No sites were generated — every row failed. Still emit a synthetic
    // deploy:done so the frontend's UI knows the campaign is finished.
    emit('deploy:done', { count: 0, outcome: 'failed', error: 'No sites were generated.' });
    deployOutcome = 'failed';
  }

  // Phase C: dispatch SMS — skipped when skipSms (sites-only pipeline).
  if (!skipSms) {
  for (const result of results) {
    if (result.siteStatus !== 'generated') continue;
    if (checkCancelled()) return { summary: null, results };
    const text = renderSms(template, {
      businessName: result.name,
      city: result.city,
      siteUrl: result.siteUrl,
    });
    // SMS master switch OFF -> queue as "Coming Soon", never call Telnyx.
    if (!telnyx.enabled) {
      result.smsStatus = 'coming_soon';
      result.smsText = text;
      if (useDb) {
        recordLeadResult(result.leadId, { smsStatus: 'coming_soon' });
      }
      emit('sms:coming_soon', {
        index: result.index,
        name: result.name,
        to: result.phone,
        siteUrl: result.siteUrl,
      });
      continue;
    }
    if (!result.phone) {
      result.smsStatus = 'skipped';
      if (useDb) {
        recordLeadResult(result.leadId, { smsStatus: 'skipped', smsError: 'No phone number' });
      }
      emit('sms:skipped', { index: result.index, name: result.name, reason: 'No phone number' });
      continue;
    }
    const dest = toE164(result.phone);
    if (!dest) {
      result.smsStatus = 'failed';
      result.smsText = text;
      if (useDb) {
        recordLeadResult(result.leadId, { smsStatus: 'failed', smsError: 'Invalid phone format' });
      }
      emit('sms:failed', { index: result.index, name: result.name, error: 'Invalid phone format' });
      if (ownerKey && result.leadId) {
        try {
          refund(ownerKey, SMS_COST_PER_LEAD, 'sms_failed_refund', { type: 'lead', id: String(result.leadId) });
        } catch (e) { /* ignore */ }
      }
      continue;
    }

    // Log the attempt *before* sending so we have a row even if the process
    // crashes mid-flight.
    let smsLogId = null;
    if (useDb) {
      const log = logSmsAttempt({
        campaignId,
        leadId: result.leadId,
        ownerKey,
        to: dest,
        from: telnyx.from,
        body: text,
        status: 'queued',
        segmentCount: countSegments(text),
        costCredits: SMS_COST_PER_LEAD,
      });
      smsLogId = log.id;
    }

    emit('sms:sending', { index: result.index, name: result.name, to: dest });
    console.log(`[pipeline] sms:sending #${result.index} "${result.name}" to=${dest} from=${telnyx.from} telnyx.live=${telnyx.live}`);
    try {
      const sms = await sendSms({ to: result.phone, text });
      console.log(`[pipeline] sms:result #${result.index} status=${sms.status} simulated=${sms.simulated} telnyxId=${sms.id || 'null'}${sms.error ? ' error=' + sms.error : ''}${sms.errorCode ? ' code=' + sms.errorCode : ''}`);
      result.smsStatus = sms.status;
      result.smsSimulated = sms.simulated;
      result.smsText = text;
      result.smsLogId = smsLogId;
      result.smsId = sms.id;
      if (sms.status === 'failed') {
        if (useDb) {
          recordLeadResult(result.leadId, { smsStatus: 'failed', smsError: sms.error });
          if (smsLogId) {
            updateSmsStatus(smsLogId, {
              status: 'failed',
              error_code: sms.errorCode || 'E_UNKNOWN',
              error_message: sms.error,
            });
          }
        }
        // Refund the SMS cost (3 credits) for this failed send.
        if (ownerKey && result.leadId) {
          try {
            refund(ownerKey, SMS_COST_PER_LEAD, 'sms_failed_refund', { type: 'lead', id: String(result.leadId) });
          } catch (e) { /* ignore */ }
        }
        emit('sms:failed', { index: result.index, name: result.name, error: sms.error, errorCode: sms.errorCode });
      } else if (sms.status === 'simulated') {
        if (useDb) {
          recordLeadResult(result.leadId, { smsStatus: 'simulated' });
          if (smsLogId) updateSmsStatus(smsLogId, { status: 'simulated' });
        }
        emit('sms:sent', {
          index: result.index,
          name: result.name,
          to: sms.to,
          siteUrl: result.siteUrl,
          simulated: true,
        });
      } else {
        if (useDb) {
          recordLeadResult(result.leadId, { smsStatus: 'sent' });
          if (smsLogId) {
            updateSmsStatus(smsLogId, { status: 'sent', telnyx_id: sms.id, segment_count: sms.segmentCount || 1 });
          }
        }
        // Best-effort: if Telnyx already reports delivered, upgrade the lead
        // and sms_log status so the dashboard shows the real outcome.
        if (!sms.simulated && sms.id) {
          const status = await fetchMessageStatus(sms.id);
          if (status && status.status === 'delivered') {
            if (useDb) {
              recordLeadResult(result.leadId, { smsStatus: 'delivered' });
              if (smsLogId) updateSmsStatus(smsLogId, { status: 'delivered' });
            }
            result.smsStatus = 'delivered';
          }
        }
        emit('sms:sent', {
          index: result.index,
          name: result.name,
          to: sms.to,
          siteUrl: result.siteUrl,
          simulated: false,
          telnyxId: sms.id,
        });
      }
    } catch (err) {
      result.smsStatus = 'failed';
      if (useDb) {
        recordLeadResult(result.leadId, { smsStatus: 'failed', smsError: err.message });
        if (smsLogId) {
          updateSmsStatus(smsLogId, { status: 'failed', error_code: 'E_THROW', error_message: err.message });
        }
      }
      if (ownerKey && result.leadId) {
        try {
          refund(ownerKey, SMS_COST_PER_LEAD, 'sms_failed_refund', { type: 'lead', id: String(result.leadId) });
        } catch (e) { /* ignore */ }
      }
      emit('sms:failed', { index: result.index, name: result.name, error: err.message });
    }
  }
  } // end Phase C (SMS dispatch)

  const summary = {
    total: businesses.length,
    sitesGenerated: results.filter((r) => r.siteStatus === 'generated').length,
    smsSent: results.filter((r) => r.smsStatus === 'sent' || r.smsStatus === 'simulated' || r.smsStatus === 'delivered').length,
    smsComingSoon: results.filter((r) => r.smsStatus === 'coming_soon').length,
    failed: results.filter((r) => r.siteStatus === 'failed' || r.smsStatus === 'failed').length,
    telnyx: telnyx.live ? 'live' : telnyx.enabled ? 'simulated' : 'coming_soon',
    cloudflare: cloudflare.live ? 'live' : 'local',
  };
  console.log(`[pipeline] done campaignId=${campaignId} sites=${summary.sitesGenerated}/${summary.total} sms=${summary.smsSent} failed=${summary.failed}`);
  emit('done', { summary, results });
  if (useDb) {
    finalizeCampaign(campaignId, {
      creditsCharged: businesses.length * (skipSms ? SITE_COST_PER_LEAD : COST_PER_LEAD),
    });
  }
  return { summary, results };
}
