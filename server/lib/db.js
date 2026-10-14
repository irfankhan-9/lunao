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
    readiness_score INTEGER NOT NULL DEFAULT 0,
    readiness_json TEXT,
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

  -- Telnyx OAuth connections — one row per (user, account) the user has
  -- connected via the "Connect with Telnyx" button. Stores encrypted
  -- access + refresh tokens (AES-256-GCM), the email that identifies the
  -- Telnyx account, and a derived total_numbers count so the UI can show
  -- "3 numbers connected" without round-tripping to Telnyx every render.
  CREATE TABLE IF NOT EXISTS telnyx_connections (
    id                      TEXT    PRIMARY KEY,
    user_id                 TEXT    NOT NULL,
    account_email           TEXT    NOT NULL DEFAULT '',
    account_label           TEXT    NOT NULL DEFAULT '',
    encrypted_access_token  TEXT    NOT NULL,
    encrypted_refresh_token TEXT,
    expires_at              INTEGER,
    total_numbers           INTEGER NOT NULL DEFAULT 0,
    status                  TEXT    NOT NULL DEFAULT 'active',
    connected_at            INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_telnyx_connections_user ON telnyx_connections(user_id);
  -- One row per (user, account_email). Re-connecting the same Telnyx
  -- account upserts the tokens in place rather than creating duplicates.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_telnyx_user_email
    ON telnyx_connections(user_id, account_email);

  -- ---------------------------------------------------------------------
  -- v5: Lunao Owner PWA — per-tenant state owned by the business owner.
  -- ---------------------------------------------------------------------

  -- Business profile (one row per slug). Backfilled from compiled HTML
  -- metadata on first read if missing.
  CREATE TABLE IF NOT EXISTS business_profiles (
    slug                TEXT    PRIMARY KEY,
    name                TEXT    NOT NULL,
    niche               TEXT,
    tagline             TEXT,
    phone               TEXT,
    phone_raw           TEXT,
    email               TEXT,
    address             TEXT,
    city                TEXT,
    state               TEXT,
    timezone            TEXT,
    logo_url            TEXT,
    website_url         TEXT,
    social_instagram    TEXT,
    social_facebook     TEXT,
    social_google_maps  TEXT,
    theme_accent        TEXT    NOT NULL DEFAULT '#059669',
    theme_accent_dark   TEXT    NOT NULL DEFAULT '#047857',
    theme_accent_soft   TEXT    NOT NULL DEFAULT '#ecfdf5',
    theme_accent_border TEXT    NOT NULL DEFAULT '#a7f3d0',
    theme_radius        TEXT    NOT NULL DEFAULT 'lg',
    feature_booking     INTEGER NOT NULL DEFAULT 1,
    feature_chatbot     INTEGER NOT NULL DEFAULT 1,
    feature_email       INTEGER NOT NULL DEFAULT 1,
    feature_automations INTEGER NOT NULL DEFAULT 1,
    created_at          INTEGER,
    updated_at          INTEGER
  );

  -- AI receptionist settings (one row per slug)
  CREATE TABLE IF NOT EXISTS pwa_ai_settings (
    slug                  TEXT    PRIMARY KEY,
    enabled               INTEGER NOT NULL DEFAULT 1,
    greeting              TEXT,
    tone                  TEXT,
    business_description  TEXT,
    business_hours        TEXT,
    location_details      TEXT,
    policies              TEXT,
    booking_enabled       INTEGER NOT NULL DEFAULT 1,
    booking_instructions  TEXT,
    info_to_collect       TEXT,
    confirmation_behavior TEXT,
    do_not_claim          TEXT,
    escalation_guidance   TEXT,
    faqs_json             TEXT,
    updated_at            INTEGER
  );

  -- Website config surfaced in the PWA
  CREATE TABLE IF NOT EXISTS pwa_website_config (
    slug           TEXT    PRIMARY KEY,
    url            TEXT,
    status         TEXT,
    last_updated   TEXT,
    last_deployed  TEXT,
    headline       TEXT,
    subheadline    TEXT,
    hero_image     TEXT,
    cta_text       TEXT,
    announcement   TEXT,
    updated_at     INTEGER
  );

  -- Automation rules owned by the tenant
  CREATE TABLE IF NOT EXISTS pwa_automations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    slug          TEXT    NOT NULL,
    key           TEXT    NOT NULL,
    enabled       INTEGER NOT NULL DEFAULT 1,
    timing_value  INTEGER NOT NULL DEFAULT 1,
    timing_unit   TEXT    NOT NULL DEFAULT 'hours',
    template_id   INTEGER,
    subject       TEXT,
    body          TEXT,
    config_json   TEXT,
    updated_at    INTEGER,
    UNIQUE(slug, key)
  );
  CREATE INDEX IF NOT EXISTS idx_pwa_automations_slug ON pwa_automations(slug);

  -- Owner-managed email templates
  CREATE TABLE IF NOT EXISTS pwa_email_templates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slug       TEXT    NOT NULL,
    name       TEXT    NOT NULL,
    subject    TEXT,
    body       TEXT,
    category   TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_pwa_email_templates_slug ON pwa_email_templates(slug);

  -- Owner-visible email send activity
  CREATE TABLE IF NOT EXISTS pwa_email_activity (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    slug             TEXT    NOT NULL,
    recipient_name   TEXT,
    recipient_email  TEXT,
    template_name    TEXT,
    subject          TEXT,
    body_preview     TEXT,
    sent_at          INTEGER,
    status           TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_pwa_email_activity_slug ON pwa_email_activity(slug, sent_at DESC);

  -- Reviews (initially owner-entered; future Google Places ingestion)
  CREATE TABLE IF NOT EXISTS pwa_reviews (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT    NOT NULL,
    source          TEXT,
    external_id     TEXT,
    customer_name   TEXT,
    customer_email  TEXT,
    rating          INTEGER,
    service         TEXT,
    comment         TEXT,
    response        TEXT,
    responded_at    INTEGER,
    created_at      INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_pwa_reviews_slug ON pwa_reviews(slug, created_at DESC);

  -- Integrations registry (calendar, POS, webhook, etc.)
  CREATE TABLE IF NOT EXISTS pwa_integrations (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    slug              TEXT    NOT NULL,
    provider          TEXT    NOT NULL,
    name              TEXT,
    description       TEXT,
    status            TEXT,
    connected_account TEXT,
    last_sync         TEXT,
    config_json       TEXT,
    updated_at        INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_pwa_integrations_slug ON pwa_integrations(slug);

  -- Persistent OAuth state store — survives server restarts unlike the
  -- in-memory Map. Stores Google/Telnyx OAuth state tokens keyed by the
  -- state value so the callback can validate them even after a restart.
  -- code_verifier is used by the Telnyx PKCE flow.
  CREATE TABLE IF NOT EXISTS oauth_states (
    state         TEXT    PRIMARY KEY,
    owner_key     TEXT    NOT NULL,
    provider      TEXT    NOT NULL DEFAULT 'gmail',
    created_at    INTEGER NOT NULL,
    expires_at    INTEGER NOT NULL,
    code_verifier TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

  -- Customer records (enrichment layer on top of derived-from-bookings)
  CREATE TABLE IF NOT EXISTS pwa_customers (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    slug              TEXT    NOT NULL,
    name              TEXT    NOT NULL,
    phone             TEXT,
    email             TEXT,
    notes             TEXT,
    booking_count     INTEGER NOT NULL DEFAULT 0,
    last_booking_date TEXT,
    last_service      TEXT,
    created_at        INTEGER,
    updated_at        INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_pwa_customers_slug ON pwa_customers(slug);
  CREATE INDEX IF NOT EXISTS idx_pwa_customers_email ON pwa_customers(slug, email);
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
    'enabled', 'timing_value', 'template_id', 'rating', 'responded_at',
    'created_at', 'updated_at', 'sent_at',
    'feature_booking', 'feature_chatbot', 'feature_email', 'feature_automations',
    'booking_count',
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
    // v4: telnyx_connections is created by the main SCHEMA_SQL block; these
    // ALTERs handle legacy databases that pre-date the Telnyx OAuth feature.
    { table: 'telnyx_connections', col: 'account_email', ddl: `ALTER TABLE telnyx_connections ADD COLUMN account_email TEXT NOT NULL DEFAULT ''` },
    { table: 'telnyx_connections', col: 'account_label', ddl: `ALTER TABLE telnyx_connections ADD COLUMN account_label TEXT NOT NULL DEFAULT ''` },
    { table: 'telnyx_connections', col: 'total_numbers', ddl: `ALTER TABLE telnyx_connections ADD COLUMN total_numbers INTEGER NOT NULL DEFAULT 0` },
    // v5: code_verifier for Telnyx PKCE OAuth flow.
    { table: 'oauth_states', col: 'code_verifier', ddl: `ALTER TABLE oauth_states ADD COLUMN code_verifier TEXT` },
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

  // v5: Deduplicate email_leads + add UNIQUE INDEX to prevent future dupes.
  // The dork pipeline's Phase 1 staging + Phase 2 URL-swap could create two
  // rows for the same (campaign, email, business, city). Keep the OLDEST row
  // per group and delete the rest so future runs report accurate counts.
  try {
    const before = _db.prepare('SELECT COUNT(*) AS n FROM email_leads').get().n;
    _db.exec(`
      DELETE FROM email_leads
      WHERE id NOT IN (
        SELECT MIN(id) FROM email_leads
        GROUP BY campaign_id, lower(email), lower(business_name), lower(city)
      );
    `);
    const after = _db.prepare('SELECT COUNT(*) AS n FROM email_leads').get().n;
    const removed = before - after;
    if (removed > 0) {
      console.log(`[db] migration v5: removed ${removed} duplicate email_leads rows (kept oldest per campaign+email+business+city)`);
    }

    // Database-level safety net: UNIQUE INDEX prevents future duplicate inserts
    // even if all dedup logic in the application layer fails.
    _db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_leads_campaign_email_biz_city
      ON email_leads (campaign_id, lower(email), lower(business_name), lower(city))
      WHERE email != '' AND business_name != '';
    `);
    console.log('[db] migration v5: ensured UNIQUE INDEX on email_leads (campaign, email, business, city)');
  } catch (err) {
    console.error(`[db] migration v5 failed: ${err.message}`);
  }

  // v5b: Recompute cached counts on email_campaigns after dedup so the
  // dashboard's Leads / Sites / Sent tiles stop double-counting.
  try {
    const campaigns = _db.prepare('SELECT id FROM email_campaigns').all();
    for (const c of campaigns) {
      _db.prepare(`
        UPDATE email_campaigns SET
          emails_sent = COALESCE((
            SELECT COUNT(*) FROM email_leads
            WHERE campaign_id = ? AND send_status = 'sent'
          ), 0),
          emails_failed = COALESCE((
            SELECT COUNT(*) FROM email_leads
            WHERE campaign_id = ? AND send_status = 'failed'
          ), 0),
          sites_generated = COALESCE((
            SELECT COUNT(*) FROM email_leads
            WHERE campaign_id = ? AND generated_site_url IS NOT NULL AND generated_site_url != ''
          ), 0),
          leads_found = COALESCE((
            SELECT COUNT(*) FROM email_leads WHERE campaign_id = ?
          ), 0)
        WHERE id = ?
      `).run(c.id, c.id, c.id, c.id, c.id);
    }
    console.log(`[db] migration v5b: recomputed cached counts for ${campaigns.length} campaigns`);
  } catch (err) {
    console.error(`[db] migration v5b failed: ${err.message}`);
  }
}

// ---- Postgres migrations (mirror of SQLite v5) --------------------------
async function migratePg() {
  try {
    const before = await _db.prepare('SELECT COUNT(*) AS n FROM email_leads').get();
    const beforeN = Number(before?.n ?? 0);

    await _db.exec(`
      DELETE FROM email_leads
      WHERE id NOT IN (
        SELECT MIN(id) FROM email_leads
        GROUP BY campaign_id, lower(email), lower(business_name), lower(city)
      );
    `);

    const after = await _db.prepare('SELECT COUNT(*) AS n FROM email_leads').get();
    const afterN = Number(after?.n ?? 0);
    const removed = beforeN - afterN;
    if (removed > 0) {
      console.log(`[db] migration v5 (pg): removed ${removed} duplicate email_leads rows`);
    }

    await _db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_leads_campaign_email_biz_city
      ON email_leads (campaign_id, lower(email), lower(business_name), lower(city))
      WHERE email <> '' AND business_name <> '';
    `);
    console.log('[db] migration v5 (pg): ensured UNIQUE INDEX on email_leads');
  } catch (err) {
    console.error(`[db] migration v5 (pg) failed: ${err.message}`);
  }

  try {
    const campaigns = await _db.prepare('SELECT id FROM email_campaigns').all();
    for (const c of campaigns) {
      await _db.prepare(`
        UPDATE email_campaigns SET
          emails_sent = COALESCE((SELECT COUNT(*) FROM email_leads WHERE campaign_id = $1 AND send_status = 'sent'), 0),
          emails_failed = COALESCE((SELECT COUNT(*) FROM email_leads WHERE campaign_id = $1 AND send_status = 'failed'), 0),
          sites_generated = COALESCE((SELECT COUNT(*) FROM email_leads WHERE campaign_id = $1 AND generated_site_url IS NOT NULL AND generated_site_url <> ''), 0),
          leads_found = COALESCE((SELECT COUNT(*) FROM email_leads WHERE campaign_id = $1), 0)
        WHERE id = $1
      `).run(c.id);
    }
    console.log(`[db] migration v5b (pg): recomputed cached counts for ${campaigns.length} campaigns`);
  } catch (err) {
    console.error(`[db] migration v5b (pg) failed: ${err.message}`);
  }
}

if (HAS_PG && pgPool) {
  _db = makePgAdapter(pgPool);
  await _db.exec(SCHEMA_SQL);
  // Same dedup + UNIQUE INDEX + count-recompute migration runs against Postgres too.
  await migratePg();
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
