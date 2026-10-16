-- ==============================================================================
-- Lunao Production Migration: 20261016_add_idempotency_key.sql
-- Description: Adds idempotency_key column and tenant-scoped partial unique index.
-- Safety: Non-destructive. Existing rows retain idempotency_key = NULL and are
--         excluded from the unique index constraint via the partial predicate.
-- ==============================================================================

-- 1. Add idempotency_key column if it does not already exist
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- 2. Create tenant-scoped unique index
-- Enforces that for any given tenant (slug), an idempotency_key can only be committed once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slug_idempotency 
ON bookings (slug, idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- 3. Composite index for rapid query by tenant, status, and creation time
CREATE INDEX IF NOT EXISTS idx_bookings_slug_status_created 
ON bookings (slug, status, created_at DESC);
