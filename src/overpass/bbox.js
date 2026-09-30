'use strict';

// Compute a square bounding box (lat, lon corners) centered on (lat, lon) with given radius.
// The radius is the radius of a CIRCLE inscribed in the bbox, so the bbox side length is 2*radius.
// Distance conversion uses a simple equirectangular approximation, which is acceptable for radii
// up to ~50 miles and avoids pulling in a heavy geo lib.
const EARTH_RADIUS_M = 6371008.8;

function metersToLat(m) { return (m / EARTH_RADIUS_M) * (180 / Math.PI); }
function metersToLon(m, atLat) {
  return (m / EARTH_RADIUS_M) * (180 / Math.PI) / Math.cos((atLat * Math.PI) / 180);
}

/**
 * Compute bbox {south, west, north, east} from center + radius_m.
 */
function bboxFromCenter(lat, lon, radiusM) {
  const dLat = metersToLat(radiusM);
  const dLon = metersToLon(radiusM, lat);
  return {
    south: lat - dLat,
    north: lat + dLat,
    west:  lon - dLon,
    east:  lon + dLon,
  };
}

/**
 * Convert a bbox to a PostGIS BOX literal.
 */
function bboxToPostgresBox(b) {
  return `BOX(${(b.west).toFixed(7)},${(b.south).toFixed(7)},${(b.east).toFixed(7)},${(b.north).toFixed(7)})`;
}

/**
 * Format bbox for Overpass QL [S,W,N,E].
 */
function bboxToOverpass(b) {
  return `${b.south.toFixed(6)},${b.west.toFixed(6)},${b.north.toFixed(6)},${b.east.toFixed(6)}`;
}

module.exports = { bboxFromCenter, bboxToPostgresBox, bboxToOverpass };
