// server/lib/telnyxLiveRecheck.js
// Continuously rechecks Telnyx message delivery status every 3 seconds for active plans.
// Updates sms_logs and campaign_leads with exact delivery or failure reasons.

import { db } from './db.js';
import { fetchMessageStatus } from './telnyx.js';
import { updateSmsStatus } from './campaigns.js';

// Cache to prevent duplicate simultaneous API calls for the same message ID within 2 seconds
const inFlightChecks = new Set();
const lastCheckTimes = new Map();

/**
 * Recheck an array of SMS log rows against the Telnyx API.
 * Updates the database immediately if the status changed.
 */
export async function recheckSmsRows(smsRows = []) {
  if (!Array.isArray(smsRows) || smsRows.length === 0) return [];

  const now = Date.now();
  const pendingRows = smsRows.filter((r) => {
    if (!r) return false;
    const s = String(r.status || '').toLowerCase();
    // Recheck non-terminal statuses
    const isNonTerminal = s === 'queued' || s === 'sending' || s === 'sent' || s === 'pending';
    const telnyxId = r.telnyx_id || r.telnyxId;
    return isNonTerminal && Boolean(telnyxId);
  });

  if (pendingRows.length === 0) return [];

  const updates = [];

  for (const row of pendingRows) {
    const telnyxId = row.telnyx_id || row.telnyxId;
    const smsId = row.id;

    // Rate-limit per ID: avoid querying Telnyx more than once per 2 seconds per message
    const lastTime = lastCheckTimes.get(telnyxId) || 0;
    if (inFlightChecks.has(telnyxId) || now - lastTime < 2000) {
      continue;
    }

    inFlightChecks.add(telnyxId);
    lastCheckTimes.set(telnyxId, now);

    try {
      const live = await fetchMessageStatus(telnyxId);
      if (!live || !live.status) continue;

      const newStatus = live.status.toLowerCase();
      const currentStatus = String(row.status || '').toLowerCase();

      if (newStatus !== currentStatus || newStatus === 'failed' || newStatus === 'delivered') {
        const errorCode = live.errorCode || (newStatus === 'failed' ? 'E_TELNYX_FAILED' : null);
        const errorMessage = live.errorMessage || (newStatus === 'failed' ? 'Carrier delivery rejected or failed' : null);

        console.log(`[telnyx-recheck-3s] SMS #${smsId} (${telnyxId}) transition: ${currentStatus} -> ${newStatus}${errorMessage ? ` [Failure Reason: ${errorMessage} (${errorCode})]` : ''}`);

        // Update sms_logs table
        updateSmsStatus(smsId, {
          status: newStatus,
          error_code: errorCode,
          error_message: errorMessage,
        });

        // Update campaign_leads table if lead_id exists
        const leadId = row.lead_id || row.leadId;
        if (leadId) {
          try {
            db.prepare('UPDATE campaign_leads SET sms_status = ?, sms_error = ? WHERE id = ?').run(
              newStatus,
              errorMessage || null,
              leadId,
            );
          } catch (e) {
            console.warn(`[telnyx-recheck] Failed to update campaign_leads #${leadId}:`, e.message);
          }
        }

        updates.push({
          id: smsId,
          telnyxId,
          previousStatus: currentStatus,
          status: newStatus,
          errorCode,
          errorMessage,
        });
      }
    } catch (err) {
      console.warn(`[telnyx-recheck] Error checking ${telnyxId}:`, err.message);
    } finally {
      inFlightChecks.delete(telnyxId);
    }
  }

  return updates;
}

/**
 * Continuous background rechecker that polls Telnyx every 3 seconds
 * for all queued / sent messages across all campaigns.
 */
let recheckerInterval = null;

export function startGlobalRechecker() {
  if (recheckerInterval) return;

  console.log('[telnyx-recheck] Starting global 3-second live SMS status polling worker...');

  const pollCycle = async () => {
    try {
      // Find up to 50 most recent non-terminal SMS rows
      const rows = db.prepare(`
        SELECT * FROM sms_logs 
        WHERE status IN ('queued', 'sending', 'sent')
          AND telnyx_id IS NOT NULL 
          AND telnyx_id != ''
        ORDER BY id DESC 
        LIMIT 50
      `).all();

      if (rows && rows.length > 0) {
        await recheckSmsRows(rows);
      }
    } catch (err) {
      console.warn('[telnyx-recheck] Worker tick warning:', err.message);
    }
  };

  // Run initial tick after 500ms
  setTimeout(pollCycle, 500);

  // Set recurring 3-second interval
  recheckerInterval = setInterval(pollCycle, 3000);
}

export function stopGlobalRechecker() {
  if (recheckerInterval) {
    clearInterval(recheckerInterval);
    recheckerInterval = null;
  }
}
