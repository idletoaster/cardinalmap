'use strict';

const { request } = require('undici');
const cfg = require('../../config');
const log = require('../util/logger');

// City/place-level vs county/region-level. Used to choose the polygon level when rendering.
//
// Nominatim returns admin boundaries under type=administrative / class=boundary regardless of
// whether they represent a city, county, or state. The reliable disambiguator is the
// extratags.admin_level value (6 = city/town, 8 = neighbourhood, 4 = county, 2 = state).
// We fall back to type names when admin_level is missing.
const ADMIN_LEVEL_CITY    = new Set([6, 7, 8, 9, 10]);   // city / town / village / suburb / neighbourhood
const ADMIN_LEVEL_COUNTY  = new Set([3, 4, 5]);          // region / county / state-district
const COUNTY_TYPE_FALLBACK = new Set(['county', 'state', 'region']);

/**
 * Classify a Nominatim result as 'city' or 'county' based on admin_level (preferred),
 * falling back to type/class/category.
 */
function classifyLevel(r) {
  const al = parseAdminLevel(r);
  if (al != null) {
    if (ADMIN_LEVEL_COUNTY.has(al)) return 'county';
    if (ADMIN_LEVEL_CITY.has(al))   return 'city';
  }
  const t = (r.type || '').toLowerCase();
  if (COUNTY_TYPE_FALLBACK.has(t)) return 'county';
  return 'city';
}

function parseAdminLevel(r) {
  const v = r?.extratags?.admin_level ?? r?.extratags?.['admin_level'];
  if (v == null) return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Typeahead search. Returns a normalized list of hits, including the polygon
 * (when Nominatim returns one — small places often don't), the place_id, and
 * the auto-detected level (city|county).
 *
 * @param {string} q
 * @param {object} [opts]
 * @param {string} [opts.countryCodes]  ISO-3166 alpha-2 country codes, comma-separated (e.g. 'us')
 * @param {number} [opts.limit=8]
 */
async function search(q, { countryCodes, limit = 8 } = {}) {
  if (!q || q.length < 2) return [];

  const params = new URLSearchParams({
    q,
    format: 'json',
    addressdetails: '1',
    limit: String(limit),
    'accept-language': 'en',
    // polygon_geojson=1 returns the boundary polygon when available (small villages may not have one).
    polygon_geojson: '1',
    // extratags=1 gives us admin_level so we can classify city vs county reliably.
    extratags: '1',
    namedetails: '1',
  });
  if (countryCodes) params.set('countrycodes', countryCodes);

  const url = cfg.nominatim.baseUrl.replace(/\/$/, '') + '/search?' + params.toString();

  const res = await request(url, {
    method: 'GET',
    headers: { 'User-Agent': cfg.nominatim.userAgent, 'Accept': 'application/json' },
  });
  const text = await res.body.text();

  if (res.statusCode !== 200) {
    log.warn('nominatim non-200', { status: res.statusCode, q });
    return [];
  }

  let arr;
  try { arr = JSON.parse(text); }
  catch (e) { log.warn('nominatim bad json', { q }); return []; }

  // Keep only city/county/state-ish results.
  const allowed = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'county', 'state', 'administrative']);
  return arr
    .filter((r) => allowed.has(r.type) || allowed.has(r.category))
    .map((r) => ({
      display_name: r.display_name,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      type: r.type,
      category: r.category,
      class: r.class,
      importance: r.importance,
      place_id: r.place_id,
      osm_type: r.osm_type,
      osm_id: r.osm_id,
      level: classifyLevel(r),
      extratags: r.extratags || null,
      bbox: r.boundingbox ? [
        parseFloat(r.boundingbox[0]),
        parseFloat(r.boundingbox[2]),
        parseFloat(r.boundingbox[1]),
        parseFloat(r.boundingbox[3]),
      ] : null, // [south, north, west, east]
      geojson: r.geojson || null,
    }));
}

/**
 * Look up a single place by OSM type+id and return its polygon + center.
 * Returns null if not found.
 */
