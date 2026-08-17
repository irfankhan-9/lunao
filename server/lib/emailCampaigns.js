// Email campaign database operations
import { db } from './db.js';
import { decryptToken } from './emailCrypto.js';
import { siteBaseUrl } from './config.js';

// Safe daily cap for a connected sending account.
// We deliberately cap this LOW: Gmail aggressively throttles accounts that
// ramp fast. 80/day keeps a steady Lunao user out of spam folders for months.
export const DAILY_CAP = 80;

// Health formula: a non-linear curve that drops FAST so users see warnings
// long before they hit Google's spam filters. The user's spec was:
//   ~100% (high remaining) below 30 sent
//   ~40% remaining at 30 sent
//   ~10% remaining at 70 sent
//   0% at 80 sent (= "Health ruined")
// We model this as a piecewise curve with three break points.
export function computeHealthPercent(sendsLast24h, cap = DAILY_CAP) {
  const sent = Math.max(0, Number(sendsLast24h) || 0);
  if (sent >= cap) return 0;
  if (sent <= 25) return 100; // healthy / high remaining
  // 25 → 100%, 30 → 40%, 70 → 10%, 80 → 0%
  if (sent < 30) {
    // 25 → 100, 30 → 40 : linear over 5-unit span
    const t = (sent - 25) / 5;
    return Math.round(100 - t * 60);
  }
  if (sent < 70) {
    // 30 → 40, 70 → 10 : linear over 40-unit span
    const t = (sent - 30) / 40;
    return Math.round(40 - t * 30);
  }
  // 70 → 10, 80 → 0 : linear over 10-unit span
  const t = (sent - 70) / 10;
  return Math.max(0, Math.round(10 - t * 10));
}

export function getHealthLabel(percent) {
  if (percent <= 0) return 'health_ruined';
  if (percent <= 10) return 'critical';
  if (percent <= 40) return 'warning';
  if (percent <= 100) return 'healthy';
  return 'healthy';
}

// Battery math for the picker + dashboard bar.
//
// User spec: 300 sends = 0% battery, 0 sends = 100% battery. Linear, simple,
// and easy to explain. We clamp at 0 once we cross the cap so the bar never
// displays a negative number. The bar colour flips to red below 20% so a
// glance is enough to spot a drained account.
export const BATTERY_DEFAULT_CAPACITY = 300;

export function computeBatteryPercent(sendsLast24h, cap = BATTERY_DEFAULT_CAPACITY) {
  const sent = Math.max(0, Number(sendsLast24h) || 0);
  const c = Math.max(1, Number(cap) || BATTERY_DEFAULT_CAPACITY);
  if (sent >= c) return 0;
  return Math.round((1 - sent / c) * 100);
}

export function getBatteryLabel(percent) {
  if (percent <= 0) return 'empty';
  if (percent <= 20) return 'critical';
  if (percent <= 50) return 'low';
  return 'good';
}

// Persist a paused flag change. Returns the updated row. We deliberately do
// NOT enforce this on `canAccountSend` — pausing is advisory only. The
// picker surfaces a warning card so the user knows what they're doing, but
// if they click Launch anyway, the sends go through. This matches the
// product spec: "users can still use emails even after running out of 100%
// battery — let them use it".
export function setEmailAccountPaused(accountId, paused) {
  db.prepare('UPDATE email_accounts SET paused = ? WHERE id = ?').run(
    paused ? 1 : 0,
    accountId,
  );
  return getEmailAccount(accountId);
}

// Count sends in a rolling 24h window (used by the new health formula).
// Backed by `email_send_history` for accuracy across day boundaries.
export function getSendsInRolling24h(accountId, now = Date.now()) {
  const cutoff = Math.floor((now - 24 * 60 * 60 * 1000) / 1000);
  return db.prepare(
    'SELECT COUNT(*) AS n FROM email_send_history WHERE account_id = ? AND sent_at > ?'
  ).get(accountId, cutoff)?.n || 0;
}

