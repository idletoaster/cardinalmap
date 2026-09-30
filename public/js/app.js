// CardinalMap — main app orchestration.
import { api }         from './api.js';
import { createMap }   from './map.js';
import { createCompass } from './compass.js';
import { createBottomSheet } from './bottomSheet.js';
import { createSearch } from './search.js';

const state = {
  origin: null,           // {lat, lon}
  originLabel: null,
  regionId: null,
  enabledCats: [],
  catById: {},
  activeDir: null,
  map: null,
  sheet: null,
};

// Map of OSM direction -> bearing degrees (used to build wedge polygons).
const DIR_BEARING = { N:0, NE:45, E:90, SE:135, S:180, SW:225, W:270, NW:315 };

// ----- bootstrap -----
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
    // Could pop a MapLibre popup; for now, focus the list row.
    console.log('poi', props);
  });

  // Default: Austin, TX.
  sheet.setHeader({ title: 'Austin, TX', subtitle: 'Loading region…', count: 0 });
  sheet.showSkeleton();
  await resolveAndIngest(30.2672, -97.7431, 'Austin, TX');
});

async function requestGeolocation() {
  if (!navigator.geolocation) { toast('Geolocation not supported'); return; }
  toast('Locating…');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      await resolveAndIngest(latitude, longitude, 'My location');
    },
    (err) => { toast('Location denied: ' + err.message); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

async function handleSearchPick(result) {
  await resolveAndIngest(result.lat, result.lon, result.display_name.split(',')[0]);
}

// ----- core flow -----
async function resolveAndIngest(lat, lon, label) {
  state.origin = { lat, lon };
  state.originLabel = label;
  state.map.flyTo(lon, lat, 13);
  state.sheet.setHeader({ title: label, subtitle: 'Fetching OSM data…' });
  state.sheet.showSkeleton();

  try {
    const ctx = await api.locate(lat, lon, label);
    state.regionId = ctx.region_id;
    state.enabledCats = ctx.enabled_categories;
    state.catById = Object.fromEntries(ctx.enabled_categories.map((c) => [c.id, c]));

    state.sheet.setHeader({
      title: label,
      subtitle: ctx.fresh ? 'Cached data' : 'Fresh data just loaded',
      count: 0,
    });

    // Re-render with no direction filter (or keep current).
    if (state.activeDir) await applyDirection(state.activeDir);
    else { state.map.setPOIs(null); state.map.setNeighborhoods(null); state.map.setWedge(null); state.sheet.render([]); }
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
    state.sheet.showSkeleton();
    state.map.setPOIs(null);
    state.sheet.render([]);
    return;
  }
  await applyDirection(dir);
}

async function applyDirection(dir) {
  state.sheet.showSkeleton();
  const { lat, lon } = state.origin;
  try {
    const data = await api.direction(lat, lon, dir, state.enabledCats.map((c) => c.id));
    // Tag each POI with its category color.
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
    state.map.setPOIs(fc);
    state.map.setWedge(wedgeFC(lat, lon, dir));
    state.map.fitTo(fc);
    state.sheet.setHeader({
      subtitle: `${dir} • ${data.count} result${data.count === 1 ? '' : 's'}`,
    });
    state.sheet.render(pois, (p) => state.map.flyTo(p.lon, p.lat, 16));
  } catch (e) {
    console.error(e);
    state.sheet.setHeader({ subtitle: 'Query failed: ' + e.message });
    toast('Query failed: ' + e.message);
  }
}

// ----- helpers -----
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 2400);
}

// Build a 45-degree wedge polygon (centered on bearing DIR_BEARING[dir]) as GeoJSON.
function wedgeFC(lat, lon, dir) {
  const bearing = DIR_BEARING[dir];
  const radiusDeg = 0.06; // ~6-7km at equator; scaled visually on map
  const steps = 16;
  const coords = [[lon, lat]];
  for (let i = 0; i <= steps; i++) {
    const a = bearing - 22.5 + (45 * i / steps);
    coords.push(offsetLonLat(lon, lat, a, radiusDeg));
  }
  coords.push([lon, lat]);
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} }],
  };
}

function offsetLonLat(lon, lat, bearingDeg, distDeg) {
  const b = (bearingDeg * Math.PI) / 180;
  return [lon + distDeg * Math.sin(b), lat + distDeg * Math.cos(b)];
}
