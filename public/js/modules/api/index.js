// api module - fetch wrappers + api.version() with caching. v1.2.0
// v1.2.0: add directionPois(lat, lon, dir) — wraps /api/direction and maps the
//          server's `pois[]` array into a GeoJSON FeatureCollection the poi
//          module can consume directly.
// v1.1.0: add reverseToCounty(city) — given a city search-result feature, return
//          the county polygon that contains its centroid. Used by the city
//          module to auto-select the county on level toggle (smart county).
export const name = 'api';
export const version = '1.2.0';
export const deps = [];

const cache = { version: null, versionAt: 0 };
const TTL = 5 * 60 * 1000;

async function jget(path) {
  const r = await fetch(path, { headers: { 'accept': 'application/json' } });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

export function init({ log }) {
  log?.('api ready');

  async function version(force = false) {
    if (!force && cache.version && Date.now() - cache.versionAt < TTL) return cache.version;
    const v = await jget('/api/version');
    cache.version = v;
    cache.versionAt = Date.now();
    return v;
  }

  async function search(q) {
    if (!q || !q.trim()) return [];
    const url = `/api/search?q=${encodeURIComponent(q.trim())}`;
    const r = await jget(url);
    return r.results || [];
  }

  // Load POIs in a given 8-wind sector from (lat, lon). Wraps /api/direction
  // and returns a GeoJSON FeatureCollection so the poi module can hand it
  // straight to map.setSource('pois', ...).
  async function directionPois(lat, lon, dir) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !dir) {
      return { type: 'FeatureCollection', features: [] };
    }
    const url = `/api/direction?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&dir=${encodeURIComponent(dir)}`;
    const r = await jget(url);
    const rows = Array.isArray(r.pois) ? r.pois : [];
    const features = rows.map((p) => ({
      type: 'Feature',
      properties: {
        id: p.id,
        osm_id: p.osm_id,
        osm_type: p.osm_type,
        category_id: p.category_id,
        name: p.name,
        brand: p.brand,
        address: p.address,
        city: p.city,
        state: p.state,
        postcode: p.postcode,
        phone: p.phone,
        website: p.website,
        opening_hours: p.opening_hours,
        bearing: p.bearing,
        distance_m: p.distance_m,
        kind: p.category_id,
      },
      geometry: { type: 'Point', coordinates: [Number(p.lon), Number(p.lat)] },
    }));
    return { type: 'FeatureCollection', features };
  }

  // Given a city search-result { lat, lon, osm_type, osm_id }, ask the server to
  // reverse-geocode at admin_level=4 (county). Returns the county boundary FC +
  // a stub feature so the city module can call selectCounty(stubFeature, fc).
  async function reverseToCounty(city) {
    if (!city) return null;
    const osmType = city.osm_type || 'relation';
    const osmId   = city.osm_id || city.id;
    const url = `/api/locate?lat=${encodeURIComponent(city.lat)}&lon=${encodeURIComponent(city.lon)}&osm_type=${osmType}&osm_id=${osmId}&mode=county`;
    const data = await jget(url);
    const bg = data.boundary_geojson;
    if (!bg) return null;
    const fc = bg.type === 'FeatureCollection'
      ? bg
      : { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: bg }] };
    const stubFeature = {
      id: osmId,
      osm_type: osmType,
      properties: { name: data.county || city.properties?.name || 'County' },
    };
    return { feature: stubFeature, boundary: fc, county_name: data.county };
  }

  return { version, search, directionPois, reverseToCounty };
}

export default { name, version, deps, init };