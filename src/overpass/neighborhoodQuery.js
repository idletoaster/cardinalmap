'use strict';

const { bboxToOverpass } = require('./bbox');
const { runOverpass } = require('./client');
const { relationToMultiPolygon } = require('./regionQuery');

/**
 * Fetch neighborhood polygons (place=neighbourhood, suburb, quarter, borough).
 */
async function fetchNeighborhoods(bbox) {
  const box = bboxToOverpass(bbox);
  const q = `
[out:json][timeout:60];
(
  way["place"~"^(neighbourhood|suburb|quarter|borough)$"]["name"](${box});
  relation["place"~"^(neighbourhood|suburb|quarter|borough)$"]["name"](${box});
);
out geom;
`.trim();
  const elements = await runOverpass(q);

  return elements.map((el) => {
    if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 4) {
      const ring = el.geometry.map((p) => [p.lon, p.lat]);
      return {
        osm_id: el.id,
        osm_type: 'way',
        name: el.tags?.name || null,
        geom: { type: 'Polygon', coordinates: [ring] },
      };
    }
    if (el.type === 'relation') {
      const mp = relationToMultiPolygon(el);
      if (!mp) return null;
      return {
        osm_id: el.id,
        osm_type: 'relation',
        name: el.tags?.name || null,
        geom: mp,
      };
    }
    return null;
  }).filter(Boolean);
}

module.exports = { fetchNeighborhoods };
