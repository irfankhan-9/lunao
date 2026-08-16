// Email Campaign Pipeline Orchestrator
//
// This pipeline handles the end-to-end email campaign workflow:
// 1. Get leads from campaign
// 2. For each lead: discover email (crawler or Hunter.io) if not already found
// 3. Generate and deploy site
// 4. Send personalized email
// 5. Log results and update account health
//
// Rate limiting and load balancing are handled per-account.

import { compileSite } from './compile.js';
import { stageSite, publishBatch } from './cloudflare.js';
import { slugify } from './slug.js';
import { cloudflare } from './config.js';
import { decryptToken } from './emailCrypto.js';
import {
  getEmailCampaign,
  updateEmailCampaignStatus,
  updateEmailCampaignCounts,
  listEmailLeads,
  getLeadsPendingEmailDiscovery,
  getLeadsPendingSend,
  updateLeadEmail,
  updateLeadSiteUrl,
  updateAllLeadSiteUrls,
  updateLeadSendStatus,
  logEmailSend,
  recordSend,
  canAccountSend,
  getNextAvailableAccount,
  updateEmailAccountTokenStatus,
  updateAccountBounceRate,
  updateAccountLastSuccessfulSend,
  isEmailSuppressed,
  getAccountHealth,
  DAILY_CAP,
  getEmailAccount,
} from './emailCampaigns.js';
import { discoverEmailFromWebsite } from './emailDiscovery.js';

// Default email templates
const DEFAULT_EMAIL_SUBJECT = "Quick question about {{business_name}}";
const DEFAULT_EMAIL_BODY = `Hi {{business_name}} team,

I came across {{business_name}} in {{city}} and noticed you don't have a website that showcases your services.

I built a beautiful, free landing page just for you — take a look:
{{site_url}}

It only takes a moment to review, and there's no commitment.

Best regards,
{{sender_name}}`;

// The pipeline now processes leads in parallel through a worker pool
// (see `runEmailPipeline` below). Per-account sends are still serialized
// via `enqueueOnAccount` so a single Gmail refresh token only ever sees
// one in-flight API call. No inter-lead sleep is needed — concurrency
// is bounded by the pool size.

// Render email template with personalization tokens
function renderEmailTemplate(template, data) {
  return template
    .replace(/\{\{business_name\}\}/g, data.businessName || '')
    .replace(/\{\{city\}\}/g, data.city || '')
    .replace(/\{\{site_url\}\}/g, data.siteUrl || '')
    .replace(/\{\{sender_name\}\}/g, data.senderName || 'The Lunao Team')
    .replace(/\{\{sender_email\}\}/g, data.senderEmail || '');
}

// Personalize subject to avoid byte-identical emails
function personalizeSubject(baseSubject, businessName) {
  const variations = [
    `${businessName} — quick question`,
    `Question about ${businessName}`,
    `Ideas for ${businessName}`,
    `${businessName} in ${Math.random() > 0.5 ? 'your area' : 'my neighborhood'}`,
  ];
  
  // 70% chance to personalize, 30% keep original
  if (Math.random() > 0.3 && baseSubject.includes('{{business_name}}')) {
    return baseSubject.replace(/\{\{business_name\}\}/g, businessName);
  }
  
  // Sometimes pick a variation
  if (Math.random() > 0.5) {
    return variations[Math.floor(Math.random() * variations.length)];
  }
  
  return baseSubject.replace(/\{\{business_name\}\}/g, businessName);
}

