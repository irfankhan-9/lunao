-- ==============================================================================
-- Lunao Production Migration: 20261017_add_email_automation_jobs.sql
-- Description: Creates the email_automation_jobs table for multi-instance atomic deduplication
--              and bounded retries across Cloud Run / container restarts.
-- Safety: Non-destructive. Uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS.
--         Does not alter or drop any existing application tables.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS email_automation_jobs (
  idempotency_key TEXT PRIMARY KEY,
  booking_id TEXT,
  slug TEXT,
  automation_type TEXT,
  recipient_email TEXT,
  status TEXT DEFAULT 'processing',
  attempts INT DEFAULT 1,
  last_attempt_at BIGINT,
  resend_id TEXT,
  error_message TEXT,
  created_at BIGINT,
  updated_at BIGINT
);

-- Index for tenant-scoped query and status reporting
CREATE INDEX IF NOT EXISTS idx_email_jobs_slug_status 
ON email_automation_jobs (slug, status);

-- Index for booking-specific lookup
CREATE INDEX IF NOT EXISTS idx_email_jobs_booking_id 
ON email_automation_jobs (booking_id);
