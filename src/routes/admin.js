'use strict';

const express = require('express');
const cfg = require('../../config');
const { ensureRegion } = require('../services/ingestRegion');
const pool = require('../db/pool');
const { lookupByOsm } = require('../nominatim/client');

const router = express.Router();

function requireAdmin(req, res, next) {
  const got = req.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(got);
  const token = m ? m[1].trim() : '';
  if (!cfg.adminToken || token !== cfg.adminToken) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// POST /api/admin/refresh  body: { lat, lon, label?, mode?, osm_type?, osm_id? }
router.post('/refresh', requireAdmin, async (req, res, next) => {
  try {
    const { lat, lon, label, osm_type: osmType, osm_id: osmId } = req.body || {};
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return res.status(400).json({ error: 'lat and lon required' });
    }
    let geojson = null;
    let centroid = null;
    if (osmType && osmId) {
      try {
        const place = await lookupByOsm({ osmType, osmId });
        if (place) {
          geojson = place.geojson || null;
          if (geojson) {
            const { centroidOfGeoJSON } = require('../util/polygon');
            centroid = centroidOfGeoJSON(geojson);
          }
        }
      } catch (_) { /* non-fatal */ }
    }
    const out = await ensureRegion({
      lat, lon, radiusMiles: cfg.app.maxRadius,
      country: cfg.app.countryCode,
      label, force: true,
      mode: req.body?.mode === 'county' ? 'county' : 'city',
      geojson, centroid,
    });
    res.json({ ok: true, ...out });
  } catch (e) { next(e); }
});

// GET /api/admin/stats
router.get('/stats', requireAdmin, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT count(*) FROM regions)        AS regions,
        (SELECT count(*) FROM admin_boundaries) AS admin_boundaries,
        (SELECT count(*) FROM neighborhoods)   AS neighborhoods,
        (SELECT count(*) FROM pois)            AS pois,
        (SELECT count(*) FROM poi_categories)  AS categories
    `);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

module.exports = router;
