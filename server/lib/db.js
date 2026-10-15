import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from './config.js';

const DATA_DIR = path.join(ROOT_DIR, 'server', '.data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'lunao.db');
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Ensure all application tables exist
db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    owner_key TEXT,
    niche TEXT,
    name TEXT,
    status TEXT,
    total_leads INTEGER DEFAULT 0,
    sites_generated INTEGER DEFAULT 0,
    sms_sent INTEGER DEFAULT 0,
    sms_failed INTEGER DEFAULT 0,
    sms_skipped INTEGER DEFAULT 0,
    credits_charged INTEGER DEFAULT 0,
    credits_refunded INTEGER DEFAULT 0,
    sms_template TEXT,
    csv_snapshot TEXT,
    started_at INTEGER,
    completed_at INTEGER,
    type TEXT DEFAULT "sms"
  );

  CREATE TABLE IF NOT EXISTS campaign_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT,
    name TEXT,
    phone TEXT,
    email TEXT,
    city TEXT,
    niche TEXT,
    slug TEXT,
    site_url TEXT,
    site_status TEXT,
    sms_status TEXT,
    sms_error TEXT,
    index_in_campaign INTEGER,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS sms_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT,
    lead_id INTEGER,
    owner_key TEXT,
    to_number TEXT,
    from_number TEXT,
    body TEXT,
    status TEXT,
    telnyx_id TEXT,
    error_code TEXT,
    error_message TEXT,
    segment_count INTEGER DEFAULT 1,
    cost_credits INTEGER DEFAULT 0,
    refunded INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS sms_inbound (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telnyx_id TEXT,
    from_number TEXT,
    to_number TEXT,
    body TEXT,
    kind TEXT,
    status TEXT,
    raw_json TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS credit_accounts (
    owner_key TEXT PRIMARY KEY,
    plan TEXT,
    balance INTEGER DEFAULT 0,
    lifetime_used INTEGER DEFAULT 0,
    lifetime_refunded INTEGER DEFAULT 0,
    updated_at INTEGER,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS credit_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_key TEXT,
    delta INTEGER,
    reason TEXT,
    ref_type TEXT,
    ref_id TEXT,
    balance_after INTEGER,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS invite_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    slug TEXT,
    label TEXT,
    plan TEXT,
    created_at INTEGER,
    revoked_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS site_addons (
    slug TEXT PRIMARY KEY,
    booking_enabled INTEGER DEFAULT 1,
    chatbot_enabled INTEGER DEFAULT 1,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    slug TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    slug TEXT,
    role TEXT,
    content TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT,
    business_name TEXT,
    customer_name TEXT,
    phone TEXT,
    email TEXT,
    service TEXT,
    date TEXT,
    time TEXT,
    notes TEXT,
    source TEXT,
    status TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS business_profiles (
    slug TEXT PRIMARY KEY,
    name TEXT,
    niche TEXT,
    tagline TEXT,
    phone TEXT,
    phone_raw TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    timezone TEXT,
    logo_url TEXT,
    website_url TEXT,
    social_instagram TEXT,
    social_facebook TEXT,
    social_google_maps TEXT,
    theme_accent TEXT,
    theme_accent_dark TEXT,
    theme_accent_soft TEXT,
    theme_accent_border TEXT,
    theme_radius TEXT,
    feature_booking INTEGER DEFAULT 1,
    feature_chatbot INTEGER DEFAULT 1,
    feature_email INTEGER DEFAULT 1,
    feature_automations INTEGER DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS pwa_ai_settings (
    slug TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 1,
    greeting TEXT,
    tone TEXT,
    business_description TEXT,
    business_hours TEXT,
    location_details TEXT,
    policies TEXT,
    booking_enabled INTEGER DEFAULT 1,
    booking_instructions TEXT,
    info_to_collect TEXT,
    confirmation_behavior TEXT,
    do_not_claim TEXT,
    escalation_guidance TEXT,
    faqs_json TEXT,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS pwa_website_config (
    slug TEXT PRIMARY KEY,
    url TEXT,
    status TEXT,
    last_updated TEXT,
    last_deployed TEXT,
    headline TEXT,
    subheadline TEXT,
    hero_image TEXT,
    cta_text TEXT,
    announcement TEXT,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS pwa_customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT,
    name TEXT,
    phone TEXT,
    email TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS pwa_automations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT,
    key TEXT,
    enabled INTEGER DEFAULT 1,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS pwa_email_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT,
    key TEXT,
    subject TEXT,
    body TEXT,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS pwa_email_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT,
    customer_id INTEGER,
    template_key TEXT,
    status TEXT,
    sent_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS site_history (
    id TEXT PRIMARY KEY,
    owner_key TEXT,
    slug TEXT,
    business_name TEXT,
    city TEXT,
    niche TEXT,
    site_url TEXT,
    html TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS template_categories (
    id TEXT PRIMARY KEY,
    owner_key TEXT,
    name TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS custom_templates (
    id TEXT PRIMARY KEY,
    owner_key TEXT,
    category_id TEXT,
    name TEXT,
    niche TEXT,
    html TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS email_campaigns (
    id TEXT PRIMARY KEY,
    owner_key TEXT,
    niche TEXT,
    status TEXT,
    leads_found INTEGER DEFAULT 0,
    emails_sent INTEGER DEFAULT 0,
    emails_failed INTEGER DEFAULT 0,
    sites_generated INTEGER DEFAULT 0,
    sent INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    total_leads INTEGER DEFAULT 0,
    created_at INTEGER,
    completed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS email_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT,
    name TEXT,
    email TEXT,
    phone TEXT,
    city TEXT,
    niche TEXT,
    slug TEXT,
    site_url TEXT,
    status TEXT,
    assigned_account_id TEXT,
    index_in_campaign INTEGER,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT,
    lead_id INTEGER,
    owner_key TEXT,
    to_email TEXT,
    status TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS email_send_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT,
    sent_at INTEGER,
    lead_id INTEGER,
    campaign_id TEXT
  );

  CREATE TABLE IF NOT EXISTS email_accounts (
    id TEXT PRIMARY KEY,
    owner_key TEXT,
    email TEXT,
    provider TEXT,
    status TEXT DEFAULT "healthy",
    bounce_rate_7d REAL DEFAULT 0,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    owner_key TEXT,
    provider TEXT,
    expires_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS telnyx_connections (
    id TEXT PRIMARY KEY,
    owner_key TEXT,
    user_id TEXT,
    status TEXT DEFAULT "active",
    encrypted_access_token TEXT,
    encrypted_refresh_token TEXT,
    expires_at INTEGER,
    sender_number TEXT,
    total_numbers INTEGER DEFAULT 1,
    account_email TEXT,
    account_label TEXT,
    connected_at INTEGER,
    created_at INTEGER,
    updated_at INTEGER
  );
`);

export default db;
