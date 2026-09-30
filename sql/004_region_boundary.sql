-- CardinalMap migration: add city/county polygon + centroid + mode to regions.
-- Idempotent. Safe to re-run.

ALTER TABLE regions
  ADD COLUMN IF NOT EXISTS mode              TEXT,
  ADD COLUMN IF NOT EXISTS centroid_lat      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS centroid_lon      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS boundary_geojson  JSONB;

-- Backfill centroid from center_lat/center_lon for existing rows so we don't end up with NULL.
UPDATE regions
   SET centroid_lat = center_lat,
       centroid_lon = center_lon
 WHERE centroid_lat IS NULL OR centroid_lon IS NULL;

-- Default existing rows to 'city' so the legacy rendering path keeps working.
UPDATE regions SET mode = 'city' WHERE mode IS NULL;

CREATE INDEX IF NOT EXISTS regions_mode_idx ON regions (mode);