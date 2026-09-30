// city module - selectCity / selectCounty, boundary persistence. v1.3.0
// v1.3.0: round-trip on level toggle — when level flips back to 'city',
//          restore the city the user originally picked (stored in
//          `rememberedCity` by selectCity). City→county→city now goes back
//          to the original city without a re-search. If no city is in
//          memory, the toggle is a no-op and a toast hints at the cause.
// v1.2.0: smart-county on level toggle — remove dead state guard that was
//          blocking the user-driven toggle (level:change fires AFTER state
//          is already set, so state.get('level') === 'county' was always true
//          by the time the handler ran). Now keyed off event source so
//          selectCounty's internal state.set doesn't trigger a re-run.
// v1.1.0: smart-county on level toggle — when level flips to 'county' AND a city
//          is currently selected, automatically reverse-geocode the city center
//          (via api.reverseToCounty) and select the containing county.
export const name = 'city';
export const version = '1.3.0';
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

// Holds the last user-selected city feature so we can restore it when
// they toggle level back from county -> city. Populated by selectCity();
// NOT cleared by selectCounty() so the round-trip City→County→City works
// even after manual county picks. Module-scope (not init-scope) so it
// survives across the level round-trip and reloads.
let rememberedCity = null;

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

  // Restore the city the user originally picked. Populated by selectCity();
  // persisted across selectCounty() calls so a manual county pick doesn't
  // erase the original city (the whole point of the round-trip).
  async function restoreCityFromMemory() {
    if (!rememberedCity) {
      // User toggled City without ever picking one (e.g., went straight to
      // County from search). Level module already flipped state.level to
      // 'city'; clear stale county data so the map + sheet don't lie.
      toast?.toast?.('No city to restore — search for one first', 'info');
      state.set({ city: null, boundary: null });
      const mapApi = app.get('map');
      if (mapApi?.setSource) {
        try { mapApi.setSource('boundary', { type: 'FeatureCollection', features: [] }); }
        catch (e) { log?.(`clear-boundary failed: ${e?.message || e}`); }
      }
      return;
    }
    try {
      await selectCity(rememberedCity.feature, rememberedCity.boundary);
      log?.(`restored city ${rememberedCity.feature.properties?.name}`);
    } catch (e) {
      log?.(`restore-city failed: ${e?.message || e}`);
      toast?.toast?.('Could not restore previous city', 'error');
    }
  }

  // When the user toggles level to county, auto-resolve from the current city.
  // When they toggle back to city, restore the city they originally picked
  // (held in module-scope `rememberedCity`). The level module emits
  // 'level:change' AFTER state.level has already been set, so we key off
  // `source` instead of checking state.level. selectCity/selectCounty do NOT
  // emit 'level:change', so this handler only fires on user clicks.
  events.on('level:change', ({ level, source }) => {
    if (source && source !== 'user') return;
    if (level === 'county')      autoCountyFromCity();
    else if (level === 'city')   restoreCityFromMemory();
  });
  async function selectCity(feature, boundary) {
    if (!feature || !boundary) return;
    boundary._center = centroidOf(boundary);
    // Remember the city the user actually picked so we can restore it
    // when they toggle from county back to city.
    rememberedCity = { feature, boundary };
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