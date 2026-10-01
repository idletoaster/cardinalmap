// scripts/state-import/loadAdmin.js
// Reads GeoJSON FeatureCollection of admin boundaries and inserts them as:
//   - 1 state-level synthetic region (mode='state', is_state_synthetic=true, state_code)
//   - N county regions (mode='county', parent_state_region_id=state.region.id)
//   - N city/place regions (mode='city', parent_state_region_id=state.region.id)
//   - 1 admin_boundary row per Feature (level='state'|'county'|'city')
'use strict';

const fs = require('fs');

const LEVEL_FROM_ADMIN = {
  '4': 'state',
  '5': 'county',     // some states use 5 for counties
  '6': 'county',     // most US counties
  '7': 'place',
  '8': 'city',       // most US cities
  '9': 'neighborhood',
  '10': 'suburb',
};

/**
 * Compute bbox + center from a GeoJSON geometry. Returns [s,w,n,e,clat,clon].
 */
function bboxAndCenter(geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      minX = Math.min(minX, coords[0]); maxX = Math.max(maxX, coords[0]);
      minY = Math.min(minY, coords[1]); maxY = Math.max(maxY, coords[1]);
      return;
    }
    for (const c of coords) walk(c);
  };
  if (geom && geom.coordinates) walk(geom.coordinates);
  if (!isFinite(minX)) return null;
  const clat = (minY + maxY) / 2;
  const clon = (minX + maxX) / 2;
  return { s: minY, w: minX, n: maxY, e: maxX, clat, clon };
}

/**
 * Load one state's admin boundaries into the DB.
 * pool: pg Pool
 * state: { name, fips, code }
 * geojsonPath: path to GeoJSON FeatureCollection of admin_level=4,6,8
 *
 * Returns: { stateRegionId, counties: [...], cities: [...] }
 */
