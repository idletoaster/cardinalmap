'use strict';

const { request } = require('undici');
const cfg = require('../../config');
const log = require('../util/logger');

/**
 * Typeahead search. Returns a normalized list of hits.
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
      importance: r.importance,
    }));
}

module.exports = { search };
