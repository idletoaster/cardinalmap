// api module - fetch wrappers + api.version() with caching. v1.1.0
export const name = 'api';
export const version = '1.1.0';
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

  async function cityBoundary(id) {
    const r = await jget(`/api/city/${encodeURIComponent(id)}/boundary`);
    return r.boundary;
  }

  // Fetch POIs in a directional wedge via the /api/direction endpoint.
  // The server applies DISTINCT ON (osm_type, osm_id) so the same physical
  // OSM feature tagged under multiple categories only appears once.
  async function directionPois(lat, lon, dir, opts = {}) {
    const qs = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      dir: String(dir || '').toUpperCase(),
    });
    if (Array.isArray(opts.cats) && opts.cats.length) qs.set('cats', opts.cats.join(','));
    const r = await jget(`/api/direction?${qs.toString()}`);
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
      },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    }));
    return { direction: r.direction, count: features.length, features };
  }

  return { version, search, cityBoundary, directionPois };
}

export default { name, version, deps, init };