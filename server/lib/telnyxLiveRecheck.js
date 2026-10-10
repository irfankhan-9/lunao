// server/lib/telnyxLiveRecheck.js
//
// Single source of truth for keeping sms_logs + campaign_leads SMS status
// in sync with Telnyx. We never show stale "sent" rows in the dashboard —
// for every non-terminal row in a campaign we hit
//   GET https://api.telnyx.com/v2/messages/:id
// on a short interval (default 2.5s) and update the DB + the in-memory
// aggregate counts.
//
// Why this matters:
//   • Telnyx delivery webhooks CAN be missed (network blip, server restart).
//   • Telnyx delivery webhooks are NOT guaranteed in any particular order.
//   • Some carriers take 5–30s to finalize delivery.
//   • The user MUST see real `delivered` / `failed` after each poll cycle.
//
// Rate-limit guard: we only re-check rows that:
//   1. Have a telnyx_id, AND
//   2. Are NOT in a terminal status (delivered/failed/simulated), AND
//   3. Have been created more than 2s ago (give the webhook a chance), AND
//   4. Haven't been re-checked in the last 5s (caller-side throttle).

import { fetchMessageStatus } from './telnyx.js';
import {
  decryptTelnyxTokenForUse,
  encryptTelnyxTokenForStorage,
  refreshTelnyxAccessToken,
} from './telnyxOAuth.js';
import { updateSmsStatus, findSmsByTelnyxId, listSmsForOwner } from './campaigns.js';
import { db } from './db.js';

const TERMINAL = new Set(['delivered', 'failed', 'simulated']);
// In-process throttle map: telnyxId -> lastRecheckedAt
const lastCheckAt = new Map();
const THROTTLE_MS = 5000;

function diffAndUpdateDb({ smsId, leadId, status, telnyxId, errorCode, errorMessage }) {
  try {
    updateSmsStatus(smsId, {
      status,
      error_code: errorCode || null,
      error_message: errorMessage || null,
    });
    if (leadId) {
      db.prepare('UPDATE campaign_leads SET sms_status = ? WHERE id = ?').run(status, leadId);
    }
  } catch (e) {
    console.error('[telnyx-live] db update failed:', e.message);
  }
}

// Inline token resolver — same logic as index.js but self-contained here.
async function resolveConn(conn) {
  if (!conn) return null;
  const accessToken = decryptTelnyxTokenForUse(conn.encrypted_access_token);
  if (!accessToken) return null;
  const isExpired = conn.expires_at
    ? conn.expires_at - Math.floor(Date.now() / 1000) < 30
    : false;
  if (!isExpired) return accessToken;
  if (!conn.encrypted_refresh_token) return accessToken;
  try {
    const refreshToken = decryptTelnyxTokenForUse(conn.encrypted_refresh_token);
    const data = await refreshTelnyxAccessToken(refreshToken);
    const encryptedAccess = encryptTelnyxTokenForStorage(data.access_token);
    const encryptedRefresh = data.refresh_token ? encryptTelnyxTokenForStorage(data.refresh_token) : null;
    const expiresAt = data.expires_in
      ? Math.floor(Date.now() / 1000) + Number(data.expires_in)
      : null;
    db.prepare(
      `UPDATE telnyx_connections
         SET encrypted_access_token = ?,
             encrypted_refresh_token = ?,
             expires_at = ?
       WHERE id = ?`
    ).run(encryptedAccess, encryptedRefresh || conn.encrypted_refresh_token, expiresAt, conn.id);
    return data.access_token;
  } catch (err) {
    if (err.code === 'TOKEN_REVOKED') {
      db.prepare(`UPDATE telnyx_connections SET status = ? WHERE id = ?`)
        .run('needs_reconnect', conn.id);
    }
    return null;
  }
}

