-- CardinalMap schema. Idempotent (safe to re-run).

-- --- poi_categories: registry driven by config/poi-categories.json ---
CREATE TABLE IF NOT EXISTS poi_categories (
  id           TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  icon         TEXT NOT NULL,
  color        TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  config_json  JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --- regions: cached administrative boundaries ---
-- Region is keyed by (country_code, south, west, north, east) so we can re-use
-- Overpass data without re-fetching for nearby lookups.
CREATE TABLE IF NOT EXISTS regions (
  id           BIGSERIAL PRIMARY KEY,
  country_code TEXT NOT NULL,
  bbox_south   DOUBLE PRECISION NOT NULL,
  bbox_west    DOUBLE PRECISION NOT NULL,
  bbox_north   DOUBLE PRECISION NOT NULL,
  bbox_east    DOUBLE PRECISION NOT NULL,
  center_lat   DOUBLE PRECISION NOT NULL,
  center_lon   DOUBLE PRECISION NOT NULL,
  label        TEXT,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code, bbox_south, bbox_west, bbox_north, bbox_east)
);
CREATE INDEX IF NOT EXISTS regions_country_idx ON regions (country_code);

-- --- neighborhoods: polygons for city neighborhoods ---
CREATE TABLE IF NOT EXISTS neighborhoods (
  id           BIGSERIAL PRIMARY KEY,
  region_id    BIGINT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  osm_id       BIGINT NOT NULL,
  osm_type     TEXT NOT NULL,
  name         TEXT,
  geom         GEOMETRY(MultiPolygon, 4326) NOT NULL,
  centroid     GEOMETRY(Point, 4326) NOT NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (region_id, osm_type, osm_id)
);
CREATE INDEX IF NOT EXISTS neighborhoods_geom_gist ON neighborhoods USING GIST (geom);
CREATE INDEX IF NOT EXISTS neighborhoods_centroid_gist ON neighborhoods USING GIST (centroid);

-- --- admin_boundaries: city + county polygons ---
CREATE TABLE IF NOT EXISTS admin_boundaries (
  id           BIGSERIAL PRIMARY KEY,
  region_id    BIGINT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  osm_id       BIGINT NOT NULL,
  osm_type     TEXT NOT NULL,
  level        TEXT NOT NULL,
  name         TEXT,
  geom         GEOMETRY(MultiPolygon, 4326) NOT NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (region_id, level, osm_type, osm_id)
);
CREATE INDEX IF NOT EXISTS admin_boundaries_geom_gist ON admin_boundaries USING GIST (geom);
CREATE INDEX IF NOT EXISTS admin_boundaries_level_idx ON admin_boundaries (level);

-- --- pois: cached Overpass POIs, categorized ---
CREATE TABLE IF NOT EXISTS pois (
  id           BIGSERIAL PRIMARY KEY,
  region_id    BIGINT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  category_id  TEXT NOT NULL REFERENCES poi_categories(id) ON DELETE CASCADE,
  osm_id       BIGINT NOT NULL,
  osm_type     TEXT NOT NULL,
  name         TEXT,
  brand        TEXT,
  address      TEXT,
  city         TEXT,
  state        TEXT,
  postcode     TEXT,
  phone        TEXT,
  website      TEXT,
  opening_hours TEXT,
  geom         GEOMETRY(Point, 4326) NOT NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (region_id, category_id, osm_type, osm_id)
);
CREATE INDEX IF NOT EXISTS pois_geom_gist ON pois USING GIST (geom);
CREATE INDEX IF NOT EXISTS pois_category_idx ON pois (category_id);
CREATE INDEX IF NOT EXISTS pois_region_category_idx ON pois (region_id, category_id);
