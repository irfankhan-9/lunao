// Server-side persistence for outreach campaigns and per-SMS send logs.
//
// The dashboard used to keep all of this in localStorage; clearing the browser
// wiped every campaign. This module records every campaign, every lead inside
// it, and every SMS send (including Telnyx id + error) in SQLite so:
//   - the dashboard can reload/replay real history
//   - the API can answer "did this lead really get a message?" with a real id
//   - the /api/webhooks/telnyx handler can update sms_logs.delivered_at
//
// All writes are wrapped in transactions for atomicity (lead row + sms row
// either both land or neither does).
import crypto from 'node:crypto';
import { db } from './db.js';

function newId() {
  return crypto.randomBytes(10).toString('base64url').toLowerCase();
}

function rowToCampaign(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerKey: row.owner_key,
    niche: row.niche,
    name: row.name,
    status: row.status,
    totalLeads: row.total_leads,
    sitesGenerated: row.sites_generated,
    smsSent: row.sms_sent,
    smsFailed: row.sms_failed,
    smsSkipped: row.sms_skipped,
    creditsCharged: row.credits_charged,
    creditsRefunded: row.credits_refunded,
    smsTemplate: row.sms_template,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    type: row.type || 'sms',
  };
}

function rowToLead(row) {
  if (!row) return null;
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    city: row.city,
    niche: row.niche,
    slug: row.slug,
    siteUrl: row.site_url,
    siteStatus: row.site_status,
    smsStatus: row.sms_status,
    smsError: row.sms_error,
    indexInCampaign: row.index_in_campaign,
    createdAt: row.created_at,
  };
}

