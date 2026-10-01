-- migration_001_state_hierarchy.sql
-- Adds hierarchy columns so state/county/city regions and POIs link properly.
-- Additive only: every new column is NULLABLE; no data backfill needed.

BEGIN;

ALTER TABLE regions
  ADD COLUMN IF NOT EXISTS parent_state_region_id bigint
    REFERENCES regions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_state_synthetic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS state_code text;

CREATE INDEX IF NOT EXISTS regions_parent_state_idx
  ON regions (parent_state_region_id)
  WHERE parent_state_region_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS regions_state_code_idx
  ON regions (state_code)
  WHERE state_code IS NOT NULL;

ALTER TABLE regions DROP CONSTRAINT IF EXISTS regions_mode_check;
ALTER TABLE regions ADD CONSTRAINT regions_mode_check
  CHECK (mode IS NULL OR mode IN ('state', 'county', 'city'));

ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS state_id bigint
    REFERENCES regions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pois_state_id_idx
  ON pois (state_id)
  WHERE state_id IS NOT NULL;

COMMIT;