async function lookupByOsm({ osmType, osmId }) {
  if (!osmType || !osmId) return null;
  // Nominatim's /lookup expects a single `osm_ids` query param in the form
  // "<type-prefix><id>" (e.g. "R114485" for relation 114485, "N51970603" for
  // node 51970603). The separate `osm_type` + `osm_id` query params return [].
  const prefix = String(osmType).toLowerCase().startsWith('r') ? 'R'
                : String(osmType).toLowerCase().startsWith('w') ? 'W'
                : String(osmType).toLowerCase().startsWith('n') ? 'N'
                : null;
  if (!prefix) return null;
  const params = new URLSearchParams({
    osm_ids: `${prefix}${osmId}`,
    format: 'json',
    polygon_geojson: '1',
    'accept-language': 'en',
    extratags: '1',
    namedetails: '1',
  });
  const url = `${cfg.nominatim.baseUrl.replace(/\/$/, '')}/lookup?${params}`;

  const res = await request(url, {
    method: 'GET',
    headers: { 'User-Agent': cfg.nominatim.userAgent, 'Accept': 'application/json' },
  });
  const text = await res.body.text();
  if (res.statusCode !== 200) {
    log.warn('nominatim lookup non-200', { status: res.statusCode, osmType, osmId });
    return null;
  }
  let arr;
  try { arr = JSON.parse(text); }
  catch (e) { log.warn('nominatim lookup bad json', { osmType, osmId }); return null; }
  const r = Array.isArray(arr) ? arr[0] : null;
  if (!r || !r.place_id) {
    log.warn('nominatim lookup empty', { osmType, osmId });
    return null;
  }
  return {
    display_name: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    type: r.type,
    category: r.category,
    class: r.class,
    place_id: r.place_id,
    osm_type: r.osm_type,
    osm_id: r.osm_id,
    level: classifyLevel(r),
    extratags: r.extratags || null,
    bbox: r.boundingbox ? [
      parseFloat(r.boundingbox[0]),
      parseFloat(r.boundingbox[2]),
      parseFloat(r.boundingbox[1]),
      parseFloat(r.boundingbox[3]),
    ] : null,
    geojson: r.geojson || null,
  };
}

/**
 * Reverse-geocode a point and return the admin boundary at the requested level.
 * Uses Nominatim's reverse endpoint with zoom hint + extratags so the response
 * matches an admin_level 4 (county) or 6 (city) polygon.
 *
 * @param {object}  p            { lat, lon }
 * @param {number}  zoom         Nominatim zoom: 3=country, 5=state, 8=county, 10=city, 14=suburb
 * @param {number}  [adminLevel] Optional admin_level filter (server-side, via /search)
 */
async function reverse({ lat, lon, zoom = 8 }) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'json',
    polygon_geojson: '1',
    extratags: '1',
    zoom: String(zoom),
    'accept-language': 'en',
  });
  const url = cfg.nominatim.baseUrl.replace(/\/$/, '') + '/reverse?' + params.toString();
  const res = await request(url, {
    method: 'GET',
    headers: { 'User-Agent': cfg.nominatim.userAgent, 'Accept': 'application/json' },
  });
  const text = await res.body.text();
  if (res.statusCode !== 200) {
    log.warn('nominatim reverse non-200', { status: res.statusCode });
    return null;
  }
  let r;
  try { r = JSON.parse(text); }
  catch (_) { return null; }
  if (!r || !r.place_id) return null;
  return {
    display_name: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    type: r.type,
    category: r.category,
    class: r.class,
    place_id: r.place_id,
    osm_type: r.osm_type,
    osm_id: r.osm_id,
    level: classifyLevel(r),
    extratags: r.extratags || null,
    bbox: r.boundingbox ? [
      parseFloat(r.boundingbox[0]),
      parseFloat(r.boundingbox[2]),
      parseFloat(r.boundingbox[1]),
      parseFloat(r.boundingbox[3]),
    ] : null,
    geojson: r.geojson || null,
  };
}

module.exports = { search, lookupByOsm, reverse, classifyLevel };
