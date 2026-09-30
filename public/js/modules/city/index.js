// city module - selectCity / selectCounty, boundary persistence. v1.2.0
// v1.2.0: smart-county on level toggle — remove dead state guard that was
//          blocking the user-driven toggle (level:change fires AFTER state
//          is already set, so state.get('level') === 'county' was always true
//          by the time the handler ran). Now keyed off event source so
//          selectCounty's internal state.set doesn't trigger a re-run.
// v1.1.0: smart-county on level toggle — when level flips to 'county' AND a city
//          is currently selected, automatically reverse-geocode the city center
//          (via api.reverseToCounty) and select the containing county.
export const name = 'city';
export const version = '1.2.0';
export const deps = ['map', 'state', 'events', 'api', 'toast'];

function centroidOf(fc) {
  if (!fc?.features?.length) return [0, 0];
  let bestRing = null;
  let bestArea = -1;
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates]
                : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      const ring = poly?.[0];
      if (!ring || ring.length < 4) continue;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of ring) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      const area = (maxX - minX) * (maxY - minY);
      if (area > bestArea) { bestArea = area; bestRing = ring; }
    }
  }
  if (!bestRing) return [0, 0];
  let sx = 0, sy = 0;
  for (const [x, y] of bestRing) { sx += x; sy += y; }
  return [sx / bestRing.length, sy / bestRing.length];
}

export function init({ app, events, state, log }) {
  const api = app.get('api');
  const toast = app.get('toast');

  async function autoCountyFromCity() {
    const cur = state.get('city');
    if (!cur || !cur.feature || !api?.reverseToCounty) return;
    const lat = parseFloat(cur.feature.lat);
    const lon = parseFloat(cur.feature.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    try {
      const r = await api.reverseToCounty(cur.feature);
      if (r?.boundary) {
        // Set level to county FIRST via state.set (no level:change event
        // emitted by StateStore), then call selectCounty which updates the
        // boundary source + emits city:selected.
        state.set({ level: 'county' });
        await selectCounty(r.feature, r.boundary);
        if (r.county_name) toast?.toast?.(`Showing ${r.county_name}`, 'info');
      } else {
        toast?.toast?.('No county boundary found for this city', 'error');
      }
    } catch (e) {
      log?.(`auto-county failed: ${e?.message || e}`);
      toast?.toast?.('Could not load county boundary', 'error');
    }
  }

  // When the user toggles level to county, auto-resolve from the current city.
  // The level module emits 'level:change' AFTER state.level has already been
  // set, so we key off `source` instead of checking state.level. selectCounty
  // does NOT emit 'level:change', so this handler only fires on user clicks.
  events.on('level:change', ({ level, source }) => {
    if (level !== 'county') return;
    if (source && source !== 'user') return;
    autoCountyFromCity();
  });
  async function selectCity(feature, boundary) {
    if (!feature || !boundary) return;
    boundary._center = centroidOf(boundary);
    state.set({
      level: 'city',
      city: { id: feature.id, name: feature.properties?.name, feature, boundary },
      boundary,
      direction: null,
      wedgeFC: null,
      poisFC: null,
      viewMode: 'city',
    });
    const mapApi = app.get('map');
    if (mapApi) {
      mapApi.setSource('boundary', boundary);
      mapApi.fitToBoundary(boundary, { duration: 800 });
    }
    events.emit('city:selected', { level: 'city', feature, boundary });
    log?.(`city selected ${feature.properties?.name}`);
  }

  async function selectCounty(feature, boundary) {
    if (!feature || !boundary) return;
    boundary._center = centroidOf(boundary);
    state.set({
      level: 'county',
      city: { id: feature.id, name: feature.properties?.name, feature, boundary },
      boundary,
      direction: null,
      wedgeFC: null,
      poisFC: null,
      viewMode: 'city',
    });
    const mapApi = app.get('map');
    if (mapApi) {
      mapApi.setSource('boundary', boundary);
      mapApi.fitToBoundary(boundary, { duration: 800 });
    }
    events.emit('city:selected', { level: 'county', feature, boundary });
    log?.(`county selected ${feature.properties?.name}`);
  }

  // re-apply boundary when style changes (Bug 1)
  events.on('map:styledata:ready', () => {
    const b = state.get('boundary');
    const mapApi = app.get('map');
    if (b && mapApi) mapApi.setSource('boundary', b);
  });

  return { selectCity, selectCounty };
}

export default { name, version, deps, init };