async function loadAdminBoundaries(pool, state, geojsonPath) {
  const raw = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  const features = Array.isArray(raw.features) ? raw.features : [];

  // Bucket features by level.
  const buckets = { state: [], county: [], city: [], other: [] };
  for (const f of features) {
    const lvl = f.properties && f.properties.admin_level;
    const tag = LEVEL_FROM_ADMIN[String(lvl)] || 'other';
    if (tag === 'state' || tag === 'county' || tag === 'city') buckets[tag].push(f);
  }

  // 1. Compute state bbox from the state polygon(s); fall back to union of all.
  let stateGeom = null;
  if (buckets.state.length) {
    stateGeom = mergeRectGeometry(buckets.state);
  }
  // Fallback bbox from all features.
  let bbox;
  if (stateGeom) {
    bbox = bboxAndCenter({ type: 'MultiPolygon', coordinates: stateGeom });
  } else {
    bbox = aggregateBbox(features);
  }
  if (!bbox) throw new Error('No usable geometry to derive bbox');

  // 2. Insert synthetic state region row.
  const stateName = titleCase(state.name);
  const stateInsert = await pool.query(
    `INSERT INTO regions
       (country_code, bbox_south, bbox_west, bbox_north, bbox_east,
        center_lat, center_lon, label, mode, is_state_synthetic, state_code,
        fetched_at)
     VALUES ('us', $1,$2,$3,$4,$5,$6,$7,'state',true,$8, now())
     RETURNING id`,
    [bbox.s, bbox.w, bbox.n, bbox.e, bbox.clat, bbox.clon, stateName, state.code],
  );
  const stateRegionId = stateInsert.rows[0].id;

  // 3. Insert admin_boundary row for state.
  if (stateGeom) {
    // Use first state feature's OSM id if available, otherwise derive a stable
    // synthetic id from the FIPS code (negative to avoid collision with real OSM ids).
    let stateOsmId = null, stateOsmType = 'relation';
    if (buckets.state.length) {
      const { osmId, osmType } = parseOsmId(buckets.state[0]);
      stateOsmId = osmId;
      stateOsmType = osmType;
    }
    if (!Number.isFinite(stateOsmId)) {
      stateOsmId = -parseInt(state.fips, 10); // synthetic, negative
    }
    await pool.query(
      `INSERT INTO admin_boundaries (region_id, osm_id, osm_type, level, name, geom)
       VALUES ($1, $2, $3, 'state', $4, ST_Multi(ST_GeomFromGeoJSON($5)))`,
      [stateRegionId, stateOsmId, stateOsmType, stateName,
       JSON.stringify({ type: 'MultiPolygon', coordinates: stateGeom })],
    );
  }

  // 4. County rows + boundaries.
  const counties = [];
  let dupCounties = 0;
  for (const f of buckets.county) {
    const cb = bboxAndCenter(f.geometry);
    if (!cb) continue;
    const cname = (f.properties && f.properties.name) || null;
    const { osmId, osmType } = parseOsmId(f);
    let countyRegionId = null;
    try {
      const ins = await pool.query(
        `INSERT INTO regions
           (country_code, bbox_south, bbox_west, bbox_north, bbox_east,
            center_lat, center_lon, label, mode, parent_state_region_id, state_code,
            fetched_at)
         VALUES ('us', $1,$2,$3,$4,$5,$6,$7,'county',$8,$9, now())
         RETURNING id`,
        [cb.s, cb.w, cb.n, cb.e, cb.clat, cb.clon, cname, stateRegionId, state.code],
      );
      countyRegionId = ins.rows[0].id;
    } catch (e) {
      if (e.code === '23505') { dupCounties++; continue; } // duplicate bbox
      throw e;
    }
    if (f.geometry) {
      await pool.query(
        `INSERT INTO admin_boundaries (region_id, osm_id, osm_type, level, name, geom)
         VALUES ($1,$2,$3,'county',$4, ST_Multi(ST_GeomFromGeoJSON($5)))`,
        [countyRegionId, osmId, osmType, cname, JSON.stringify(f.geometry)],
      );
    }
    counties.push({ id: countyRegionId, name: cname, osmId, osmType, bbox: [cb.s, cb.w, cb.n, cb.e], center: [cb.clat, cb.clon] });
  }
  if (dupCounties) console.log(`  [loadAdmin] ${dupCounties} duplicate-bbox counties skipped`);

  // 5. City rows + boundaries.
  const cities = [];
  let dupCities = 0;
  for (const f of buckets.city) {
    const cb = bboxAndCenter(f.geometry);
    if (!cb) continue;
    const cname = (f.properties && f.properties.name) || null;
    const { osmId, osmType } = parseOsmId(f);
    let cityRegionId = null;
    try {
      const ins = await pool.query(
        `INSERT INTO regions
           (country_code, bbox_south, bbox_west, bbox_north, bbox_east,
            center_lat, center_lon, label, mode, parent_state_region_id, state_code,
            fetched_at)
         VALUES ('us', $1,$2,$3,$4,$5,$6,$7,'city',$8,$9, now())
         RETURNING id`,
        [cb.s, cb.w, cb.n, cb.e, cb.clat, cb.clon, cname, stateRegionId, state.code],
      );
      cityRegionId = ins.rows[0].id;
    } catch (e) {
      if (e.code === '23505') { dupCities++; continue; }
      throw e;
    }
    if (f.geometry) {
      await pool.query(
        `INSERT INTO admin_boundaries (region_id, osm_id, osm_type, level, name, geom)
         VALUES ($1,$2,$3,'city',$4, ST_Multi(ST_GeomFromGeoJSON($5)))`,
        [cityRegionId, osmId, osmType, cname, JSON.stringify(f.geometry)],
      );
    }
    cities.push({ id: cityRegionId, name: cname, osmId, osmType, center: [cb.clat, cb.clon], bbox: [cb.s, cb.w, cb.n, cb.e] });
  }
  if (dupCities) console.log(`  [loadAdmin] ${dupCities} duplicate-bbox cities skipped`);

  return { stateRegionId, counties, cities };
}

// ---------- helpers ----------

function titleCase(s) {
  return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function aggregateBbox(features) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of features) {
    if (!f.geometry) continue;
    const b = bboxAndCenter(f.geometry);
    if (!b) continue;
    minX = Math.min(minX, b.w); maxX = Math.max(maxX, b.e);
    minY = Math.min(minY, b.s); maxY = Math.max(maxY, b.n);
  }
  if (!isFinite(minX)) return null;
  return { s: minY, w: minX, n: maxY, e: maxX, clat: (minY + maxY) / 2, clon: (minX + maxX) / 2 };
}

/**
 * Naive merge: just collect all coordinates arrays of polygons into one MultiPolygon.
 * Acceptable for OSM admin_level=4 (state) which usually has 1-3 polygons.
 */
function mergeRectGeometry(features) {
  const polys = [];
  for (const f of features) {
    if (!f.geometry) continue;
    if (f.geometry.type === 'Polygon') polys.push(f.geometry.coordinates);
    else if (f.geometry.type === 'MultiPolygon') polys.push(...f.geometry.coordinates);
  }
  return polys;
}

module.exports = { loadAdminBoundaries };

function parseOsmId(feature) {
  // osmium -u type_id emits feature.id like 'n123', 'w456', 'r789'.
  // For polygons it sometimes uses 'a<id>' (closed way that forms an area).
  const id = (feature && feature.id) || '';
  const m = /^([anwr])(\d+)$/i.exec(String(id));
  if (!m) return { osmId: null, osmType: 'relation' };
  const ch = m[1].toLowerCase();
  const t = ch === 'n' ? 'node' : (ch === 'w' || ch === 'a' ? 'way' : 'relation');
  return { osmId: parseInt(m[2], 10), osmType: t };
}