'use strict';

const { bboxToOverpass } = require('./bbox');
const { runOverpass } = require('./client');

/**
 * Fetch city + county + state administrative boundaries within bbox.
 * Returns GeoJSON-like array of {osm_id, osm_type, level, name, geom}.
 */
async function fetchAdminBoundaries(bbox) {
  const box = bboxToOverpass(bbox);
  const q = `
[out:json][timeout:60];
(
  relation["boundary"="administrative"]["admin_level"~"^(4|5|6|7|8)$"]["name"](${box});
);
out geom;
`.trim();
  const elements = await runOverpass(q);

  return elements.map((el) => {
    const lvl = el.tags?.admin_level;
    let level = 'city';
    if (lvl === '4') level = 'state';
    else if (lvl === '6') level = 'county';
    return {
      osm_id: el.id,
      osm_type: el.type,
      level,
      name: el.tags?.name || null,
      geom: relationToMultiPolygon(el),
    };
  }).filter((r) => r.geom);
}

function relationToMultiPolygon(el) {
  // Overpass `out geom` on a relation returns members with geometry points.
  // We assemble outer rings and any inner rings as a single MultiPolygon.
  if (el.type !== 'relation') return null;
  const outers = [];
  const inners = [];
  for (const m of el.members || []) {
    if (m.type !== 'way' || !Array.isArray(m.geometry)) continue;
    const ring = m.geometry.map((p) => [p.lon, p.lat]);
    if (ring.length < 4) continue;
    if (m.role === 'inner') inners.push(ring);
    else outers.push(ring); // 'outer' or undefined role
  }
  if (!outers.length) return null;
  // Simple polygon assembly: pair each outer with all inners.
  const polygons = outers.map((outer) => [outer, ...inners]);
  return { type: 'MultiPolygon', coordinates: polygons };
}

module.exports = { fetchAdminBoundaries };
