'use strict';

const express = require('express');
const cfg = require('../../config');
const { search } = require('../nominatim/client');

const router = express.Router();

// GET /api/search?q=austin
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ results: [] });
    const results = await search(q, { countryCodes: cfg.app.countryCode, limit: 8 });
    res.json({ results });
  } catch (e) { next(e); }
});

module.exports = router;
