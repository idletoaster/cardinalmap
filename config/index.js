'use strict';

const path = require('path');
const fs = require('fs');

// Load .env if present (dotenv loaded by server.js)
function envInt(name, fallback) {
  const v = process.env[name];
  if (v == null || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
function envFloat(name, fallback) {
  const v = process.env[name];
  if (v == null || v === '') return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}
function envStr(name, fallback) {
  const v = process.env[name];
  return v == null || v === '' ? fallback : v;
}

const cfg = {
  port: envInt('PORT', 3000),
  nodeEnv: envStr('NODE_ENV', 'production'),
  publicOrigin: envStr('PUBLIC_ORIGIN', ''),
  pg: {
    host: envStr('PGHOST', '127.0.0.1'),
    port: envInt('PGPORT', 5432),
    user: envStr('PGUSER', 'cardinalmap'),
    password: envStr('PGPASSWORD', 'cardinalmap_dev_pw'),
    database: envStr('PGDATABASE', 'cardinalmap'),
  },
  adminToken: envStr('ADMIN_TOKEN', ''),
  nominatim: {
    baseUrl: envStr('NOMINATIM_BASE_URL', 'https://nominatim.openstreetmap.org'),
    userAgent: envStr('NOMINATIM_USER_AGENT', 'CardinalMap/1.0'),
  },
  overpass: {
    baseUrl: envStr('OVERPASS_BASE_URL', 'https://overpass-api.de/api'),
    userAgent: envStr('OVERPASS_USER_AGENT', 'CardinalMap/1.0'),
  },
  app: {
    countryCode: envStr('APP_COUNTRY_CODE', 'us'),
    distanceUnit: envStr('APP_DISTANCE_UNIT', 'miles'),
    maxRadius: envFloat('APP_MAX_RADIUS_MILES', 10),
    minRadius: envFloat('APP_MIN_RADIUS_MILES', 5),
    cacheTtlDays: envInt('APP_CACHE_TTL_DAYS', 30),
  },
};

// Clamp radius to the supported 5..10 mile band
cfg.app.maxRadius = Math.min(10, Math.max(5, cfg.app.maxRadius));
cfg.app.minRadius = Math.min(cfg.app.maxRadius, Math.max(1, cfg.app.minRadius));

// Load POI categories
const categoriesPath = path.join(__dirname, 'poi-categories.json');
const catData = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
cfg.poiCategories = catData.categories;

module.exports = cfg;
