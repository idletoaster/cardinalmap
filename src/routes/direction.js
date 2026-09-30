'use strict';

const express = require('express');
const cfg = require('../../config');
const { queryDirection } = require('../spatial/azimuth');
const { milesToMeters } = require('../util/miles');

const router = express.Router();

// GET /api/direction?lat=&lon=&dir=NE&cats=fuel,convenience
router.get('/direction', async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const dir = String(req.query.dir || '').toUpperCase();
    const cats = req.query.cats ? String(req.query.cats).split(',').filter(Boolean) : null;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: 'invalid lat/lon' });
    }

    const radiusM = milesToMeters(cfg.app.maxRadius);
    const out = await queryDirection({
      lat, lon, direction: dir,
      radiusM,
      categoryIds: cats,
    });
    res.json(out);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

module.exports = router;
