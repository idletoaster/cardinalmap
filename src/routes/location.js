'use strict';
// location routes — /api/locate and /api/region/:id/status.
// v1.1.1: county-mode Nominatim zoom fixed (8 → 9). The Nominatim public
//          endpoint's zoom→admin_level mapping has shifted: zoom=8 now
//          returns a neighbourhood polygon (~57 coords around Downtown San
//          Diego) instead of the county polygon. Using zoom=9 reliably
//          lands on admin_level=6 (US county) and returns the full county
//          polygon (~400–600 coords). Verified against San Diego, Orange,
//          and Los Angeles counties.

const express = require('express');
const cfg = require('../../config');
const pool = require('../db/pool');
const { ensureRegion } = require('../services/ingestRegion');
const { milesToMeters } = require('../util/miles');
const { lookupByOsm, reverse } = require('../nominatim/client');
const { centroidOfGeoJSON } = require('../util/polygon');

const router = express.Router();

/**
 * GET /api/locate?lat&lon&label&place_id&osm_type&osm_id&mode
 *
 *   - If the request specifies an osm_type/osm_id:
 *       mode='city'  → fetch that polygon's boundary (assumed to be a city/place).
 *       mode='county'→ if the OSM hit is already a county, use it; otherwise
 *                      reverse-geocode the lat/lon at zoom=8 to find the
 *                      containing county polygon.
 *   - mode defaults to 'city'.
 *   - Requests without osm ids use the legacy radius-based behavior.
 */
router.get('/locate', async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const label = req.query.label ? String(req.query.label) : null;
    const force = req.query.force === '1' || req.query.force === 'true';
    const mode = req.query.mode === 'county' ? 'county' : 'city';
    const osmType = req.query.osm_type ? String(req.query.osm_type) : null;
    const osmId   = req.query.osm_id   ? String(req.query.osm_id)   : null;

    if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ error: 'invalid lat/lon' });
    }

    let geojson = null;
    let centroid = null;
    let resolvedLabel = label;
    let resolvedOsmType = osmType;
    let resolvedOsmId   = osmId;

    if (osmType && osmId) {
      // First try the direct hit. If the user asked for county but the hit is at
      // city admin_level, reverse-geocode for the county polygon.
      try {
        const place = await lookupByOsm({ osmType, osmId });
        if (place) {
          const placeLevel = place.level || 'city';
          if (mode === 'county' && placeLevel !== 'county') {
            // Hit is a city but user wants county → reverse for containing county.
            // Nominatim zoom=8 maps to neighbourhood (admin_level=10), not county.
            // Use zoom=9 to land on admin_level=6 (the US county level). Tested
            // with San Diego, Orange County, LA County — zoom=9 reliably returns
            // the full county polygon (~400–600 coords). zoom=8 silently returned
            // "Downtown San Diego" (57 coords) on the same coordinates.
            const county = await reverse({ lat, lon, zoom: 9 });
            if (county && county.geojson) {
              geojson = county.geojson;
              centroid = centroidOfGeoJSON(geojson);
              resolvedLabel = label;
              resolvedOsmType = county.osm_type;
              resolvedOsmId   = county.osm_id;
            } else {
              // Fallback: use the city's polygon as-is.
              geojson = place.geojson || null;
              centroid = geojson ? centroidOfGeoJSON(geojson) : null;
            }
          } else if (mode === 'city' && placeLevel !== 'city') {
            // Hit is a county but user wants city → reverse at zoom 10.
            const city = await reverse({ lat, lon, zoom: 10 });
            if (city && city.geojson) {
              geojson = city.geojson;
              centroid = centroidOfGeoJSON(geojson);
              resolvedLabel = label;
              resolvedOsmType = city.osm_type;
              resolvedOsmId   = city.osm_id;
            } else {
              geojson = place.geojson || null;
              centroid = geojson ? centroidOfGeoJSON(geojson) : null;
            }
          } else {
            geojson = place.geojson || null;
            centroid = geojson ? centroidOfGeoJSON(geojson) : null;
            resolvedLabel = label || place.display_name;
          }
        }
      } catch (e) {
        // Non-fatal — fall through to legacy behavior.
      }
    }

    const miles = cfg.app.maxRadius;
    const out = await ensureRegion({
      lat, lon, radiusMiles: miles,
      country: cfg.app.countryCode,
      label, force,
      mode,
      geojson,
      centroid,
    });

    const { rows: ctxRows } = await pool.query(
      `SELECT DISTINCT level, name FROM admin_boundaries
       WHERE region_id = $1 AND level IN ('city','county') AND name IS NOT NULL`,
      [out.region_id]
    );

    const city   = ctxRows.find((r) => r.level === 'city')?.name   || label;
    const county = ctxRows.find((r) => r.level === 'county')?.name || null;

    res.json({
      region_id: out.region_id,
      fresh: out.fresh,
      fetched_at: out.fetched_at,
      origin: { lat: out.centroid.lat, lon: out.centroid.lon }, // polygon centroid — wedge origin
      provided: { lat, lon },                                   // what the user actually clicked
      bbox: out.bbox,
      mode: out.mode,
      resolved_osm: resolvedOsmType && resolvedOsmId
        ? { osm_type: resolvedOsmType, osm_id: resolvedOsmId }
        : null,
      radius_miles: miles,
      city, county,
      enabled_categories: cfg.poiCategories.filter((c) => c.enabled),
      boundary_geojson: geojson || null,
      ingest_status: out.ingest_status || 'pending',
    });
  } catch (e) { next(e); }
});

/**
 * GET /api/region/:id/status
 *   Returns whether the region's Overpass pipeline has finished (so POIs are
 *   queryable). Used by the front-end to poll after a slow first locate.
 */
router.get('/region/:id/status', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
    const { rows } = await pool.query(
      `SELECT id, ingest_status, ingest_error,
              ingest_started_at, ingest_finished_at, fetched_at
         FROM regions WHERE id = $1`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'region not found' });
    const r = rows[0];
    res.json({
      region_id: r.id,
      ingest_status: r.ingest_status,
      ingest_error: r.ingest_error,
      started_at: r.ingest_started_at,
      finished_at: r.ingest_finished_at,
      fetched_at: r.fetched_at,
    });
  } catch (e) { next(e); }
});

module.exports = router;