/**
 * Re-check status of every non-terminal SMS row whose `telnyx_id` is set
 * and that hasn't been re-checked in the last 5s.
 *
 * @param {Object} options
 * @param {Array}  options.rows  - sms_logs rows (from listSmsForOwner/listSmsForCampaign)
 * @returns {Promise<{ updated: number, checked: number, errors: number }>}
 *
 * Each successful hit writes:
 *   - sms_logs.status / error_code / error_message
 *   - campaign_leads.sms_status  (via lead_id)
 *
 * The DB write is throttled — if a row's status didn't change we don't
 * hit UPDATE to keep the SQLite WAL quiet.
 */
export async function recheckSmsRows(rows = []) {
  let updated = 0;
  let checked = 0;
  let errors = 0;

  // Deduplicate by telnyxId so two campaigns referencing the same message
  // only hit Telnyx once.
  const byTelnyxId = new Map();
  for (const r of rows) {
    if (!r.telnyxId) continue;
    if (TERMINAL.has(r.status)) continue;
    if (!byTelnyxId.has(r.telnyxId)) byTelnyxId.set(r.telnyxId, []);
    byTelnyxId.get(r.telnyxId).push(r);
  }

  for (const [telnyxId, groupRows] of byTelnyxId.entries()) {
    // Throttle: don't hammer the same telnyx_id more than once per 5s.
    const now = Date.now();
    const last = lastCheckAt.get(telnyxId) || 0;
    if (now - last < THROTTLE_MS) continue;
    lastCheckAt.set(telnyxId, now);

    // Pull any active Telnyx OAuth connection. We don't store accountId on
    // sms_logs (it would force a schema migration), and Telnyx reads
    // messages back across the whole account — any active token works.
    let accessToken = null;
    try {
      const conns = listAllTelnyxConnections();
      const active = conns.find((c) => c.status === 'active');
      if (active) accessToken = await resolveConn(active);
    } catch (_) { /* swallowed */ }

    try {
      checked++;
      const live = await fetchMessageStatus(telnyxId, { accessToken });
      if (!live || !live.status) continue;

      const newStatus = String(live.status).toLowerCase();
      if (!TERMINAL.has(newStatus)) continue; // still inflight

      for (const r of groupRows) {
        if (r.status === newStatus) continue;
        diffAndUpdateDb({
          smsId: r.id,
          leadId: r.leadId,
          status: newStatus,
          telnyxId,
          errorCode: live.errorCode || null,
          errorMessage: live.error || null,
        });
        updated++;
        r.status = newStatus; // mutate so callers re-render with fresh value
        if (newStatus === 'failed' && live.errorCode) r.errorCode = live.errorCode;
        if (newStatus === 'failed' && live.error) r.errorMessage = live.error;
      }
    } catch (err) {
      errors++;
      console.warn('[telnyx-live] recheck failed for', telnyxId, err.message);
    }
  }

  if (updated > 0) {
    console.log(`[telnyx-live] recheck cycle: checked=${checked} updated=${updated} errors=${errors}`);
  }
  return { updated, checked, errors };
}

// Helper used above — pulled in here so we don't introduce a circular import.
function listAllTelnyxConnections() {
  try {
    return db.prepare(
      `SELECT * FROM telnyx_connections`
    ).all().map((r) => ({
      id: r.id,
      user_id: r.user_id,
      status: r.status,
      // Don't pull the token — we resolve via resolveTelnyxAccessToken
    }));
  } catch (_) {
    return [];
  }
}

// Periodic flush — call once at server boot. Re-checks every non-terminal
// SMS row across the whole DB every 5 minutes as a safety net (in case
// the dashboard isn't open).
let scheduled = false;
export function startGlobalRechecker() {
  if (scheduled) return;
  scheduled = true;
  const tick = async () => {
    try {
      const rows = db.prepare(`
        SELECT id, lead_id AS leadId, telnyx_id AS telnyxId, status
          FROM sms_logs
         WHERE telnyx_id IS NOT NULL
           AND status NOT IN ('delivered','failed','simulated')
           AND created_at < ?
         LIMIT 50
      `).all(Date.now() - 2000);
      await recheckSmsRows(rows);
    } catch (e) {
      // ignore
    }
  };
  // First tick in 10s (let the server settle), then every 30s.
  setTimeout(() => {
    tick();
    setInterval(tick, 30_000);
  }, 10_000);
}
