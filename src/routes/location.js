'use strict';

const express = require('express');
const cfg = require('../../config');
const pool = require('../db/pool');
const { ensureRegion } = require('../services/ingestRegion');
const { milesToMeters } = require('../util/miles');

const router = express.Router();

// GET /api/locate?lat=30.27&lon=-97.74&label=Austin%2C%20TX
// Ensures the region for (lat,lon) has fresh Overpass data and returns context.
router.get('/locate', async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const label = req.query.label ? String(req.query.label) : null;
    const force = req.query.force === '1' || req.query.force === 'true';

    if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ error: 'invalid lat/lon' });
    }

    const miles = cfg.app.maxRadius;
    const { region_id, fresh, fetched_at } = await ensureRegion({
      lat, lon, radiusMiles: miles,
      country: cfg.app.countryCode,
      label, force,
    });

    // Look up city + county names for this region.
    const { rows: ctxRows } = await pool.query(
      `SELECT DISTINCT level, name FROM admin_boundaries
       WHERE region_id = $1 AND level IN ('city','county') AND name IS NOT NULL`,
      [region_id]
    );

    const city = ctxRows.find((r) => r.level === 'city')?.name || label;
    const county = ctxRows.find((r) => r.level === 'county')?.name || null;

    res.json({
      region_id,
      fresh,
      fetched_at,
      origin: { lat, lon },
      radius_miles: miles,
      city, county,
      enabled_categories: cfg.poiCategories.filter((c) => c.enabled),
    });
  } catch (e) { next(e); }
});

module.exports = router;
