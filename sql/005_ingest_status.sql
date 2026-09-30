-- CardinalMap migration: track Overpass ingest status per region so /api/locate can
-- return the boundary instantly and let the client poll until POIs are ready.
-- Idempotent. Safe to re-run.

ALTER TABLE regions
  ADD COLUMN IF NOT EXISTS ingest_status        TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS ingest_error         TEXT,
  ADD COLUMN IF NOT EXISTS ingest_started_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ingest_finished_at   TIMESTAMPTZ;

UPDATE regions SET ingest_status = 'ready' WHERE ingest_status IS NULL;

CREATE INDEX IF NOT EXISTS regions_status_idx ON regions (ingest_status);