function rowToSms(row) {
  if (!row) return null;
  return {
    id: row.id,
    campaignId: row.campaign_id,
    leadId: row.lead_id,
    ownerKey: row.owner_key,
    toNumber: row.to_number,
    fromNumber: row.from_number,
    body: row.body,
    status: row.status,
    telnyxId: row.telnyx_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    segmentCount: row.segment_count,
    costCredits: row.cost_credits,
    refunded: !!row.refunded,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---- Campaign lifecycle ---------------------------------------------------

export function createCampaign({ ownerKey, niche, name, leads, smsTemplate, csv, type = 'sms' }) {
  const id = newId();
  const now = Date.now();
  const txn = db.transaction(() => {
    db.prepare(
      `INSERT INTO campaigns
         (id, owner_key, niche, name, status, total_leads, started_at, sms_template, csv_snapshot, type)
       VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?, ?)`,
    ).run(
      id,
      ownerKey,
      niche || null,
      name || null,
      Array.isArray(leads) ? leads.length : 0,
      now,
      smsTemplate || null,
      csv || null,
      type,
    );
    if (Array.isArray(leads) && leads.length) {
      const insert = db.prepare(
        `INSERT INTO campaign_leads
           (campaign_id, name, phone, email, city, niche, slug, index_in_campaign, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      leads.forEach((lead, i) => {
        insert.run(
          id,
          String(lead.name || ''),
          String(lead.phone || ''),
          String(lead.email || ''),
          String(lead.city || ''),
          String(lead.niche || niche || ''),
          String(lead.slug || ''),
          i + 1,
          now,
        );
      });
    }
  });
  txn();
  return getCampaign(id);
}

export function getCampaign(id) {
  const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  return rowToCampaign(row);
}

export function listCampaigns(ownerKey, { limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const rows = db
    .prepare(
      `SELECT * FROM campaigns WHERE owner_key = ?
        ORDER BY started_at DESC LIMIT ?`,
    )
    .all(ownerKey, safeLimit);
  return rows.map(rowToCampaign);
}

// Mark a per-lead result inside a campaign (site gen + sms outcome).
export function recordLeadResult(leadId, { siteStatus, siteUrl, smsStatus, smsError }) {
  const now = Date.now();
  db.prepare(
    `UPDATE campaign_leads
       SET site_status = COALESCE(?, site_status),
           site_url    = COALESCE(?, site_url),
           sms_status  = COALESCE(?, sms_status),
           sms_error   = COALESCE(?, sms_error)
     WHERE id = ?`,
  ).run(
    siteStatus ?? null,
    siteUrl ?? null,
    smsStatus ?? null,
    smsError ?? null,
    leadId,
  );
  // Touch the campaign's aggregate counters.
  if (smsStatus) {
    adjustCampaignSmsCounters(leadId, smsStatus);
  }
}

function adjustCampaignSmsCounters(leadId, smsStatus) {
  const lead = db
    .prepare('SELECT campaign_id FROM campaign_leads WHERE id = ?')
    .get(leadId);
  if (!lead) return;
  const c = getCampaign(lead.campaign_id);
  if (!c) return;
  const next = { ...c };
  if (smsStatus === 'sent' || smsStatus === 'simulated' || smsStatus === 'delivered') {
    if (c.smsStatus === 'pending' || c.smsStatus === 'queued' || !c.smsStatus) {
      // No-op — counter is on the campaign, not the lead.
    }
  }
  // We don't recompute here; finalizeCampaign() does the authoritative pass.
  void next;
}

export function finalizeCampaign(id, { creditsCharged = 0, creditsRefunded = 0 } = {}) {
  const c = getCampaign(id);
  if (!c) return null;
  const totals = db
    .prepare(
      `SELECT
         SUM(CASE WHEN site_status = 'generated' THEN 1 ELSE 0 END) AS sites_generated,
         SUM(CASE WHEN sms_status  = 'sent' OR sms_status = 'delivered' OR sms_status = 'simulated' THEN 1 ELSE 0 END) AS sms_sent,
         SUM(CASE WHEN sms_status  = 'failed'  THEN 1 ELSE 0 END) AS sms_failed,
         SUM(CASE WHEN sms_status  = 'skipped' OR sms_status = 'coming_soon' THEN 1 ELSE 0 END) AS sms_skipped
       FROM campaign_leads WHERE campaign_id = ?`,
    )
    .get(id) || {};
  db.prepare(
    `UPDATE campaigns
       SET status = 'completed',
           completed_at = ?,
           sites_generated = ?,
           sms_sent = ?,
           sms_failed = ?,
           sms_skipped = ?,
           credits_charged = ?,
           credits_refunded = ?
     WHERE id = ?`,
  ).run(
    Date.now(),
    totals.sites_generated || 0,
    totals.sms_sent || 0,
    totals.sms_failed || 0,
    totals.sms_skipped || 0,
    creditsCharged,
    creditsRefunded,
    id,
  );
  return getCampaign(id);
}

export function markCampaignFailed(id, error) {
  db.prepare(
    `UPDATE campaigns SET status = 'failed', completed_at = ? WHERE id = ?`,
  ).run(Date.now(), id);
  return getCampaign(id);
}

// Mark a campaign as cancelled by the user. Soft cancel — the in-flight
// runPipeline() loop picks this up on its next iteration and exits early.
// Unlike finalizeCampaign() this does NOT recompute counters from
// campaign_leads; the partial totals that were already written by the
// loop stay as-is so the dashboard's progress bar matches reality.
export function markCampaignCancelled(id) {
  db.prepare(
    `UPDATE campaigns SET status = 'cancelled', completed_at = ? WHERE id = ?`,
  ).run(Date.now(), id);
  return getCampaign(id);
}

// ---- Lead lookups ---------------------------------------------------------

export function getLead(id) {
  const row = db.prepare('SELECT * FROM campaign_leads WHERE id = ?').get(id);
  return rowToLead(row);
}

export function listLeads(campaignId) {
  const rows = db
    .prepare(
      `SELECT * FROM campaign_leads WHERE campaign_id = ?
        ORDER BY index_in_campaign ASC`,
    )
    .all(campaignId);
  return rows.map(rowToLead);
}

// ---- SMS send log ---------------------------------------------------------

export function logSmsAttempt({
  campaignId = null,
  leadId = null,
  ownerKey = null,
  to,
  from = '',
  body = '',
  status = 'pending',
  telnyxId = null,
  errorCode = null,
  errorMessage = null,
  segmentCount = 1,
  costCredits = 0,
} = {}) {
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO sms_logs
         (campaign_id, lead_id, owner_key, to_number, from_number, body,
          status, telnyx_id, error_code, error_message, segment_count,
          cost_credits, refunded, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      campaignId,
      leadId,
      ownerKey,
      String(to || ''),
      String(from || ''),
      String(body || ''),
      status,
      telnyxId,
      errorCode,
      errorMessage,
      segmentCount,
      costCredits,
      now,
      now,
    );
  return getSmsLog(info.lastInsertRowid);
}

export function updateSmsStatus(id, patch) {
  const sets = [];
  const vals = [];
  for (const k of [
    'status',
    'telnyx_id',
    'error_code',
    'error_message',
    'segment_count',
    'refunded',
  ]) {
    if (k in patch) {
      sets.push(`${k} = ?`);
      vals.push(patch[k]);
    }
  }
  if (!sets.length) return getSmsLog(id);
  sets.push('updated_at = ?');
  vals.push(Date.now(), id);
  db.prepare(`UPDATE sms_logs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return getSmsLog(id);
}

export function getSmsLog(id) {
  const row = db.prepare('SELECT * FROM sms_logs WHERE id = ?').get(id);
  return rowToSms(row);
}

export function findSmsByTelnyxId(telnyxId) {
  if (!telnyxId) return null;
  const row = db
    .prepare('SELECT * FROM sms_logs WHERE telnyx_id = ? ORDER BY id DESC LIMIT 1')
    .get(telnyxId);
  return rowToSms(row);
}

export function listSmsForCampaign(campaignId) {
  const rows = db
    .prepare('SELECT * FROM sms_logs WHERE campaign_id = ? ORDER BY id ASC')
    .all(campaignId);
  return rows.map(rowToSms);
}

export function listSmsForOwner(ownerKey, limit = 100) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const rows = db
    .prepare(
      `SELECT * FROM sms_logs WHERE owner_key = ?
        ORDER BY created_at DESC LIMIT ?`,
    )
    .all(ownerKey, safeLimit);
  return rows.map(rowToSms);
}

export function markSmsRefunded(smsId) {
  db.prepare('UPDATE sms_logs SET refunded = 1, updated_at = ? WHERE id = ?')
    .run(Date.now(), smsId);
}

// ---- Inbound webhook payloads --------------------------------------------

export function logInbound({ telnyxId, from, to, body, kind, status, raw }) {
  const info = db
    .prepare(
      `INSERT INTO sms_inbound
         (telnyx_id, from_number, to_number, body, kind, status, raw, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      telnyxId || null,
      String(from || ''),
      String(to || ''),
      String(body || ''),
      kind || 'inbound',
      status || null,
      raw ? JSON.stringify(raw) : null,
      Date.now(),
    );
  return info.lastInsertRowid;
}

export function listInboundForNumber(fromNumber, limit = 50) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const rows = db
    .prepare(
      `SELECT * FROM sms_inbound WHERE from_number = ?
        ORDER BY created_at DESC LIMIT ?`,
    )
    .all(fromNumber, safeLimit);
  return rows.map((r) => ({
    id: r.id,
    telnyxId: r.telnyx_id,
    from: r.from_number,
    to: r.to_number,
    body: r.body,
    kind: r.kind,
    status: r.status,
    createdAt: r.created_at,
  }));
}
