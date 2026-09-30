'use strict';

const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/poi/:id  -> detail for a single cached POI
router.get('/poi/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
    const { rows } = await pool.query(
      `SELECT id, category_id, osm_id, osm_type, name, brand, address, city, state,
              postcode, phone, website, opening_hours,
              ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon
         FROM pois WHERE id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

module.exports = router;