// Recompute the cached `sends_today` column to match the rolling 24h window.
// We do this lazily on read instead of on every send, so the column always
// reflects *the last 24 hours*, not a calendar day.
export function refreshRollingSends(accountId, now = Date.now()) {
  const n = getSendsInRolling24h(accountId, now);
  db.prepare(
    'UPDATE email_accounts SET sends_today = ?, last_reset_at = ? WHERE id = ?'
  ).run(n, Math.floor(now / 1000), accountId);
}

// Create a new email campaign
export function createEmailCampaign({
  userId,
  niche,
  templateId,
  templateKey,
  leadSource,
  targetVolume,
  city,
  category,
  emailSubject,
  emailBody,
  csvSnapshot,
  leads = [],
}) {
  const id = 'emc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const now = Math.floor(Date.now() / 1000);
  
  db.prepare(`
    INSERT INTO email_campaigns (
      id, user_id, niche, template_id, template_key, lead_source, target_volume,
      city, category, status, email_subject, email_body, csv_snapshot,
      created_at, leads_found, emails_found, sites_generated, emails_sent,
      emails_delivered, emails_bounced, emails_failed, credits_charged, credits_refunded
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0)
  `).run(
    id, userId, niche || '', templateId || '', templateKey || '',
    leadSource || 'csv', targetVolume || 0, city || '', category || '',
    emailSubject || '', emailBody || '', csvSnapshot || null, now
  );
  
  // Bulk-insert all leads from the CSV in a single transaction.
  if (leads.length > 0) {
    const insert = db.prepare(`
      INSERT INTO email_leads (
        campaign_id, business_name, phone, city, website, email,
        email_source, verification_status, slug, send_status, index_in_campaign, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'csv', 'pending', '', 'pending', ?, ?)
    `);
    const insertAll = db.transaction((rows) => {
      rows.forEach((lead, i) => {
        insert.run(
          id,
          (lead.name || '').trim(),
          (lead.phone || '').replace(/[^\d+]/g, ''),
          (lead.city || '').trim(),
          (lead.website || lead.url || '').trim(),
          (lead.email || '').trim(),
          i,
          now
        );
      });
    });
    insertAll(leads);
  }
  
  return getEmailCampaign(id);
}

// Get email campaign by ID
export function getEmailCampaign(id) {
  const campaign = db.prepare('SELECT * FROM email_campaigns WHERE id = ?').get(id);
  if (!campaign) return null;
  // Attach live counts so callers (especially the 2-second polling hook) always
  // get an accurate leads / sites_generated / sent / failed picture without needing a
  // separate round-trip.
  const counts = getEmailCampaignCounts(id);
  campaign.leads_found = counts.leads_found;
  campaign.sites_generated = counts.sites_generated;
  campaign.sent = counts.emails_sent;
  campaign.failed = counts.emails_failed;
  return campaign;
}

// Mark an email campaign as cancelled by the user. Soft cancel — the
// in-flight runEmailPipeline() loop checks this on every lead boundary
// via getEmailCampaign() and exits early.
export function markEmailCampaignCancelled(id) {
  db.prepare(
    `UPDATE email_campaigns SET status = 'cancelled', completed_at = ? WHERE id = ?`,
  ).run(Math.floor(Date.now() / 1000), id);
  return getEmailCampaign(id);
}

// List email campaigns for a user
export function listEmailCampaigns(userId, limit = 50) {
  const campaigns = db.prepare(
    'SELECT * FROM email_campaigns WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, limit);
  // Attach live counts to each campaign
  return campaigns.map(c => {
    const counts = getEmailCampaignCounts(c.id);
    return {
      ...c,
      leads_found: counts.leads_found,
      sites_generated: counts.sites_generated,
      sent: counts.emails_sent,
      failed: counts.emails_failed,
    };
  });
}

// Update email campaign status
export function updateEmailCampaignStatus(id, status) {
  const updates = { status };
  
  if (status === 'running' && !getEmailCampaign(id)?.started_at) {
    updates.started_at = Math.floor(Date.now() / 1000);
  }
  if (status === 'completed') {
    updates.completed_at = Math.floor(Date.now() / 1000);
  }
  
  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), id];
  
  db.prepare(`UPDATE email_campaigns SET ${setClauses} WHERE id = ?`).run(...values);
}

