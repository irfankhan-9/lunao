// Persistence for the booking system + chatbot + credit economy + campaigns
// + SMS logs. Auto-detects the database engine:
//
//   1. If DATABASE_URL is set (Railway Postgres, Supabase, Neon, etc.),
//      uses the `pg` driver. We wrap the connection in a tiny adapter
//      that exposes the same `db.prepare(sql).run/get/all(...)` shape the
//      app is already coded against, so callers don't need to change.
//
//   2. Otherwise falls back to the local `better-sqlite3` file at
//      $DATA_DIR/lunao.db (default: $ROOT_DIR/server/.data/lunao.db).
//
// The schema is identical across both engines: identical column names +
// types. Auto-increment columns are INTEGER PRIMARY KEY AUTOINCREMENT
// (SQLite) and BIGSERIAL PRIMARY KEY (Postgres) — see `execSqliteSchema` /
// `execPgSchema` for the rewrites.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT_DIR } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;

const DATA_DIR = env.DATA_DIR || path.join(ROOT_DIR, 'server', '.data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const HAS_PG = Boolean(env.DATABASE_URL);

// Lazy-loaded drivers.
const sqliteDriver = (await import('better-sqlite3')).default;
let pgPool = null;
if (HAS_PG) {
  const { Pool } = await import('pg');
  pgPool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Schema DDL (one block, identical column names + types for both engines)
// ---------------------------------------------------------------------------
const SCHEMA_SQL = `
  -- No "users" table in v2 — authentication is a single hardcoded site gate
  -- password. All per-owner state lives in owner_key columns across the rest
  -- of the schema (sites, campaigns, sms_logs, sms_inbound, credit_accounts).

  CREATE TABLE IF NOT EXISTS bookings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    slug          TEXT    NOT NULL,
    business_name TEXT    NOT NULL DEFAULT '',
    customer_name TEXT    NOT NULL DEFAULT '',
    phone         TEXT    NOT NULL DEFAULT '',
    email         TEXT    NOT NULL DEFAULT '',
    service       TEXT    NOT NULL DEFAULT '',
    date          TEXT    NOT NULL DEFAULT '',
    time          TEXT    NOT NULL DEFAULT '',
    notes         TEXT    NOT NULL DEFAULT '',
    source        TEXT    NOT NULL DEFAULT 'form',
    status        TEXT    NOT NULL DEFAULT 'new',
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_bookings_slug ON bookings(slug);
  CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings(created_at DESC);

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id         TEXT    PRIMARY KEY,
    slug       TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT    NOT NULL,
    slug       TEXT    NOT NULL,
    role       TEXT    NOT NULL,
    content    TEXT    NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

  CREATE TABLE IF NOT EXISTS site_addons (
    slug            TEXT    PRIMARY KEY,
    booking_enabled INTEGER NOT NULL DEFAULT 0,
    chatbot_enabled INTEGER NOT NULL DEFAULT 0,
    updated_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invite_codes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    code           TEXT    UNIQUE NOT NULL,
    slug           TEXT    NOT NULL,
    label          TEXT,
    created_at     INTEGER NOT NULL,
    used_at        INTEGER,
    last_active_at INTEGER,
    revoked_at     INTEGER,
    redeemed_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_invite_codes_slug ON invite_codes(slug);
  CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);

  CREATE TABLE IF NOT EXISTS credit_accounts (
    owner_key         TEXT    PRIMARY KEY,
    plan              TEXT    NOT NULL DEFAULT 'Free Plan',
    balance           INTEGER NOT NULL DEFAULT 0,
    lifetime_used     INTEGER NOT NULL DEFAULT 0,
    lifetime_refunded INTEGER NOT NULL DEFAULT 0,
    updated_at        INTEGER NOT NULL,
    created_at        INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS credit_ledger (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_key     TEXT    NOT NULL,
    delta         INTEGER NOT NULL,
    reason        TEXT    NOT NULL,
    ref_type      TEXT,
    ref_id        TEXT,
    balance_after INTEGER NOT NULL,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_credit_ledger_owner ON credit_ledger(owner_key, created_at DESC);

  CREATE TABLE IF NOT EXISTS campaigns (
    id               TEXT    PRIMARY KEY,
    owner_key        TEXT    NOT NULL,
    niche            TEXT,
    name             TEXT,
    status           TEXT    NOT NULL DEFAULT 'running',
    type             TEXT    NOT NULL DEFAULT 'sms',
    total_leads      INTEGER NOT NULL DEFAULT 0,
    sites_generated  INTEGER NOT NULL DEFAULT 0,
    sms_sent         INTEGER NOT NULL DEFAULT 0,
    sms_failed       INTEGER NOT NULL DEFAULT 0,
    sms_skipped      INTEGER NOT NULL DEFAULT 0,
    credits_charged  INTEGER NOT NULL DEFAULT 0,
    credits_refunded INTEGER NOT NULL DEFAULT 0,
    sms_template     TEXT,
    csv_snapshot     TEXT,
    started_at       INTEGER NOT NULL,
    completed_at     INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_campaigns_owner ON campaigns(owner_key, started_at DESC);

  CREATE TABLE IF NOT EXISTS campaign_leads (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id       TEXT    NOT NULL,
    name              TEXT    NOT NULL DEFAULT '',
    phone             TEXT    NOT NULL DEFAULT '',
    email             TEXT    NOT NULL DEFAULT '',
    city              TEXT    NOT NULL DEFAULT '',
    niche             TEXT    NOT NULL DEFAULT '',
    slug              TEXT    NOT NULL DEFAULT '',
    site_url          TEXT,
    site_status       TEXT    NOT NULL DEFAULT 'pending',
    sms_status        TEXT    NOT NULL DEFAULT 'pending',
    sms_error         TEXT,
    index_in_campaign INTEGER NOT NULL DEFAULT 0,
    created_at        INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign ON campaign_leads(campaign_id, index_in_campaign);
  CREATE INDEX IF NOT EXISTS idx_campaign_leads_phone ON campaign_leads(phone);

  CREATE TABLE IF NOT EXISTS sms_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id   TEXT,
    lead_id       INTEGER,
    owner_key     TEXT,
    to_number     TEXT    NOT NULL DEFAULT '',
    from_number   TEXT    NOT NULL DEFAULT '',
    body          TEXT    NOT NULL DEFAULT '',
    status        TEXT    NOT NULL DEFAULT 'pending',
    telnyx_id     TEXT,
    error_code    TEXT,
    error_message TEXT,
    segment_count INTEGER NOT NULL DEFAULT 1,
    cost_credits  INTEGER NOT NULL DEFAULT 0,
    refunded      INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sms_logs_campaign ON sms_logs(campaign_id);
  CREATE INDEX IF NOT EXISTS idx_sms_logs_lead ON sms_logs(lead_id);
  CREATE INDEX IF NOT EXISTS idx_sms_logs_telnyx ON sms_logs(telnyx_id);
  CREATE INDEX IF NOT EXISTS idx_sms_logs_owner ON sms_logs(owner_key, created_at DESC);

  CREATE TABLE IF NOT EXISTS sms_inbound (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    telnyx_id   TEXT,
    from_number TEXT    NOT NULL DEFAULT '',
    to_number   TEXT    NOT NULL DEFAULT '',
    body        TEXT    NOT NULL DEFAULT '',
    kind        TEXT    NOT NULL DEFAULT 'inbound',
    status      TEXT,
    raw         TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sms_inbound_from ON sms_inbound(from_number, created_at DESC);

  CREATE TABLE IF NOT EXISTS template_categories (
    id         TEXT    PRIMARY KEY,
    owner_key  TEXT    NOT NULL,
    name       TEXT    NOT NULL,
    color      TEXT    NOT NULL DEFAULT '#2563EB',
    icon       TEXT    NOT NULL DEFAULT 'layout',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS custom_templates (
    id           TEXT    PRIMARY KEY,
    owner_key    TEXT    NOT NULL,
    category_id  TEXT,
    name         TEXT    NOT NULL,
    slug         TEXT    NOT NULL,
    niche        TEXT    NOT NULL DEFAULT '',
    raw_html     TEXT    NOT NULL,
    preview_html TEXT    NOT NULL,
    style_tags   TEXT    NOT NULL DEFAULT '',
    used_count   INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    FOREIGN KEY (category_id) REFERENCES template_categories(id)
  );

  CREATE TABLE IF NOT EXISTS site_history (
    id               TEXT    PRIMARY KEY,
    owner_key        TEXT    NOT NULL,
    parent_slug      TEXT    NOT NULL,
    title            TEXT    NOT NULL DEFAULT '',
    niche            TEXT    NOT NULL DEFAULT '',
    html             TEXT    NOT NULL,
    snapshot_label   TEXT    NOT NULL DEFAULT '',
    is_template      INTEGER NOT NULL DEFAULT 0,
    template_id      TEXT,
    template_name    TEXT,
    created_at       INTEGER NOT NULL,
    FOREIGN KEY (template_id) REFERENCES custom_templates(id)
  );

  -- Email Campaign Tables --

  -- Connected email accounts (OAuth refresh tokens stored encrypted)
  CREATE TABLE IF NOT EXISTS email_accounts (
    id                      TEXT    PRIMARY KEY,
    user_id                 TEXT    NOT NULL,
    provider                TEXT    NOT NULL,
    email                   TEXT    NOT NULL,
    display_name            TEXT    NOT NULL DEFAULT '',
    encrypted_refresh_token TEXT    NOT NULL,
    daily_cap               INTEGER NOT NULL DEFAULT 30,
    connected_at            INTEGER NOT NULL,
    status                  TEXT    NOT NULL DEFAULT 'healthy',
    warmup_stage            TEXT    NOT NULL DEFAULT 'stage_1',
    sends_today             INTEGER NOT NULL DEFAULT 0,
    sends_this_week        INTEGER NOT NULL DEFAULT 0,
    last_reset_at           INTEGER NOT NULL,
    bounce_rate_7d          REAL    NOT NULL DEFAULT 0,
    last_successful_send    INTEGER,
    -- v3: per-account Pause/Resume toggle (user-controlled). When 1, the
    -- picker still shows the account but a small warning card surfaces on
    -- launch. Sends still go through — pausing is advisory only, not a hard
    -- block, per the user's "let them use it" spec.
    paused                  INTEGER NOT NULL DEFAULT 0,
    -- v3: Battery capacity for the 0–100% "battery" health bar shown in the
    -- picker + dashboard. Default 300 = "300 sends = empty battery". Stored
    -- per account so future builds can scale it up/down per provider.
    battery_capacity        INTEGER NOT NULL DEFAULT 300
  );
  CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON email_accounts(user_id);
  CREATE INDEX IF NOT EXISTS idx_email_accounts_status ON email_accounts(status);
  -- One connected account per (user, provider, email). Re-connecting the
  -- same Gmail address now upserts the refresh_token instead of creating a
  -- duplicate row that confuses the picker UI.
  --
  -- First collapse any pre-existing duplicates (keep the most-recently
  -- connected row, drop the rest). email_logs.account_id references are
  -- left as-is — stale ids are harmless because the log rows are
  -- append-only history and the picker never joins against them.
  DELETE FROM email_accounts
    WHERE id NOT IN (
      SELECT MAX(id) FROM email_accounts GROUP BY user_id, provider, email
    );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_email_accounts_user_provider_email
    ON email_accounts(user_id, provider, email);

  -- Email campaigns
  CREATE TABLE IF NOT EXISTS email_campaigns (
    id               TEXT    PRIMARY KEY,
    user_id          TEXT    NOT NULL,
    niche            TEXT    NOT NULL DEFAULT '',
    template_id      TEXT    NOT NULL DEFAULT '',
    template_key     TEXT    NOT NULL DEFAULT '',
    lead_source      TEXT    NOT NULL DEFAULT 'csv',
    target_volume    INTEGER NOT NULL DEFAULT 0,
    city             TEXT    NOT NULL DEFAULT '',
    category         TEXT    NOT NULL DEFAULT '',
    status           TEXT    NOT NULL DEFAULT 'draft',
    email_subject    TEXT    NOT NULL DEFAULT '',
    email_body       TEXT    NOT NULL DEFAULT '',
    csv_snapshot     TEXT,
    created_at       INTEGER NOT NULL,
    scheduled_at     INTEGER,
    started_at       INTEGER,
    completed_at     INTEGER,
    credits_charged  INTEGER NOT NULL DEFAULT 0,
    credits_refunded INTEGER NOT NULL DEFAULT 0,
    leads_found      INTEGER NOT NULL DEFAULT 0,
    emails_found     INTEGER NOT NULL DEFAULT 0,
    sites_generated  INTEGER NOT NULL DEFAULT 0,
    emails_sent      INTEGER NOT NULL DEFAULT 0,
    emails_delivered INTEGER NOT NULL DEFAULT 0,
    emails_bounced   INTEGER NOT NULL DEFAULT 0,
    emails_failed    INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_email_campaigns_user ON email_campaigns(user_id);
  CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);

  -- Email leads within campaigns
  CREATE TABLE IF NOT EXISTS email_leads (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id         TEXT    NOT NULL,
    business_name       TEXT    NOT NULL DEFAULT '',
    phone               TEXT    NOT NULL DEFAULT '',
    city                TEXT    NOT NULL DEFAULT '',
    website             TEXT    NOT NULL DEFAULT '',
    email               TEXT    NOT NULL DEFAULT '',
    email_source        TEXT    NOT NULL DEFAULT 'csv',
    verification_status TEXT    NOT NULL DEFAULT 'pending',
    generated_site_url  TEXT,
    slug                TEXT    NOT NULL DEFAULT '',
    assigned_account_id TEXT,
    send_status         TEXT    NOT NULL DEFAULT 'pending',
    send_error          TEXT,
    sent_at             INTEGER,
    index_in_campaign   INTEGER NOT NULL DEFAULT 0,
    created_at          INTEGER NOT NULL,
    discovery_source    TEXT    NOT NULL DEFAULT 'csv'
  );
  CREATE INDEX IF NOT EXISTS idx_email_leads_campaign ON email_leads(campaign_id, index_in_campaign);
  CREATE INDEX IF NOT EXISTS idx_email_leads_email ON email_leads(email);

  -- Email send logs
  CREATE TABLE IF NOT EXISTS email_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id         INTEGER NOT NULL,
    campaign_id     TEXT    NOT NULL,
    account_id      TEXT    NOT NULL,
    sent_at         INTEGER NOT NULL,
    delivery_status TEXT    NOT NULL DEFAULT 'pending',
    bounce_status   TEXT,
    error_code      TEXT,
    error_message   TEXT,
    subject         TEXT    NOT NULL DEFAULT '',
    body_preview    TEXT    NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_email_logs_campaign ON email_logs(campaign_id);
  CREATE INDEX IF NOT EXISTS idx_email_logs_lead ON email_logs(lead_id);
  CREATE INDEX IF NOT EXISTS idx_email_logs_account ON email_logs(account_id);

  -- Suppression list (unsubscribed, bounced, complained)
  CREATE TABLE IF NOT EXISTS email_suppression (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT    NOT NULL,
    reason     TEXT    NOT NULL,
    source     TEXT    NOT NULL DEFAULT 'manual',
    created_at INTEGER NOT NULL,
    UNIQUE(email, reason)
  );
  CREATE INDEX IF NOT EXISTS idx_email_suppression_email ON email_suppression(email);

  -- Account send history for rate limiting (rolling 24-hour window)
  CREATE TABLE IF NOT EXISTS email_send_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id  TEXT    NOT NULL,
    sent_at     INTEGER NOT NULL,
    lead_id     INTEGER,
    campaign_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_email_send_history_account ON email_send_history(account_id, sent_at DESC);
`;

// ---------------------------------------------------------------------------
// pg adapter (same `prepare().run/get/all` shape as better-sqlite3)
// ---------------------------------------------------------------------------
function makePgAdapter(pool) {
  // Column names whose values we coerce from string to Number. pg returns
  // BIGINT as a string to preserve precision; our ids are small (<2^53) so
  // we can safely round-trip through Number.
  const NUMERIC_KEYS = new Set([
    'id', 'redeemed_count', 'segment_count', 'cost_credits', 'refunded',
    'booking_enabled', 'chatbot_enabled', 'total_leads', 'sites_generated',
    'sms_sent', 'sms_failed', 'sms_skipped', 'credits_charged',
    'credits_refunded', 'balance', 'lifetime_used', 'lifetime_refunded',
    'delta', 'balance_after', 'index_in_campaign', 'lead_id',
  ]);

  const normalise = (row) => {
    if (!row) return row;
    const out = {};
    for (const k of Object.keys(row)) {
      const v = row[k];
      if (typeof v === 'string' && /^\d+$/.test(v) && NUMERIC_KEYS.has(k)) {
        out[k] = Number(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  };

  return {
    prepare(sql) {
      return {
        run: async (...params) => {
          const flat = params.flat(Infinity).filter((p) => p !== undefined);
          const r = await pool.query(sql, flat);
          return {
            lastInsertRowid:
              r.rows[0] && r.rows[0].id != null ? Number(r.rows[0].id) : null,
            changes: r.rowCount,
          };
        },
        get: async (...params) => {
          const flat = params.flat(Infinity).filter((p) => p !== undefined);
          const r = await pool.query(sql, flat);
          return r.rows[0] ? normalise(r.rows[0]) : undefined;
        },
        all: async (...params) => {
          const flat = params.flat(Infinity).filter((p) => p !== undefined);
          const r = await pool.query(sql, flat);
          return r.rows.map(normalise);
        },
      };
    },
    exec: async (sqlBlock) => {
      // Translate SQLite DDL -> Postgres DDL.
      const pg = sqlBlock
        .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'BIGSERIAL PRIMARY KEY')
        .replace(/INTEGER NOT NULL/gi, 'BIGINT NOT NULL')
        .replace(/\bINTEGER\b/g, 'BIGINT');
      const stmts = pg.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
      for (const stmt of stmts) await pool.query(stmt);
    },
    pragma: () => {},
    close: () => pool.end(),
  };
}

// ---------------------------------------------------------------------------
// Boot the database
// ---------------------------------------------------------------------------
let _db;

// ---- SQLite migrations ----------------------------------------------------
// Older databases were created before some columns existed (e.g. `type` on
// `campaigns`). `CREATE TABLE IF NOT EXISTS` is a no-op for those rows, so
// we need explicit ALTER TABLE statements to bring legacy schemas up to
// date. Each migration is idempotent — it skips if the column already exists.
function columnExists(table, col) {
  const rows = _db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === col);
}

function migrateSqlite() {
  const migrations = [
    { table: 'campaigns', col: 'type', ddl: `ALTER TABLE campaigns ADD COLUMN type TEXT NOT NULL DEFAULT 'sms'` },
    // v3: Pause/Resume + battery capacity for connected email accounts.
    // Existing rows pick up the defaults (unpaused, battery = 300).
    { table: 'email_accounts', col: 'paused',           ddl: `ALTER TABLE email_accounts ADD COLUMN paused INTEGER NOT NULL DEFAULT 0` },
    { table: 'email_accounts', col: 'battery_capacity', ddl: `ALTER TABLE email_accounts ADD COLUMN battery_capacity INTEGER NOT NULL DEFAULT 300` },
    // v4: Dork pipeline — track which discovery method produced each lead
    // so the campaign detail modal can group by source. Existing rows
    // default to 'csv' (the only pre-dork source).
    { table: 'email_leads',   col: 'discovery_source', ddl: `ALTER TABLE email_leads ADD COLUMN discovery_source TEXT NOT NULL DEFAULT 'csv'` },
  ];
  for (const m of migrations) {
    if (!columnExists(m.table, m.col)) {
      try {
        _db.exec(m.ddl);
        console.log(`[db] migration: added column ${m.table}.${m.col}`);
      } catch (err) {
        console.error(`[db] migration failed (${m.table}.${m.col}): ${err.message}`);
      }
    }
  }
}

if (HAS_PG && pgPool) {
  _db = makePgAdapter(pgPool);
  await _db.exec(SCHEMA_SQL);
  console.log('[db] Connected to Postgres (DATABASE_URL detected)');
} else {
  const DB_PATH = path.join(DATA_DIR, 'lunao.db');
  _db = new sqliteDriver(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.exec(SCHEMA_SQL);
  if (typeof _db.exec === 'function' && _db.pragma) migrateSqlite();
  console.log(`[db] SQLite at ${DB_PATH}`);
}

export const db = _db;
export default _db;
