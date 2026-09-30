'use strict';

// azimuth.js - ST_Azimuth 8-direction spatial query. v1.2.0 (lottery-priority dedup).
// v1.2.0: when the same OSM feature is tagged under multiple categories
//          (e.g. amenity=fuel + lottery=yes), prefer the lottery_* row over
//          the generic category. This way a gas station that sells lottery
//          shows up as "Lottery" not "Gas Station" — matching what the user
//          is actually looking for. Closest distance breaks remaining ties.

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
  // DISTINCT ON (osm_type, osm_id) collapses duplicates where the same
  // physical OSM feature is tagged under multiple categories (e.g. a
  // Starbucks tagged amenity=cafe AND shop=beverages). Ordering by
  // distance_m ASC picks the closest row; for ties we prefer more specific
  // categories over generic ones.
  const sql = `
    WITH origin AS (
      SELECT
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography AS origin_geog,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)         AS origin_pt
    ),
    ranked AS (
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
        ST_Distance(origin.origin_geog, p.geom::geography)         AS distance_m,
        ROW_NUMBER() OVER (
          PARTITION BY p.osm_type, p.osm_id
          ORDER BY
            -- Lottery categories win duplicates so a fuel/convenience store
            -- tagged lottery=yes surfaces as a lottery retailer, not as fuel.
            CASE WHEN p.category_id LIKE 'lottery%' THEN 0 ELSE 1 END ASC,
            ST_Distance(origin.origin_geog, p.geom::geography) ASC,
            p.id ASC
        ) AS rn
      FROM pois p, origin
      WHERE ST_DWithin(p.geom::geography, origin.origin_geog, $3)
        AND ${bearingFilter}
        ${categoryFilter}
    )
    SELECT
      id, osm_id, osm_type, category_id, name, brand, address,
      city, state, postcode, phone, website, opening_hours,
      lat, lon, bearing, distance_m
    FROM ranked
    WHERE rn = 1
    ORDER BY distance_m ASC
    LIMIT 500;
  `;

  const { rows } = await pool.query(sql, params);
  return { direction, count: rows.length, pois: rows };
}

module.exports = { queryDirection };