// Update email campaign counts
// Compute authoritative sent/failed/sites counts from email_leads for a campaign.
// Called by updateEmailCampaignCounts to persist accurate totals to the DB row.
function getEmailCampaignCounts(id) {
  const leads = db.prepare(`
    SELECT
      COUNT(*)                                          AS leads_found,
      COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) AS emails_found,
      COUNT(CASE WHEN generated_site_url IS NOT NULL AND generated_site_url != '' THEN 1 END) AS sites_generated,
      COUNT(CASE WHEN send_status = 'sent' THEN 1 END)   AS emails_sent,
      COUNT(CASE WHEN send_status = 'failed' THEN 1 END) AS emails_failed
    FROM email_leads WHERE campaign_id = ?
  `).get(id);
  return leads;
}

export function updateEmailCampaignCounts(id) {
  const counts = getEmailCampaignCounts(id);
  if (!counts) return;
  db.prepare(`
    UPDATE email_campaigns SET 
      leads_found = COALESCE(?, 0),
      emails_found = COALESCE(?, 0),
      sites_generated = COALESCE(?, 0),
      emails_sent = COALESCE(?, 0),
      emails_delivered = COALESCE(?, 0),
      emails_bounced = COALESCE(?, 0),
      emails_failed = COALESCE(?, 0)
    WHERE id = ?
  `).run(
    counts?.leads_found || 0,
    counts?.emails_found || 0,
    counts?.sites_generated || 0,
    counts?.emails_sent || 0,
    counts?.emails_delivered || 0,
    counts?.emails_bounced || 0,
    counts?.emails_failed || 0,
    id
  );
}

