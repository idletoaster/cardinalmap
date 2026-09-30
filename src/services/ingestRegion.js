'use strict';

const pool = require('../db/pool');
const log = require('../util/logger');
const cfg = require('../../config');
const { bboxFromCenter } = require('../overpass/bbox');
const { fetchAdminBoundaries } = require('../overpass/regionQuery');
const { fetchNeighborhoods } = require('../overpass/neighborhoodQuery');
const { fetchPOIsForCategory } = require('../overpass/poiQuery');
const { milesToMeters } = require('../util/miles');
const { bboxOfGeoJSON, centroidOfGeoJSON } = require('../util/polygon');

async function findFreshRegion({ country, bbox }) {
  const ttlDays = cfg.app.cacheTtlDays;
  const { rows } = await pool.query(
    `SELECT id, label, mode, centroid_lat, centroid_lon, fetched_at,
            (fetched_at > now() - ($5 || ' days')::interval) AS fresh
       FROM regions
      WHERE country_code = $1
        AND bbox_south = $2 AND bbox_west = $3
        AND bbox_north = $4 AND bbox_east = $6
      LIMIT 1`,
    [country, bbox.south, bbox.west, bbox.north, String(ttlDays), bbox.east]
  );
  return rows[0] || null;
}

async function createRegion({ country, bbox, lat, lon, label, mode, centroid, geojson }) {
  const { rows } = await pool.query(
    `INSERT INTO regions
       (country_code, bbox_south, bbox_west, bbox_north, bbox_east,
        center_lat, center_lon, label, mode, centroid_lat, centroid_lon, boundary_geojson)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (country_code, bbox_south, bbox_west, bbox_north, bbox_east) DO UPDATE
       SET label           = EXCLUDED.label,
           mode            = COALESCE(EXCLUDED.mode, regions.mode),
           centroid_lat    = COALESCE(EXCLUDED.centroid_lat, regions.centroid_lat),
           centroid_lon    = COALESCE(EXCLUDED.centroid_lon, regions.centroid_lon),
           boundary_geojson= COALESCE(regions.boundary_geojson, EXCLUDED.boundary_geojson)
     RETURNING id`,
    [country, bbox.south, bbox.west, bbox.north, bbox.east, lat, lon,
     label || null, mode || 'city',
     centroid ? centroid.lat : lat, centroid ? centroid.lon : lon,
     geojson ? JSON.stringify(geojson) : null]
  );
  return rows[0].id;
}

async function updateRegionBoundary(regionId, { mode, centroid, geojson }) {
  await pool.query(
    `UPDATE regions
        SET mode             = COALESCE($2, mode),
            centroid_lat     = COALESCE($3, centroid_lat),
            centroid_lon     = COALESCE($4, centroid_lon),
            boundary_geojson = COALESCE($5, boundary_geojson)
      WHERE id = $1`,
    [regionId, mode || null,
     centroid ? centroid.lat : null,
     centroid ? centroid.lon : null,
     geojson ? JSON.stringify(geojson) : null]
  );
}

async function replaceAdminBoundaries(regionId, items) {
  await pool.query('DELETE FROM admin_boundaries WHERE region_id = $1', [regionId]);
  for (const a of items) {
    await pool.query(
      `INSERT INTO admin_boundaries (region_id, osm_id, osm_type, level, name, geom)
       VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_GeomFromGeoJSON($6), 4326))`,
      [regionId, a.osm_id, a.osm_type, a.level, a.name, JSON.stringify(a.geom)]
    );
  }
}

async function replaceNeighborhoods(regionId, items) {
  await pool.query('DELETE FROM neighborhoods WHERE region_id = $1', [regionId]);
  for (const n of items) {
    await pool.query(
      `INSERT INTO neighborhoods (region_id, osm_id, osm_type, name, geom, centroid)
       VALUES ($1, $2, $3, $4,
               ST_SetSRID(ST_GeomFromGeoJSON($5), 4326),
               ST_SetSRID(ST_Centroid(ST_GeomFromGeoJSON($5)), 4326))`,
      [regionId, n.osm_id, n.osm_type, n.name, JSON.stringify(n.geom)]
    );
  }
}

async function replacePOIs(regionId, categoryId, items) {
  await pool.query(
    'DELETE FROM pois WHERE region_id = $1 AND category_id = $2',
    [regionId, categoryId]
  );
  for (const p of items) {
    const t = p.tags || {};
    const addr = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    await pool.query(
      `INSERT INTO pois (region_id, category_id, osm_id, osm_type,
                         name, brand, address, city, state, postcode,
                         phone, website, opening_hours, geom)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
               ST_SetSRID(ST_MakePoint($14,$15), 4326))
       ON CONFLICT DO NOTHING`,
      [
        regionId, categoryId, p.osm_id, p.osm_type,
        t.name || null,
        t.brand || null,
        addr || null,
        t['addr:city'] || null,
        t['addr:state'] || null,
        t['addr:postcode'] || null,
        t.phone || t['contact:phone'] || null,
        t.website || t['contact:website'] || null,
        t.opening_hours || null,
        p.lon, p.lat,
      ]
    );
  }
}

/**
 * Run the Overpass pipeline (admin boundaries, neighborhoods, POI categories)
 * for an existing region in parallel and mark it ready when done.
 *
 * All queries are fired with Promise.all so the slowest one bounds the total
 * time, not the sum of all of them. Each branch swallows its own errors so a
 * single Overpass failure doesn't poison the region.
 */
