// CRUD for telnyx_connections — the rows that hold a user's Telnyx OAuth
// tokens. Modeled after createEmailAccount / listEmailAccounts in
// emailCampaigns.js so the rest of the codebase can stay tiny.
import { db } from './db.js';

export function createTelnyxConnection({
  userId,
  accountEmail,
  accountLabel,
  encryptedAccessToken,
  encryptedRefreshToken,
  expiresAt,
  totalNumbers,
}) {
  const now = Math.floor(Date.now() / 1000);

  // Upsert by (user_id, account_email). Telnyx doesn't expose an email in
  // its OAuth response today, so we fall back to a synthetic identifier
  // ("telnyx:{clientId}") when none is provided — the user can re-connect
  // and we'll rotate the tokens in place rather than creating duplicates.
  const syntheticId = `telnyx:${userId}`;
  const finalEmail = accountEmail || syntheticId;

  const existing = db.prepare(
    'SELECT id FROM telnyx_connections WHERE user_id = ? AND account_email = ?'
  ).get(userId, finalEmail);

  if (existing) {
    db.prepare(`
      UPDATE telnyx_connections SET
        encrypted_access_token  = ?,
        encrypted_refresh_token = ?,
        expires_at              = ?,
        total_numbers           = ?,
        account_label           = ?,
        status                  = 'active'
      WHERE id = ?
    `).run(
      encryptedAccessToken,
      encryptedRefreshToken || null,
      expiresAt || null,
      typeof totalNumbers === 'number' ? totalNumbers : 0,
      accountLabel || finalEmail,
      existing.id
    );
    return getTelnyxConnection(existing.id);
  }

  const id = 'tn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

  db.prepare(`
    INSERT INTO telnyx_connections (
      id, user_id, account_email, account_label,
      encrypted_access_token, encrypted_refresh_token, expires_at,
      total_numbers, status, connected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `).run(
    id,
    userId,
    finalEmail,
    accountLabel || finalEmail,
    encryptedAccessToken,
    encryptedRefreshToken || null,
    expiresAt || null,
    typeof totalNumbers === 'number' ? totalNumbers : 0,
    now
  );

  return getTelnyxConnection(id);
}

export function getTelnyxConnection(id) {
  return db.prepare('SELECT * FROM telnyx_connections WHERE id = ?').get(id);
}

export function getTelnyxConnectionByAccountEmail(userId, accountEmail) {
  return db.prepare(
    'SELECT * FROM telnyx_connections WHERE user_id = ? AND account_email = ?'
  ).get(userId, accountEmail);
}

export function listTelnyxConnections(userId) {
  return db.prepare(
    'SELECT * FROM telnyx_connections WHERE user_id = ? ORDER BY connected_at DESC'
  ).all(userId);
}

export function updateTelnyxConnectionTokens(id, {
  encryptedAccessToken,
  encryptedRefreshToken,
  expiresAt,
}) {
  db.prepare(`
    UPDATE telnyx_connections SET
      encrypted_access_token  = COALESCE(?, encrypted_access_token),
      encrypted_refresh_token = COALESCE(?, encrypted_refresh_token),
      expires_at              = COALESCE(?, expires_at),
      status                  = 'active'
    WHERE id = ?
  `).run(
    encryptedAccessToken || null,
    encryptedRefreshToken || null,
    expiresAt || null,
    id
  );
}

export function updateTelnyxConnectionStatus(id, status) {
  db.prepare('UPDATE telnyx_connections SET status = ? WHERE id = ?').run(status, id);
}

export function updateTelnyxConnectionNumbers(id, totalNumbers) {
  db.prepare('UPDATE telnyx_connections SET total_numbers = ? WHERE id = ?').run(totalNumbers, id);
}

export function deleteTelnyxConnection(id) {
  db.prepare('DELETE FROM telnyx_connections WHERE id = ?').run(id);
}