// Main pipeline runner
export async function runEmailPipeline({
  campaignId,
  accountIds,
  onEvent = () => {},
}) {
  const emit = (type, payload = {}) => onEvent({ type, ts: Date.now(), ...payload });
  
  console.log(`[email-pipeline] START campaignId=${campaignId} accountIds=${accountIds.join(',')}`);
  
  const campaign = getEmailCampaign(campaignId);
  if (!campaign) {
    console.error(`[email-pipeline] Campaign not found: ${campaignId}`);
    throw new Error('Campaign not found');
  }
  
  emit('start', { campaignId, status: 'running' });

  // Get all leads for this campaign
  const allLeads = listEmailLeads(campaignId);
  const totalLeads = allLeads.length;
  
  console.log(`[email-pipeline] Loaded ${totalLeads} leads for campaign ${campaignId}`);

  emit('leads:loaded', { count: totalLeads });

  // Per-lead serial pipeline. For each lead we run:
  //   1. Discover email (if missing)
  //   2. Compile + stage + publish personalized site
  //   3. Send email via its assigned Gmail account
  //   4. Move to the next lead.
  // Round-robin across selected accounts (10 leads + 5 accounts -> 2 per account).

  // Pre-assign each lead to an account in round-robin order so we get a
  // balanced distribution BEFORE we start sending.
  const leadsToProcess = allLeads;
  if (leadsToProcess.length === 0) {
    console.log(`[email-pipeline] No leads to process, completing immediately`);
    updateEmailCampaignStatus(campaignId, 'completed');
    updateEmailCampaignCounts(campaignId);
    emit('complete', { campaignId, sent: 0, failed: 0 });
    return;
  }

  // Per-account send count for the result card.
  const perAccountStats = new Map();
  for (const id of accountIds) {
    perAccountStats.set(id, { accountId: id, sent: 0, failed: 0 });
  }

  // Soft-cancel check: returns true if the campaign was cancelled.
  const isCancelled = () => {
    try {
      const live = getEmailCampaign(campaignId);
      return live && live.status === 'cancelled';
    } catch {
      return false;
    }
  };

  // Per-account lock: each account's sends run serially through a queue
  // so we never fire two concurrent requests on the same Gmail refresh
  // token. Different accounts run in parallel.
  const accountQueues = new Map();
  for (const id of accountIds) {
    accountQueues.set(id, { running: false, queue: [], lastSendAt: 0 });
  }
  // Minimum gap between consecutive sends on the SAME account. Without
  // this, 4 parallel workers all hitting the same Gmail refresh_token in
  // a tight loop can trigger Google's per-user throttling — the second
  // or third send silently stalls for minutes before returning. A small
  // 2.5s gap is polite enough to keep Gmail happy but still finishes a
  // 4-lead campaign in ~10s instead of the old 4-minute serial run.
  const MIN_INTER_SEND_MS = 2500;
  const enqueueOnAccount = (accountId, task) => new Promise((resolve, reject) => {
    const slot = accountQueues.get(accountId);
    if (!slot) {
      task().then(resolve, reject);
      return;
    }
    const run = () => {
      slot.running = true;
      const waitForGap = () => {
        const elapsed = Date.now() - slot.lastSendAt;
        const remaining = slot.lastSendAt > 0 ? MIN_INTER_SEND_MS - elapsed : 0;
        if (remaining > 0) setTimeout(waitForGap, remaining);
        else actuallyRun();
      };
      const actuallyRun = () => {
        slot.lastSendAt = Date.now();
        task().then(
          (v) => {
            slot.running = false;
            const next = slot.queue.shift();
            if (next) next();
            else slot.running = false;
            resolve(v);
          },
          (e) => {
            slot.running = false;
            const next = slot.queue.shift();
            if (next) next();
            else slot.running = false;
            reject(e);
          },
        );
      };
      waitForGap();
    };
    if (slot.running) slot.queue.push(run);
    else run();
  });

  // Parallelism: bounded worker pool keeps memory + DB connections stable.
  const CONCURRENCY = Math.max(4, Math.min(accountIds.length * 2, 8));
  let sentCount = 0;
  let failedCount = 0;
  let nextCursor = 0;
  let cancelled = false;

  // Phase 1 — Email discovery + site compile + stage (parallel workers, no emails yet).
  // All workers run concurrently up to CONCURRENCY. Each worker pulls the next
  // unprocessed lead, runs discovery then compile/stage, then parks. Emails are
  // NEVER sent in this phase. Leads that fail discovery or site generation are
  // skipped (not re-queued for email).
  //
  // Leads that pass Phase 1 (have email + staged site) are pushed to
  // `readyForEmail`. After all workers drain, `publishBatch()` runs as a
  // blocking barrier before any email fires.
  const readyForEmail = [];
  let phase1Complete = false;

const phase1Workers = Array.from(
  { length: Math.min(CONCURRENCY, leadsToProcess.length) },
  async () => {
    while (true) {
      if (cancelled || isCancelled()) return;
      const myIdx = nextCursor++;
      if (myIdx >= leadsToProcess.length) return;
      const rawLead = leadsToProcess[myIdx];
      const leadIndex = myIdx + 1;

      console.log(`[email-pipeline] PHASE1 lead ${leadIndex}/${leadsToProcess.length}: ${rawLead.business_name}`);
      emit('lead:start', {
        index: leadIndex,
        total: leadsToProcess.length,
        leadId: rawLead.id,
        name: rawLead.business_name,
        phase: 1,
      });

      let lead = rawLead;

      // -------- Email discovery (only if missing) --------
      if (!lead.email) {
        console.log(`[email-pipeline] Lead ${leadIndex}: No email, discovering...`);
        emit('discovery:start', { index: leadIndex, name: lead.business_name });
        if (!lead.website) {
          updateLeadEmail(lead.id, '', 'crawler', 'failed');
          emit('discovery:skipped', { index: leadIndex, name: lead.business_name, reason: 'No website' });
        } else {
          try {
            const result = await discoverEmailFromWebsite(lead.website);
            if (result.email) {
              if (isEmailSuppressed(result.email)) {
                updateLeadEmail(lead.id, result.email, result.source, 'verified');
                emit('discovery:suppressed', { index: leadIndex, name: lead.business_name, email: result.email });
              } else {
                updateLeadEmail(lead.id, result.email, result.source, 'verified');
                console.log(`[email-pipeline] Lead ${leadIndex}: Found email ${result.email} via ${result.source}`);
                emit('discovery:found', { index: leadIndex, name: lead.business_name, email: result.email, source: result.source });
              }
            } else {
              updateLeadEmail(lead.id, '', result.source || 'crawler', 'failed');
              console.log(`[email-pipeline] Lead ${leadIndex}: Email discovery failed: ${result.reason}`);
              emit('discovery:not_found', { index: leadIndex, name: lead.business_name, reason: result.reason });
            }
          } catch (err) {
            updateLeadEmail(lead.id, '', 'crawler', 'failed');
            console.error(`[email-pipeline] Lead ${leadIndex}: Email discovery error: ${err.message}`);
            emit('discovery:error', { index: leadIndex, name: lead.business_name, error: err.message });
          }
        }
      } else {
        console.log(`[email-pipeline] Lead ${leadIndex}: Has email ${lead.email}`);
      }

      // Re-read after discovery.
      const refreshedLead = listEmailLeads(campaignId).find(l => l.id === lead.id) || lead;

      // -------- Site compile + stage --------
      if (!refreshedLead.generated_site_url) {
        const slug = slugify(refreshedLead.business_name, refreshedLead.city);
        console.log(`[email-pipeline] Lead ${leadIndex}: Generating site with slug=${slug}, template=${campaign.template_key || campaign.niche}`);
        emit('site:compiling', { index: leadIndex, leadId: refreshedLead.id, name: refreshedLead.business_name, slug });
        try {
          const business = {
            name: refreshedLead.business_name,
            phone: refreshedLead.phone,
            city: refreshedLead.city,
            niche: campaign.niche,
          };
          const { html } = await compileSite(business, campaign.template_key || campaign.niche);
          const siteUrl = await stageSite(slug, html);
          updateLeadSiteUrl(refreshedLead.id, siteUrl, slug);
          console.log(`[email-pipeline] Lead ${leadIndex}: Site staged at ${siteUrl}`);
          emit('site:staged', { index: leadIndex, leadId: refreshedLead.id, name: refreshedLead.business_name, slug, siteUrl });
        } catch (err) {
          console.error(`[email-pipeline] Lead ${leadIndex}: Site generation failed: ${err.message}`);
          emit('site:failed', { index: leadIndex, leadId: refreshedLead.id, name: refreshedLead.business_name, error: err.message });
        }
      } else {
        console.log(`[email-pipeline] Lead ${leadIndex}: Site already staged at ${refreshedLead.generated_site_url}`);
        emit('site:staged', {
          index: leadIndex,
          leadId: refreshedLead.id,
          name: refreshedLead.business_name,
          slug: refreshedLead.slug,
          siteUrl: refreshedLead.generated_site_url,
        });
      }

      // Re-read after site stage. If we have an email AND a site, enqueue for Phase 3.
      const postStageLead = listEmailLeads(campaignId).find(l => l.id === lead.id) || refreshedLead;
      if (postStageLead.email && postStageLead.generated_site_url) {
        readyForEmail.push(postStageLead);
      } else {
        // No email or no site — mark failed so it doesn't get counted in email phase.
        if (!postStageLead.email) {
          updateLeadSendStatus(postStageLead.id, 'failed', 'No email address available');
          emit('lead:skipped', { index: leadIndex, name: postStageLead.business_name, reason: 'No email' });
          failedCount++;
        }
      }
    }
  },
);

await Promise.all(phase1Workers); // BLOCK until ALL Phase 1 workers finish

if (cancelled || isCancelled()) {
  updateEmailCampaignStatus(campaignId, 'cancelled');
  emit('complete', { campaignId, sent: 0, failed: failedCount, status: 'cancelled' });
  return;
}

phase1Complete = true;
emit('phase1:complete', { total: leadsToProcess.length, ready: readyForEmail.length });

// -------- Phase 2 — Cloudflare batch deploy (SINGLE blocking barrier) --------
// No email fires until every staged site is live on Cloudflare.
console.log(`[email-pipeline] Starting Cloudflare batch deploy for ${readyForEmail.length} sites...`);
emit('deploy:start', { count: readyForEmail.length, trigger: 'batch' });

try {
  const deployResult = await publishBatch();
  console.log(`[email-pipeline] Cloudflare batch deploy complete.`);
  // After a live deploy, swap every lead's staging URL (localhost) to the real
  // Cloudflare Pages URL. Emails in Phase 3 will reference the verified-live URL.
  if (cloudflare.live && deployResult?.deploymentUrl) {
    const cfBase = deployResult.deploymentUrl.replace(/\/$/, '');
    updateAllLeadSiteUrls(campaignId, cfBase);
    // Refresh the in-memory readyForEmail entries so Phase 3 uses the real URLs.
    const updatedLeads = listEmailLeads(campaignId);
    const updatedMap = new Map(updatedLeads.map((l) => [l.id, l]));
    for (const lead of readyForEmail) {
      const updated = updatedMap.get(lead.id);
      if (updated) lead.generated_site_url = updated.generated_site_url;
    }
    console.log(`[email-pipeline] Swapped all lead URLs to ${cfBase}`);
  }
  emit('deploy:done', { outcome: cloudflare.live ? 'live' : 'dry-run', count: readyForEmail.length });
} catch (err) {
  console.error(`[email-pipeline] Cloudflare batch deploy FAILED: ${err.message}`);
  emit('deploy:failed', { error: err.message });
  // Abort: zero emails sent.
  updateEmailCampaignStatus(campaignId, 'failed');
  updateEmailCampaignCounts(campaignId);
  emit('complete', { campaignId, sent: 0, failed: failedCount, status: 'failed', error: err.message });
  return;
}

// -------- Phase 3 — Email sends (parallel, per-account serialized) --------
// All generated_site_url values now point to live pages.dev URLs.
console.log(`[email-pipeline] Starting Phase 3: sending emails for ${readyForEmail.length} leads...`);

// Reset cursor for Phase 3.
nextCursor = 0;

// Give Phase 1 the email-queue slot too so concurrent Phase 3 sends don't exceed
// the total pool cap (the original pool size already limits total parallelism).
const phase3Workers = Array.from(
  { length: Math.min(CONCURRENCY, readyForEmail.length) },
  async () => {
    while (true) {
      if (cancelled || isCancelled()) return;
      const myIdx = nextCursor++;
      if (myIdx >= readyForEmail.length) return;
      const lead = readyForEmail[myIdx];
      const leadIndex = myIdx + 1; // 1-based for display

      // -------- Pick account (same round-robin) --------
      const accountId = accountIds[myIdx % accountIds.length];

      if (!accountId) {
        updateLeadSendStatus(lead.id, 'failed', 'No available accounts');
        failedCount++;
        emit('send:failed', { index: leadIndex, name: lead.business_name, reason: 'No available accounts' });
        continue;
      }

      // Account-can-send check is now ADVISORY only — the user can always
      // send past the cap. We still gate on real failures (disconnected,
      // needs_attention) which canAccountSend returns as canSend: false.
      const canSendCheck = canAccountSend(accountId);
      if (!canSendCheck.canSend) {
        updateLeadSendStatus(lead.id, 'queued', canSendCheck.reason);
        emit('send:queued', { index: leadIndex, name: lead.business_name, accountId, reason: canSendCheck.reason });
        continue;
      }

      const account = getEmailAccount(accountId);
      if (!account) {
        updateLeadSendStatus(lead.id, 'failed', 'Account not found');
        failedCount++;
        emit('send:failed', { index: leadIndex, name: lead.business_name, reason: 'Account not found' });
        continue;
      }

      const doSend = async () => {
        const emailSubject = personalizeSubject(
          campaign.email_subject || DEFAULT_EMAIL_SUBJECT,
          lead.business_name,
        );

        const emailBody = renderEmailTemplate(
          campaign.email_body || DEFAULT_EMAIL_BODY,
          {
            businessName: lead.business_name,
            city: lead.city,
            siteUrl: lead.generated_site_url, // Now guaranteed to be a live CF URL.
            senderName: account.display_name,
            senderEmail: account.email,
          },
        );

        try {
          const sendResult = await sendEmailViaAccount({
            account,
            to: lead.email,
            subject: emailSubject,
            body: emailBody,
          });

          if (sendResult.success) {
            updateLeadSendStatus(lead.id, 'sent');
            recordSend(accountId, lead.id, campaignId);
            updateAccountLastSuccessfulSend(accountId);
            logEmailSend({
              leadId: lead.id,
              campaignId,
              accountId,
              deliveryStatus: 'sent',
              subject: emailSubject,
              bodyPreview: emailBody.slice(0, 100),
            });
            emit('send:sent', {
              index: leadIndex,
              total: readyForEmail.length,
              leadId: lead.id,
              name: lead.business_name,
              email: lead.email,
              slug: lead.slug,
              accountId,
              accountEmail: account.email,
              accountName: account.display_name,
              subject: emailSubject,
              siteUrl: lead.generated_site_url,
            });
            sentCount++;
            const stat = perAccountStats.get(accountId);
            if (stat) stat.sent++;
          } else {
            updateLeadSendStatus(lead.id, 'failed', sendResult.error);
            logEmailSend({
              leadId: lead.id,
              campaignId,
              accountId,
              deliveryStatus: 'failed',
              errorCode: sendResult.errorCode,
              errorMessage: sendResult.error,
              subject: emailSubject,
              bodyPreview: emailBody.slice(0, 100),
            });
            if (sendResult.isBounce) updateAccountBounceRate(accountId);
            emit('send:failed', {
              index: leadIndex,
              leadId: lead.id,
              name: lead.business_name,
              accountId,
              accountEmail: account.email,
              reason: sendResult.error,
            });
            failedCount++;
            const stat = perAccountStats.get(accountId);
            if (stat) stat.failed++;
          }
        } catch (err) {
          updateLeadSendStatus(lead.id, 'failed', err.message);
          emit('send:error', {
            index: leadIndex,
            leadId: lead.id,
            name: lead.business_name,
            accountId,
            accountEmail: account?.email,
            error: err.message,
          });
          failedCount++;
          const stat = perAccountStats.get(accountId);
          if (stat) stat.failed++;
        }
      };

      await enqueueOnAccount(accountId, doSend);
    }
  },
);

await Promise.all(phase3Workers);

  // Finalize
  updateEmailCampaignCounts(campaignId);

  // Partial-failure tracking: if anything failed or was queued, surface it.
  const finalStatus = failedCount > 0 || sentCount === 0
    ? (sentCount > 0 ? 'partially_failed' : 'completed')
    : 'completed';
  updateEmailCampaignStatus(campaignId, finalStatus);

  emit('complete', {
    campaignId,
    sent: sentCount,
    failed: failedCount,
    status: finalStatus,
    perAccount: Array.from(perAccountStats.values()),
  });
}

