'use strict';

/**
 * Compute bbox [south, north, west, east] from a GeoJSON Polygon or MultiPolygon.
 * Returns null if the geometry has no coordinates.
 */
function bboxOfGeoJSON(geojson) {
  if (!geojson || !geojson.coordinates) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      const [x, y] = coords;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      return;
    }
    for (const c of coords) walk(c);
  };
  walk(geojson.coordinates);
  if (!Number.isFinite(minX)) return null;
  // Convert to [south, north, west, east] (lat,lat,lon,lon) for storage.
  return { south: minY, north: maxY, west: minX, east: maxX };
}

/**
 * Compute the planar centroid of a Polygon or MultiPolygon using a simple
 * weighted-by-area formula. For our small-city polygon sizes the planar
 * centroid is close enough to a great-circle centroid.
 * Returns { lon, lat } or null.
 */
function centroidOfGeoJSON(geojson) {
  if (!geojson) return null;
  if (geojson.type === 'Polygon') return centroidOfPolygon(geojson.coordinates);
  if (geojson.type === 'MultiPolygon') {
    let best = null;
    let bestArea = -Infinity;
    for (const poly of geojson.coordinates) {
      const c = centroidOfPolygon(poly);
      if (!c) continue;
      if (c.area > bestArea) { bestArea = c.area; best = c; }
    }
    if (!best) return null;
    return { lon: best.lon, lat: best.lat };
  }
  return null;
}

function centroidOfPolygon(rings) {
  if (!rings || !rings.length) return null;
  const outer = rings[0];
  if (!outer || outer.length < 3) return null;
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = outer.length - 1; i < n; i += 1) {
    const [x1, y1] = outer[i];
    const [x2, y2] = outer[i + 1];
    const cross = x1 * y2 - x2 * y1;
    area2 += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(area2) < 1e-12) {
    // Degenerate: average the ring vertices.
    let sx = 0, sy = 0;
    for (const [x, y] of outer) { sx += x; sy += y; }
    return { lon: sx / outer.length, lat: sy / outer.length, area: 0 };
  }
  const a = area2 / 2;
  return { lon: cx / (6 * a), lat: cy / (6 * a), area: Math.abs(a) };
}

module.exports = { bboxOfGeoJSON, centroidOfGeoJSON };