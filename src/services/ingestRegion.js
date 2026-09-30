'use strict';

const pool = require('../db/pool');
const log = require('../util/logger');
const cfg = require('../../config');
const { bboxFromCenter } = require('../overpass/bbox');
const { fetchAdminBoundaries } = require('../overpass/regionQuery');
const { fetchNeighborhoods } = require('../overpass/neighborhoodQuery');
const { fetchPOIsForCategory } = require('../overpass/poiQuery');
const { milesToMeters } = require('../util/miles');

async function findFreshRegion({ country, bbox }) {
  const ttlDays = cfg.app.cacheTtlDays;
  const { rows } = await pool.query(
    `SELECT id, label, fetched_at,
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

async function createRegion({ country, bbox, lat, lon, label }) {
  const { rows } = await pool.query(
    `INSERT INTO regions (country_code, bbox_south, bbox_west, bbox_north, bbox_east, center_lat, center_lon, label)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (country_code, bbox_south, bbox_west, bbox_north, bbox_east) DO UPDATE SET label = EXCLUDED.label
     RETURNING id`,
    [country, bbox.south, bbox.west, bbox.north, bbox.east, lat, lon, label || null]
  );
  return rows[0].id;
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
    `DELETE FROM pois WHERE region_id = $1 AND category_id = $2`,
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

async function ensureRegion({ lat, lon, radiusMiles, country, label, force }) {
  const miles = Math.min(cfg.app.maxRadius, Math.max(cfg.app.minRadius, radiusMiles));
  const bbox = bboxFromCenter(lat, lon, milesToMeters(miles));

  const existing = await findFreshRegion({ country, bbox });
  if (existing && existing.fresh && !force) {
    return { region_id: existing.id, fresh: true, fetched_at: existing.fetched_at, bbox };
  }

  log.info('ingest: region', { label, lat, lon, miles, force: !!force });

  let regionId = existing?.id;
  if (!regionId) {
    regionId = await createRegion({ country, bbox, lat, lon, label });
  }

  try {
    const admin = await fetchAdminBoundaries(bbox);
    await replaceAdminBoundaries(regionId, admin);
    log.info('ingest: admin_boundaries', { count: admin.length });
  } catch (e) {
    log.warn('ingest: admin_boundaries failed', { err: e.message });
  }

  try {
    const n = await fetchNeighborhoods(bbox);
    await replaceNeighborhoods(regionId, n);
    log.info('ingest: neighborhoods', { count: n.length });
  } catch (e) {
    log.warn('ingest: neighborhoods failed', { err: e.message });
  }

  const enabledCats = cfg.poiCategories.filter((c) => c.enabled);
  for (const cat of enabledCats) {
    try {
      const items = await fetchPOIsForCategory(cat, bbox);
      await replacePOIs(regionId, cat.id, items);
      log.info('ingest: pois', { category: cat.id, count: items.length });
    } catch (e) {
      log.warn('ingest: pois failed', { category: cat.id, err: e.message });
    }
  }

  return { region_id: regionId, fresh: false, fetched_at: new Date(), bbox };
}

module.exports = { ensureRegion };