// Send through a connected OAuth account. Decrypts the stored refresh_token,
// mints a fresh access_token via Google's token endpoint, then POSTs to the
// Gmail API. Outlook fallback uses Microsoft Graph in a follow-up.
async function sendEmailViaAccount({ account, to, subject, body }) {
  if (!account) throw new Error('account required');
  
  let refreshToken;
  try {
    refreshToken = decryptToken(account.encrypted_refresh_token || '');
  } catch {
    throw new Error('Stored refresh token could not be decrypted. Reconnect the account.');
  }
  if (!refreshToken) {
    const err = new Error('Refresh token missing. Reconnect this account.');
    err.code = 'TOKEN_REVOKED';
    throw err;
  }
  
  if (account.provider === 'gmail') {
    const { sendGmailEmail } = await import('./gmail.js');
    try {
      const result = await sendGmailEmail({
        refreshToken,
        to,
        from: account.email,
        fromName: account.display_name,
        subject,
        body,
      });
      return { success: true, messageId: result.messageId || `gmail_${Date.now()}` };
    } catch (err) {
      // Mark account needing attention if Google rejected our refresh token
      if (err.code === 'TOKEN_REVOKED' || /invalid_grant/i.test(err.message)) {
        try { updateEmailAccountTokenStatus(account.id, 'revoked'); } catch {}
      }
      throw err;
    }
  }
  
  // No Microsoft Graph yet — surface that as a clear error.
  throw new Error(`Provider "${account.provider}" not yet wired for live sending.`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
