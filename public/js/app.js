// CardinalMap — main app orchestration.
import { api }         from './api.js';
import { createMap }   from './map.js';
import { createCompass } from './compass.js';
import { createBottomSheet } from './bottomSheet.js';
import { createSearch } from './search.js';

// Default location: Irvine, CA.
const DEFAULT_LOCATION = { lat: 33.6846, lon: -117.8265, label: 'Irvine, CA' };

const state = {
  origin: null,
  originLabel: null,
  regionId: null,
  enabledCats: [],
  catById: {},
  activeDir: null,
  radiusMiles: 10,
  map: null,
  sheet: null,
};

const DIR_BEARING = { N:0, NE:45, E:90, SE:135, S:180, SW:225, W:270, NW:315 };

window.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW reg failed', e));
  }

  const sheet = createBottomSheet(document.getElementById('sheet'));
  state.sheet = sheet;

  const mapApi = createMap({
    container: 'map',
    onStyleChange: (name) => console.log('style ->', name),
  });
  state.map = mapApi;

  createCompass(document.getElementById('compass'), { onChange: handleDirectionChange });
  createSearch(
    document.getElementById('search-input'),
    document.getElementById('search-results'),
    { onPick: handleSearchPick }
  );

  document.getElementById('style-toggle').addEventListener('click', () => {
    const cur = mapApi.currentStyle();
    mapApi.setStyle(cur === 'positron' ? 'dark_liberty' : 'positron');
  });
  document.getElementById('locate-btn').addEventListener('click', requestGeolocation);

  mapApi.onPoiClick((props) => {
    // Popup is rendered by map.js; we just log + (optional) flyTo.
    if (props.lon != null && props.lat != null) state.map.flyTo(props.lon, props.lat, 16);
  });

  // Boot to Irvine, CA.
  sheet.setHeader({ title: DEFAULT_LOCATION.label, subtitle: 'Loading region…', count: 0 });
  sheet.showSkeleton();
  await resolveAndIngest(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.label);
});

async function requestGeolocation() {
  if (!navigator.geolocation) { toast('Geolocation not supported on this device'); return; }
  // Browsers refuse geolocation on insecure origins (anything other than https:// or localhost).
  const origin = window.location.origin;
  const isSecure = window.isSecureContext || origin.startsWith('https://') || origin.startsWith('http://localhost');
  if (!isSecure) {
    toast('Geolocation needs HTTPS or localhost. Open via Cloudflare tunnel or use search.');
    state.sheet.setHeader({ subtitle: 'Open via HTTPS tunnel to enable device location, or use the search bar.' });
    return;
  }
  toast('Locating…');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      await resolveAndIngest(latitude, longitude, 'My location');
    },
    (err) => {
      console.warn('geolocation error', err);
      let msg = 'Location denied';
      if (err.code === err.PERMISSION_DENIED) msg = 'Location permission denied';
      else if (err.code === err.POSITION_UNAVAILABLE) msg = 'Location unavailable';
      else if (err.code === err.TIMEOUT) msg = 'Location request timed out';
      toast(msg + ' — use the search bar instead.');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

async function handleSearchPick(result) {
  await resolveAndIngest(result.lat, result.lon, result.display_name.split(',')[0]);
}

async function resolveAndIngest(lat, lon, label) {
  state.origin = { lat, lon };
  state.originLabel = label;
  state.map.flyTo(lon, lat, 12);
  state.sheet.setHeader({ title: label, subtitle: 'Fetching OSM data…' });
  state.sheet.showSkeleton();
  state.map.setPOIs(null);
  state.map.setNeighborhoods(null);
  state.map.setWedge(null);

  try {
    const ctx = await api.locate(lat, lon, label);
    state.regionId = ctx.region_id;
    state.enabledCats = ctx.enabled_categories;
    state.catById = Object.fromEntries(ctx.enabledCats.map((c) => [c.id, c]));
    state.radiusMiles = ctx.radius_miles || 10;

    state.sheet.setHeader({
      title: label,
      subtitle: ctx.fresh ? 'Cached data' : 'Fresh data just loaded',
      count: 0,
    });

    if (state.activeDir) await applyDirection(state.activeDir);
    else {
      state.sheet.setHeader({ subtitle: `${state.enabledCats.length} categories ready · pick a direction on the compass`, count: 0 });
      state.sheet.render([], () => {});
    }
  } catch (e) {
    console.error(e);
    state.sheet.setHeader({ title: label, subtitle: 'Failed: ' + e.message, count: 0 });
    toast('Failed to load: ' + e.message);
  }
}

async function handleDirectionChange(dir) {
  state.activeDir = dir;
  if (!state.origin) return;
  if (!dir) {
    state.map.setWedge(null);
    state.map.setPOIs(null);
    state.sheet.setHeader({ subtitle: 'Direction cleared · pick another direction' });
    state.sheet.render([], () => {});
    return;
  }
  await applyDirection(dir);
}

async function applyDirection(dir) {
  state.sheet.showSkeleton();
  const { lat, lon } = state.origin;
  try {
    const data = await api.direction(lat, lon, dir, state.enabledCats.map((c) => c.id));
    const pois = (data.pois || []).map((p) => ({
      ...p,
      color: state.catById[p.category_id]?.color || '#888',
      distance_miles: p.distance_m != null ? p.distance_m / 1609.344 : null,
    }));
    const fc = {
      type: 'FeatureCollection',
      features: pois.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: p,
      })),
    };
    state.map.setWedge(wedgeFC(lat, lon, dir, state.radiusMiles));
    state.map.setPOIs(fc);
    state.map.fitTo(fc);
    state.sheet.setHeader({
      subtitle: `${dir} • ${data.count} result${data.count === 1 ? '' : 's'} within ${state.radiusMiles} mi`,
    });
    state.sheet.render(pois, (p) => state.map.flyTo(p.lon, p.lat, 16));
  } catch (e) {
    console.error(e);
    state.sheet.setHeader({ subtitle: 'Query failed: ' + e.message });
    toast('Query failed: ' + e.message);
  }
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 2800);
}

// Build a 45-degree wedge polygon as GeoJSON. Radius is in miles and matches the
// configured search radius so the wedge visually matches the area being queried.
function wedgeFC(lat, lon, dir, radiusMiles) {
  const bearing = DIR_BEARING[dir];
  const rDeg = milesToLatDeg(radiusMiles);
  const steps = 24;
  const coords = [[lon, lat]];
  for (let i = 0; i <= steps; i++) {
    const a = bearing - 22.5 + (45 * i / steps);
    coords.push(offsetLonLat(lon, lat, a, rDeg));
  }
  coords.push([lon, lat]);
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} }],
  };
}

const EARTH_RADIUS_M = 6371008.8;
function milesToLatDeg(mi) { return (mi * 1609.344 / EARTH_RADIUS_M) * (180 / Math.PI); }

function offsetLonLat(lon, lat, bearingDeg, distDeg) {
  const b = (bearingDeg * Math.PI) / 180;
  return [lon + distDeg * Math.sin(b), lat + distDeg * Math.cos(b)];
}