async function runIngestForRegion(regionId, bbox) {
  try {
    await pool.query(
      `UPDATE regions
          SET ingest_status     = 'pending',
              ingest_error      = NULL,
              ingest_started_at = now(),
              ingest_finished_at= NULL
        WHERE id = $1`,
      [regionId]
    );

    const enabledCats = cfg.poiCategories.filter((c) => c.enabled);
    const tasks = [
      fetchAdminBoundaries(bbox).then((items)  => replaceAdminBoundaries(regionId, items)).then((n) => log.info('ingest: admin_boundaries', { regionId, count: n })).catch((e) => log.warn('ingest: admin_boundaries failed', { regionId, err: e.message })),
      fetchNeighborhoods(bbox).then((items)    => replaceNeighborhoods(regionId, items)).then((n) => log.info('ingest: neighborhoods',   { regionId, count: n })).catch((e) => log.warn('ingest: neighborhoods failed',   { regionId, err: e.message })),
      ...enabledCats.map((cat) =>
        fetchPOIsForCategory(cat, bbox)
          .then((items) => replacePOIs(regionId, cat.id, items))
          .then((n) => log.info('ingest: pois', { regionId, category: cat.id, count: n }))
          .catch((e) => log.warn('ingest: pois failed', { regionId, category: cat.id, err: e.message }))
      ),
    ];
    await Promise.all(tasks);

    await pool.query(
      `UPDATE regions
          SET ingest_status      = 'ready',
              ingest_finished_at = now()
        WHERE id = $1`,
      [regionId]
    );
    log.info('ingest: ready', { regionId });
  } catch (e) {
    await pool.query(
      `UPDATE regions
          SET ingest_status = 'error',
              ingest_error  = $2
        WHERE id = $1`,
      [regionId, String(e?.message || e).slice(0, 500)]
    ).catch(() => {});
    log.error('ingest: failed', { regionId, err: e.message });
  }
}

/**
 * Ensure a region exists for the given location. The boundary polygon + centroid
 * are written and returned IMMEDIATELY so the client can render the city outline
 * without waiting for Overpass. The Overpass pipeline (admin boundaries,
 * neighborhoods, POIs) runs in the background; the client polls
 * /api/region/:id to know when POIs are ready.
 *
 * @param {object}  opts
 * @param {number}  opts.lat
 * @param {number}  opts.lon
 * @param {number}  opts.radiusMiles
 * @param {string}  opts.country
 * @param {string=} opts.label
 * @param {boolean=}opts.force
 * @param {string=} opts.mode       'city' | 'county' (defaults to 'city')
 * @param {object=} opts.geojson    Polygon/MultiPolygon from Nominatim (optional)
 * @param {{lat:number,lon:number}=} opts.centroid  Centroid of the polygon (optional; computed if absent)
 */
async function ensureRegion(opts) {
  const {
    lat, lon, radiusMiles, country, label, force,
    mode = 'city', geojson = null, centroid = null,
  } = opts;

  const polyBbox = geojson ? bboxOfGeoJSON(geojson) : null;
  const miles = Math.min(cfg.app.maxRadius, Math.max(cfg.app.minRadius, radiusMiles));
  const bbox = polyBbox || bboxFromCenter(lat, lon, milesToMeters(miles));
  const c = centroid || (geojson ? centroidOfGeoJSON(geojson) : null) || { lat, lon };

  const existing = await findFreshRegion({ country, bbox });
  if (existing && existing.fresh && !force) {
    if (geojson) {
      await updateRegionBoundary(existing.id, { mode, centroid: c, geojson });
    }
    return {
      region_id: existing.id, fresh: true,
      fetched_at: existing.fetched_at,
      bbox,
      centroid: { lat: existing.centroid_lat ?? c.lat, lon: existing.centroid_lon ?? c.lon },
      mode: existing.mode || mode,
      ingest_status: 'ready',
    };
  }

  log.info('ensureRegion', { label, lat, lon, mode, miles, force: !!force, hasExisting: !!existing });

  let regionId = existing?.id;
  if (!regionId) {
    regionId = await createRegion({
      country, bbox,
      lat: c.lat, lon: c.lon, label, mode, centroid: c, geojson,
    });
  } else if (geojson) {
    await updateRegionBoundary(regionId, { mode, centroid: c, geojson });
  }

  // Mark pending and kick off Overpass in the background. We do NOT await —
  // the boundary is already in the DB and returned to the client.
  pool.query(
    `UPDATE regions
        SET ingest_status      = 'pending',
            ingest_error       = NULL,
            ingest_started_at  = now(),
            ingest_finished_at = NULL,
            fetched_at         = now()
      WHERE id = $1`,
    [regionId]
  ).catch((e) => log.warn('ensureRegion: status update failed', { err: e.message }));

  setImmediate(() => {
    runIngestForRegion(regionId, bbox).catch((e) =>
      log.error('runIngestForRegion crashed', { regionId, err: e.message })
    );
  });

  return {
    region_id: regionId, fresh: false,
    fetched_at: new Date(), bbox, centroid: c, mode,
    ingest_status: 'pending',
  };
}

module.exports = { ensureRegion, runIngestForRegion };