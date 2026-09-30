'use strict';

// 8 compass directions. Bearing is degrees clockwise from true north.
// Each direction spans a 45deg wedge centered on its axis, with neighbors wrapping at N.
//
//   N  : 337.5 .. 22.5   (wraps 0)
//   NE : 22.5  .. 67.5
//   E  : 67.5  .. 112.5
//   SE : 112.5 .. 157.5
//   S  : 157.5 .. 202.5
//   SW : 202.5 .. 247.5
//   W  : 247.5 .. 292.5
//   NW : 292.5 .. 337.5
//
// Where the wedge straddles 0/360 (only N), the WHERE clause uses two BETWEENs.
// The SQL builder handles that automatically via { wraps: true }.

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const AXIS_BEARING = {
  N:   0,
  NE:  45,
  E:   90,
  SE:  135,
  S:   180,
  SW:  225,
  W:   270,
  NW:  315,
};

const HALF = 22.5;

function getSectors() {
  return DIRECTIONS.map((dir) => {
    const axis = AXIS_BEARING[dir];
    let low = axis - HALF;
    let high = axis + HALF;
    let wraps = false;
    if (low < 0)   { low += 360; wraps = true; }
    if (high > 360) { high -= 360; wraps = true; }
    return { dir, axis, low, high, wraps };
  });
}

function sectorFor(dir) {
  return getSectors().find((s) => s.dir === dir) || null;
}

function isValidDirection(dir) {
  return Object.prototype.hasOwnProperty.call(AXIS_BEARING, dir);
}

module.exports = { DIRECTIONS, AXIS_BEARING, sectorFor, isValidDirection, getSectors };