// Add a lead to an email campaign
export function addEmailLead({
  campaignId,
  businessName,
  phone,
  city,
  website,
  email,
  emailSource,
  verificationStatus,
  slug,
}) {
  const now = Math.floor(Date.now() / 1000);
  const index = db.prepare(
    'SELECT COALESCE(MAX(index_in_campaign), -1) + 1 as next FROM email_leads WHERE campaign_id = ?'
  ).get(campaignId)?.next || 0;
  
  const result = db.prepare(`
    INSERT INTO email_leads (
      campaign_id, business_name, phone, city, website, email, email_source,
      verification_status, slug, send_status, index_in_campaign, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    campaignId, businessName || '', phone || '', city || '', 
    website || '', email || '', emailSource || 'csv',
    verificationStatus || 'pending', slug || '', index, now
  );
  
  return {
    id: result.lastInsertRowid,
    campaign_id: campaignId,
    business_name: businessName,
    phone, city, website, email, email_source: emailSource,
    verification_status: verificationStatus,
    slug, send_status: 'pending',
    index_in_campaign: index,
    created_at: now
  };
}

// Get leads for an email campaign (with account email info)
export function listEmailLeads(campaignId) {
  return db.prepare(
    'SELECT * FROM email_leads WHERE campaign_id = ? ORDER BY index_in_campaign'
  ).all(campaignId);
}

// Get leads for an email campaign with account email info for display
export function listEmailLeadsWithAccounts(campaignId) {
  return db.prepare(`
    SELECT 
      el.*,
      ea.email as account_email,
      ea.provider as account_provider
    FROM email_leads el
    LEFT JOIN email_accounts ea ON el.assigned_account_id = ea.id
    WHERE el.campaign_id = ?
    ORDER BY el.index_in_campaign
  `).all(campaignId);
}

// Get leads pending email discovery
export function getLeadsPendingEmailDiscovery(campaignId) {
  return db.prepare(
    'SELECT * FROM email_leads WHERE campaign_id = ? AND email = "" AND verification_status = "pending" ORDER BY index_in_campaign'
  ).all(campaignId);
}

// Get leads pending send
export function getLeadsPendingSend(campaignId) {
  return db.prepare(`
    SELECT el.*, ea.daily_cap, ea.sends_today, ea.status as account_status
    FROM email_leads el
    LEFT JOIN email_accounts ea ON el.assigned_account_id = ea.id
    WHERE el.campaign_id = ? 
      AND el.email != ''
      AND el.send_status = 'pending'
    ORDER BY el.index_in_campaign
  `).all(campaignId);
}

// Update lead email
export function updateLeadEmail(leadId, email, source, verificationStatus) {
  db.prepare(`
    UPDATE email_leads SET 
      email = ?, 
      email_source = ?, 
      verification_status = ? 
    WHERE id = ?
  `).run(email, source, verificationStatus, leadId);
}

// Update lead site URL
export function updateLeadSiteUrl(leadId, siteUrl, slug) {
  db.prepare(`
    UPDATE email_leads SET generated_site_url = ?, slug = ? WHERE id = ?
  `).run(siteUrl, slug, leadId);
}

// Update generated_site_url for all leads in a campaign from their local
// staging URL to the real Cloudflare Pages base URL. Called after a
// successful publishBatch() so emails reference live URLs.
export function updateAllLeadSiteUrls(campaignId, cloudflareBaseUrl) {
  db.prepare(`
    UPDATE email_leads
    SET generated_site_url = ?
      || SUBSTR(generated_site_url, LENGTH(?) + 1)
    WHERE campaign_id = ?
      AND generated_site_url LIKE ? || '%'
  `).run(
    cloudflareBaseUrl,
    siteBaseUrl(),
    campaignId,
    siteBaseUrl(),
  );
}

// Assign lead to account
export function assignLeadToAccount(leadId, accountId) {
  db.prepare('UPDATE email_leads SET assigned_account_id = ? WHERE id = ?').run(accountId, leadId);
}

// Update lead send status
export function updateLeadSendStatus(leadId, status, error = null) {
  const updates = { send_status: status };
  if (status === 'sent') {
    updates.sent_at = Math.floor(Date.now() / 1000);
  }
  if (error) {
    updates.send_error = error;
  }
  
  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), leadId];
  
  db.prepare(`UPDATE email_leads SET ${setClauses} WHERE id = ?`).run(...values);
}

// Log email send attempt
export function logEmailSend({
  leadId,
  campaignId,
  accountId,
  deliveryStatus,
  bounceStatus,
  errorCode,
  errorMessage,
  subject,
  bodyPreview,
}) {
  const now = Math.floor(Date.now() / 1000);
  
  db.prepare(`
    INSERT INTO email_logs (
      lead_id, campaign_id, account_id, sent_at, delivery_status,
      bounce_status, error_code, error_message, subject, body_preview
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    leadId, campaignId, accountId, now,
    deliveryStatus || 'pending',
    bounceStatus || null,
    errorCode || null,
    errorMessage || null,
    subject || '',
    bodyPreview ? bodyPreview.slice(0, 200) : ''
  );
}

// Add to suppression list
export function addToSuppression(email, reason, source = 'manual') {
  const now = Math.floor(Date.now() / 1000);
  
  db.prepare(`
    INSERT OR IGNORE INTO email_suppression (email, reason, source, created_at)
    VALUES (?, ?, ?, ?)
  `).run(email.toLowerCase().trim(), reason, source, now);
}

// Check if email is suppressed
export function isEmailSuppressed(email) {
  const entry = db.prepare(
    'SELECT * FROM email_suppression WHERE email = ?'
  ).get(email.toLowerCase().trim());
  return entry;
}

// Get suppression list
export function getSuppressionList(limit = 1000) {
  return db.prepare(
    'SELECT * FROM email_suppression ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
}

// Record send in history (for rate limiting)
export function recordSend(accountId, leadId, campaignId) {
  const now = Math.floor(Date.now() / 1000);
  
  db.prepare(`
    INSERT INTO email_send_history (account_id, sent_at, lead_id, campaign_id)
    VALUES (?, ?, ?, ?)
  `).run(accountId, now, leadId, campaignId);
  
  // Update account sends_today
  db.prepare(`
    UPDATE email_accounts SET sends_today = sends_today + 1 WHERE id = ?
  `).run(accountId);
}

// Get sends in rolling 24-hour window for an account
export function getSendsInWindow(accountId, windowMs = 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - windowMs;
  
  return db.prepare(
    'SELECT COUNT(*) as count FROM email_send_history WHERE account_id = ? AND sent_at > ?'
  ).get(accountId, Math.floor(cutoff / 1000))?.count || 0;
}

// Reset sends_today to match the rolling 24h window (always idempotent).
// Call before reading/limiting per-account rate limits. Cheap because it's
// just an indexed COUNT over (account_id, sent_at).
export function resetDailySendsIfNeeded(accountId) {
  refreshRollingSends(accountId);
}

// Check if account can send. Uses the rolling 24h window and the new formula.
//
// IMPORTANT: by product spec, the user can ALWAYS send emails — even past
// the daily cap and even at 0% battery. We only block on real failures
// (account disconnected, needs attention, no refresh token). The cap is an
// ADVISORY signal that the picker UI surfaces as a warning so the user
// knows they're pushing past the recommended rate, but we never
// gate canSend on it. We return `overCap` + `remaining` so the UI can
// highlight the over-cap state.
export function canAccountSend(accountId) {
  const account = getEmailAccount(accountId);
  if (!account) return { canSend: false, reason: 'Account not found' };

  if (account.status === 'disconnected') {
    return { canSend: false, reason: 'Account disconnected' };
  }

  if (account.status === 'needs_attention') {
    return { canSend: false, reason: 'Account needs attention' };
  }

  resetDailySendsIfNeeded(accountId);

  const currentAccount = getEmailAccount(accountId);
  const dailyCap = currentAccount.daily_cap || DAILY_CAP;
  const sentInWindow = currentAccount.sends_today || 0;
  const remaining = Math.max(0, dailyCap - sentInWindow);
  const overCap = sentInWindow > dailyCap;

  // Always allow — surface advisory fields for the UI.
  return {
    canSend: true,
    remaining,
    dailyCap,
    sent: sentInWindow,
    overCap,
    reason: overCap
      ? `Past suggested daily cap (${sentInWindow}/${dailyCap}) — sending anyway`
      : null,
  };
}

// ---- Connected Email Accounts ----

// Probe a single account's refresh token: decrypt it and try to mint a
// fresh access_token. We DO NOT hit any Gmail API endpoint — just Google's
// OAuth token endpoint — so this is cheap and safe to call on every step
// transition. Returns { ok: true } on success, { ok: false, error } on any
// failure (revoked, expired, encryption key wrong, network, etc).
export async function probeEmailAccountToken(accountId) {
  const acc = getEmailAccount(accountId);
  if (!acc) return { ok: false, error: 'Account not found' };
  if (!acc.encrypted_refresh_token) return { ok: false, error: 'No refresh token stored' };

  let refreshToken;
  try {
    refreshToken = decryptToken(acc.encrypted_refresh_token);
  } catch (err) {
    // Decryption failure means the encryption key changed (rotate-key) or
    // the row was tampered with. Flag it so the user knows to reconnect.
    updateEmailAccountStatus(accountId, 'needs_attention');
    return { ok: false, error: 'Refresh token could not be decrypted — please reconnect.' };
  }

  try {
    const { refreshGmailAccessToken } = await import('./gmail.js');
    await refreshGmailAccessToken(refreshToken);
    // Probe succeeded — flip back to healthy if it was previously flagged.
    if (acc.status === 'needs_attention') updateEmailAccountStatus(accountId, 'healthy');
    return { ok: true };
  } catch (err) {
    const code = err.code || (String(err.message || '').includes('400') ? 'TOKEN_REVOKED' : 'REFRESH_FAILED');
    if (code === 'TOKEN_REVOKED') updateEmailAccountStatus(accountId, 'needs_attention');
    return { ok: false, error: err.message || 'Token refresh failed', code };
  }
}

// Probe every connected account for the current owner. Lightweight —
// only hits Google's OAuth endpoint once per account, never Gmail itself.
export async function probeAllEmailAccountTokens(userId) {
  const accounts = listEmailAccounts(userId);
  const results = await Promise.all(accounts.map(async (acc) => {
    const probe = acc.provider === 'gmail'
      ? await probeEmailAccountToken(acc.id)
      : { ok: true }; // non-gmail providers aren't wired yet
    return {
      id: acc.id,
      email: acc.email,
      provider: acc.provider,
      status: acc.status,
      ...probe,
    };
  }));
  return { ok: true, results };
}

export function createEmailAccount({
  userId,
  provider,
  email,
  displayName,
  encryptedRefreshToken,
  dailyCap = DAILY_CAP,
}) {
  const now = Math.floor(Date.now() / 1000);

  // Upsert by (user_id, provider, email). A user re-connecting the same
  // Gmail address should rotate the refresh_token in place rather than
  // create a duplicate row. The unique index in db.js guarantees there's
  // at most one matching row.
  const existing = db.prepare(
    'SELECT id FROM email_accounts WHERE user_id = ? AND provider = ? AND email = ?'
  ).get(userId, provider, email);

  if (existing) {
    db.prepare(`
      UPDATE email_accounts SET
        encrypted_refresh_token = ?,
        display_name            = ?,
        daily_cap               = ?,
        status                  = 'healthy',
        last_reset_at           = ?,
        bounce_rate_7d          = 0
      WHERE id = ?
    `).run(encryptedRefreshToken, displayName, dailyCap, now, existing.id);
    return getEmailAccount(existing.id);
  }

  const id = 'ea_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

  db.prepare(`
    INSERT INTO email_accounts (
      id, user_id, provider, email, display_name, encrypted_refresh_token,
      daily_cap, connected_at, status, warmup_stage, sends_today, sends_this_week,
      last_reset_at, bounce_rate_7d
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'healthy', 'steady', 0, 0, ?, 0)
  `).run(id, userId, provider, email, displayName, encryptedRefreshToken, dailyCap, now, now);

  return getEmailAccount(id);
}

export function getEmailAccount(id) {
  return db.prepare('SELECT * FROM email_accounts WHERE id = ?').get(id);
}

export function getEmailAccountByEmail(email) {
  return db.prepare('SELECT * FROM email_accounts WHERE email = ?').get(email);
}

export function listEmailAccounts(userId) {
  return db.prepare(
    'SELECT * FROM email_accounts WHERE user_id = ? ORDER BY connected_at DESC'
  ).all(userId);
}

export function updateEmailAccountStatus(id, status) {
  db.prepare('UPDATE email_accounts SET status = ? WHERE id = ?').run(status, id);
}

export function updateEmailAccountTokenStatus(id, tokenStatus) {
  // Token status is derived from refresh attempts, not stored
  // This is for client-side display purposes
  if (tokenStatus === 'needs_reconnect' || tokenStatus === 'revoked') {
    db.prepare('UPDATE email_accounts SET status = ? WHERE id = ?').run('needs_attention', id);
  }
}

export function updateAccountBounceRate(accountId) {
  // Calculate 7-day bounce rate
  const weekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
  
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_sends,
      SUM(CASE WHEN bounce_status = 'hard' THEN 1 ELSE 0 END) as hard_bounces,
      SUM(CASE WHEN bounce_status = 'soft' THEN 1 ELSE 0 END) as soft_bounces
    FROM email_logs 
    WHERE account_id = ? AND sent_at > ?
  `).get(accountId, weekAgo);
  
  if (stats && stats.total_sends > 0) {
    const bounceRate = ((stats.hard_bounces + stats.soft_bounces) / stats.total_sends) * 100;
    db.prepare('UPDATE email_accounts SET bounce_rate_7d = ? WHERE id = ?').run(bounceRate, accountId);
    
    // Update status based on bounce rate
    if (bounceRate > 10) {
      db.prepare('UPDATE email_accounts SET status = ? WHERE id = ?').run('needs_attention', accountId);
    } else if (bounceRate > 5) {
      db.prepare('UPDATE email_accounts SET status = ? WHERE id = ?').run('healthy', accountId);
    }
  }
}

export function updateAccountLastSuccessfulSend(accountId) {
  db.prepare(
    'UPDATE email_accounts SET last_successful_send = ? WHERE id = ?'
  ).run(Math.floor(Date.now() / 1000), accountId);
}

export function deleteEmailAccount(id) {
  db.prepare('DELETE FROM email_accounts WHERE id = ?').run(id);
}

export function updateAccountRefreshToken(id, encryptedToken) {
  db.prepare(
    'UPDATE email_accounts SET encrypted_refresh_token = ? WHERE id = ?'
  ).run(encryptedToken, id);
}

// Get account health metrics. Uses the new rolling-24h health formula and the
// fixed daily cap of 80. The "sendsToday" field reflects the rolling 24h
// window — NOT a calendar day — so a campaign that finished at 11pm will not
// lock the account out the next morning until those sends actually age out.
export function getAccountHealth(accountId) {
  const account = getEmailAccount(accountId);
  if (!account) return null;
  
  // Recompute sends_today from the rolling-window history. Cheap.
  refreshRollingSends(accountId);
  const refreshed = getEmailAccount(accountId) || account;
  
  const dailyCap = refreshed.daily_cap || DAILY_CAP;
  const batteryCap = refreshed.battery_capacity || BATTERY_DEFAULT_CAPACITY;
  const sent = refreshed.sends_today || 0;
  const healthPercent = computeHealthPercent(sent, dailyCap);
  const healthLabel = getHealthLabel(healthPercent);
  // Battery is a SEPARATE gauge from the Gmail-health formula above. The
  // user wanted "300 emails = 0% battery" which is a pure linear drop based
  // on rolling 24h sends. They co-exist so the picker can show both: a
  // battery bar (how much runway) AND a health label (Gmail spam risk).
  const batteryPercent = computeBatteryPercent(sent, batteryCap);
  const batteryLabel = getBatteryLabel(batteryPercent);

  let status = refreshed.status;
  let recommendation = '';

  if (healthPercent <= 0) {
    status = 'needs_attention';
    recommendation = 'Health ruined — use a different email or risk this Gmail account getting banned by Google.';
  } else if (healthPercent <= 10) {
    recommendation = `Critical: ~${healthPercent}% remaining. Stop sending today or risk Gmail throttling this account.`;
  } else if (healthPercent <= 40) {
    recommendation = `Warning: ~${healthPercent}% health remaining. Consider slowing down or rotating to another connected account.`;
  } else if (refreshed.bounce_rate_7d > 10) {
    status = 'needs_attention';
    recommendation = `High bounce rate (${refreshed.bounce_rate_7d.toFixed(1)}%). Review your list quality.`;
  } else if (refreshed.bounce_rate_7d > 5) {
    recommendation = `Moderate bounce rate (${refreshed.bounce_rate_7d.toFixed(1)}%). Consider cleaning your list.`;
  } else {
    recommendation = `Account is healthy. ${dailyCap - sent} sends remaining in the next 24 hours.`;
  }

  return {
    accountId: refreshed.id,
    status,
    paused: refreshed.paused ? 1 : 0,
    daysConnected: Math.floor((Date.now() - refreshed.connected_at) / (1000 * 60 * 60 * 24)),
    sendsToday: sent,
    dailyCap,
    remainingToday: Math.max(0, dailyCap - sent),
    batteryCapacity: batteryCap,
    batteryPercent,
    batteryLabel,
    healthPercent,
    healthLabel, // 'healthy' | 'warning' | 'critical' | 'health_ruined'
    bounceRate7d: refreshed.bounce_rate_7d,
    lastSuccessfulSend: refreshed.last_successful_send,
    recommendation,
  };
}

// Load balancing: distribute leads across accounts based on remaining capacity.
// By product spec, the user can ALWAYS send even past the cap — so we prefer
// an account with positive remaining, but if every account is at/over cap
// we fall back to the first account (still sends OK) instead of returning
// null and stalling the pipeline.
export function getNextAvailableAccount(accountIds) {
  const accounts = accountIds.map(id => {
    const acc = getEmailAccount(id);
    if (!acc) return null;
    const { canSend, remaining } = canAccountSend(id);
    return { id, remaining, canSend, account: acc };
  }).filter(Boolean);

  if (accounts.length === 0) return null;

  accounts.sort((a, b) => b.remaining - a.remaining);

  const best = accounts.find(a => a.remaining > 0);
  if (best) return best.id;
  // Everyone is over cap — still usable. Pick the LEAST over.
  return accounts[0].id;
}
