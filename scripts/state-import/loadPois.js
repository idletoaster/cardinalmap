// scripts/state-import/loadPois.js
// Reads GeoJSON FeatureCollection of POIs and inserts into pois table.
// Each POI is associated with the smallest city/region that contains its point
// (so /api/search and POI queries are bounded to a region).
'use strict';

const fs = require('fs');

const POI_KEYS = ['name', 'shop', 'amenity', 'brand', 'operator', 'lottery', 'addr:street', 'addr:housenumber', 'addr:city', 'addr:state', 'addr:postcode', 'opening_hours', 'phone', 'website'];

/**
 * Map an OSM tag set to a poi_categories.id.
 * - shop=convenience     -> 'convenience'
 * - amenity=fuel         -> 'fuel'
 * - shop=lottery OR lottery=yes -> 'lottery_yes'
 * - brand in lottery_chain brand list -> 'lottery_chain'
 */
function mapCategory(props) {
  if (!props) return null;
  const shop = props.shop;
  const amenity = props.amenity;
  const lottery = props.lottery;
  const brand = props.brand;
  if (lottery === 'yes' || shop === 'lottery') return 'lottery_yes';
  if (amenity === 'fuel') return 'fuel';
  if (shop === 'convenience') return 'convenience';
  if (brand && isLotteryBrand(brand)) return 'lottery_chain';
  return null;
}

const LOTTERY_BRANDS = new Set([
  'CVS', 'Walgreens', 'Albertsons', 'Rite Aid', 'Safeway', 'Vons',
  "Trader Joe's", 'H-E-B', 'Publix', 'Winn-Dixie', '99 Ranch Market', 'H Mart',
]);
function isLotteryBrand(b) { return LOTTERY_BRANDS.has(b); }

/**
 * Load one state's POIs into the DB.
 * pool: pg Pool
 * stateRegionId: id of synthetic state region row
 * cities: array of { id, bbox: [s,w,n,e] } from loadAdminBoundaries
 * geojsonPath: path to GeoJSON FeatureCollection of POIs (Points)
 */
async function loadPOIs(pool, stateRegionId, cities, geojsonPath) {
  if (!fs.existsSync(geojsonPath)) return { inserted: 0, skipped: 0 };
  const raw = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  const features = Array.isArray(raw.features) ? raw.features : [];

  let inserted = 0;
  let skipped = 0;
  const BATCH = 500;
  let buf = [];
  async function flush() {
    if (buf.length === 0) return;
    const valuesSql = [];
    const params = [];
    // Columns (15): region_id, category_id, osm_id, osm_type, name, brand, address,
    //   city, state, postcode, phone, website, opening_hours, state_id, geom
    //   (fetched_at uses DEFAULT now())
    let p = 1;
    for (const r of buf) {
      valuesSql.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},ST_SetSRID(ST_MakePoint($${p++},$${p++}),4326))`);
      params.push(
        r.regionId, r.categoryId, r.osmId, r.osmType,             // 4
        r.name, r.brand, r.address, r.city, r.state, r.postcode, // 6
        r.phone, r.website, r.openingHours,                       // 3
        r.stateRegionId,                                         // 1 state_id
        r.lon, r.lat,                                            // 2 lon/lat for ST_MakePoint
      );                                                         // 16 params, 16 placeholders
    }
    const sql = `INSERT INTO pois
       (region_id, category_id, osm_id, osm_type,
        name, brand, address, city, state, postcode,
        phone, website, opening_hours,
        state_id,
        geom)
     VALUES ${valuesSql.join(',')}
     ON CONFLICT (region_id, category_id, osm_type, osm_id) DO NOTHING`;
    await pool.query(sql, params);
    inserted += buf.length;
    buf = [];
  }

  for (const f of features) {
    const props = (f.properties && typeof f.properties === 'object') ? f.properties : {};
    const categoryId = mapCategory(props);
    if (!categoryId) { skipped++; continue; }
    if (!f.geometry || f.geometry.type !== 'Point') { skipped++; continue; }
    const [lon, lat] = f.geometry.coordinates;
    if (typeof lat !== 'number' || typeof lon !== 'number') { skipped++; continue; }

    // Find smallest city region containing this point.
    let regionId = stateRegionId;
    let cityName = props['addr:city'] || null;
    let stateName = props['addr:state'] || null;
    for (const c of cities) {
      const [s, w, n, e] = c.bbox;
      if (lat >= s && lat <= n && lon >= w && lon <= e) {
        regionId = c.id;
        cityName = cityName || c.name;
        break;
      }
    }

    // osmium -u type_id emits feature.id like 'n123', 'w456', 'r789'.
    const fid = (f && f.id) || '';
    const m = /^([anwr])(\d+)$/i.exec(String(fid));
    if (!m) { skipped++; continue; }
    const ch = m[1].toLowerCase();
    const osmType = ch === 'n' ? 'node' : (ch === 'w' || ch === 'a' ? 'way' : 'relation');
    const osmId = parseInt(m[2], 10);
    if (!Number.isFinite(osmId)) { skipped++; continue; }

    const street = props['addr:street'] || '';
    const house = props['addr:housenumber'] || '';
    const address = (house + ' ' + street).trim() || null;

    buf.push({
      regionId, categoryId, osmId, osmType, stateRegionId,
      name: props.name || props['name:en'] || null,
      brand: props.brand || null,
      address,
      city: cityName,
      state: stateName,
      postcode: props['addr:postcode'] || null,
      phone: props.phone || null,
      website: props.website || null,
      openingHours: props.opening_hours || null,
      lat, lon,
    });
    if (buf.length >= BATCH) await flush();
  }
  await flush();

  return { inserted, skipped };
}

module.exports = { loadPOIs };