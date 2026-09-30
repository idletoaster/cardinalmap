'use strict';

const { sectorFor, isValidDirection } = require('./sectors');
const pool = require('../db/pool');

/**
 * ST_Azimuth 8-direction spatial query.
 *
 * @param {object} opts
 * @param {number} opts.lat        Origin latitude (degrees)
 * @param {number} opts.lon        Origin longitude (degrees)
 * @param {string} opts.direction  One of N,NE,E,SE,S,SW,W,NW
 * @param {number} opts.radiusM    Radius in meters (will be clamped by caller)
 * @param {string[]} [opts.categoryIds]  POI category ids to include (null/empty = all)
 */
async function queryDirection({ lat, lon, direction, radiusM, categoryIds }) {
  if (!isValidDirection(direction)) {
    throw Object.assign(new Error('invalid direction'), { status: 400 });
  }
  const sec = sectorFor(direction);

  const params = [lon, lat, radiusM];
  let categoryFilter = '';
  if (Array.isArray(categoryIds) && categoryIds.length > 0) {
    params.push(categoryIds);
    categoryFilter = `AND category_id = ANY($${params.length}::text[])`;
  }

  // Bearing wedge filter. Use the wraps flag to handle the N=337.5..22.5 case.
  // ST_Azimuth returns radians on a sphere, clockwise from north.
  // We compute great-circle bearings on geography for accuracy.
  let bearingFilter;
  if (sec.wraps) {
    bearingFilter = `(degrees(ST_Azimuth(origin_pt, p.geom::geography)) BETWEEN 337.5 AND 360
                  OR degrees(ST_Azimuth(origin_pt, p.geom::geography)) BETWEEN 0 AND 22.5)`;
  } else {
    bearingFilter = `degrees(ST_Azimuth(origin_pt, p.geom::geography)) BETWEEN ${sec.low} AND ${sec.high}`;
  }

  // origin_pt and origin_geog are referenced once per occurrence in the same SELECT.
  // $1=lon, $2=lat, $3=radiusM
  const sql = `
    WITH origin AS (
      SELECT
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography AS origin_geog,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)         AS origin_pt
    )
    SELECT
      p.id,
      p.osm_id,
      p.osm_type,
      p.category_id,
      p.name,
      p.brand,
      p.address,
      p.city,
      p.state,
      p.postcode,
      p.phone,
      p.website,
      p.opening_hours,
      ST_Y(p.geom::geometry) AS lat,
      ST_X(p.geom::geometry) AS lon,
      degrees(ST_Azimuth(origin.origin_geog, p.geom::geography)) AS bearing,
      ST_Distance(origin.origin_geog, p.geom::geography)         AS distance_m
    FROM pois p, origin
    WHERE ST_DWithin(p.geom::geography, origin.origin_geog, $3)
      AND ${bearingFilter}
      ${categoryFilter}
    ORDER BY distance_m ASC
    LIMIT 500;
  `;

  const { rows } = await pool.query(sql, params);
  return { direction, count: rows.length, pois: rows };
}

module.exports = { queryDirection };
