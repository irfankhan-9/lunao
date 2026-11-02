-- ==============================================================================
-- Lunao Stage 1 PostgreSQL Migration Schema
-- Description: Creates / updates tables for campaigns, campaign_leads, site_history,
--              and templates with foreign keys, indexes, and ownership constraints.
-- ==============================================================================

-- 1. Campaigns Table
CREATE TABLE IF NOT EXISTS campaigns (
  id VARCHAR(64) PRIMARY KEY,
  owner_key VARCHAR(255) NOT NULL,
  niche VARCHAR(255),
  name VARCHAR(255),
  status VARCHAR(32) DEFAULT 'running',
  total_leads INT DEFAULT 0,
  sites_generated INT DEFAULT 0,
  sms_sent INT DEFAULT 0,
  sms_failed INT DEFAULT 0,
  sms_skipped INT DEFAULT 0,
  credits_charged INT DEFAULT 0,
  credits_refunded INT DEFAULT 0,
  sms_template TEXT,
  csv_snapshot TEXT,
  started_at BIGINT NOT NULL,
  completed_at BIGINT,
  type VARCHAR(32) DEFAULT 'sms',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaigns_owner_key ON campaigns(owner_key);
CREATE INDEX IF NOT EXISTS idx_campaigns_started_at ON campaigns(started_at DESC);

-- 2. Campaign Leads Table
CREATE TABLE IF NOT EXISTS campaign_leads (
  id SERIAL PRIMARY KEY,
  campaign_id VARCHAR(64) NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name VARCHAR(255),
  phone VARCHAR(64),
  email VARCHAR(255),
  city VARCHAR(255),
  niche VARCHAR(255),
  slug VARCHAR(255),
  site_url TEXT,
  site_status VARCHAR(64),
  sms_status VARCHAR(64),
  sms_error TEXT,
  index_in_campaign INT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign_id ON campaign_leads(campaign_id);

-- 3. Site History Table (Vibe Coding Snapshots & Versions)
CREATE TABLE IF NOT EXISTS site_history (
  id VARCHAR(64) PRIMARY KEY,
  owner_key VARCHAR(255),
  title VARCHAR(255) NOT NULL,
  niche VARCHAR(255),
  html TEXT NOT NULL,
  snapshot_label VARCHAR(255),
  is_template BOOLEAN DEFAULT FALSE,
  template_id VARCHAR(64),
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_history_owner_key ON site_history(owner_key);
CREATE INDEX IF NOT EXISTS idx_site_history_created_at ON site_history(created_at DESC);

-- 4. Templates Table (User and AI Generated Templates)
CREATE TABLE IF NOT EXISTS templates (
  id VARCHAR(64) PRIMARY KEY,
  owner_key VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  niche VARCHAR(255) NOT NULL,
  description TEXT,
  category_id VARCHAR(64),
  raw_html TEXT NOT NULL,
  preview_html TEXT,
  preview_path VARCHAR(512),
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_owner_key ON templates(owner_key);
CREATE INDEX IF NOT EXISTS idx_templates_niche ON templates(niche);
