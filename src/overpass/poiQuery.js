'use strict';

const { bboxToOverpass } = require('./bbox');
const { runOverpass } = require('./client');
const log = require('../util/logger');

/**
 * Build an Overpass QL query for a single POI category, restricted to bbox.
 */
async function fetchPOIsForCategory(cat, bbox) {
  const box = bboxToOverpass(bbox);
  const selectors = cat.overpass.selectors
    .map(([k, v]) => `nwr["${k}"="${v}"](${box});`)
    .join('\n  ');

  const q = `
[out:json][timeout:60];
(
  ${selectors}
);
out center;
`.trim();

  log.info('overpass: poi query', { category: cat.id, bbox: box, query: q.replace(/\s+/g, ' ').slice(0, 240) });
  const elements = await runOverpass(q);
  log.info('overpass: poi result', { category: cat.id, count: elements.length });
  return elements.map((el) => {
    let lat, lon;
    if (el.type === 'node') { lat = el.lat; lon = el.lon; }
    else if (el.lat != null && el.lon != null) { lat = el.lat; lon = el.lon; }
    else return null;

    return {
      category_id: cat.id,
      osm_id: el.id,
      osm_type: el.type,
      lat,
      lon,
      tags: el.tags || {},
    };
  }).filter(Boolean);
}

module.exports = { fetchPOIsForCategory };
