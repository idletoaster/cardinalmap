// poi module - POI layers, popups, click handler, POI-zoom view-mode.
// Loads POIs for the active direction wedge from /api/direction, dedupes
// defensively on the client, and renders them on the map. v1.1.0
export const name = 'poi';
export const version = '1.1.0';
export const deps = ['map', 'state', 'events', 'api'];

function dedupByOsmId(features) {
  const seen = new Map();
  for (const f of features) {
    const props = f.properties || {};
    const key = props.osm_type && props.osm_id != null
      ? `${props.osm_type}/${props.osm_id}`
      : `name/${props.name}|${f.geometry?.coordinates?.join(',')}`;
    const prior = seen.get(key);
    if (!prior) { seen.set(key, f); continue; }
    // Prefer the row with more populated contact/info.
    const score = (p) =>
      (p.name ? 1 : 0) + (p.brand ? 1 : 0) + (p.phone ? 1 : 0) +
      (p.website ? 1 : 0) + (p.opening_hours ? 1 : 0) + (p.address ? 1 : 0);
    if (score(props) > score(prior.properties || {})) seen.set(key, f);
  }
  return Array.from(seen.values());
}

export function init({ app, events, state, log }) {
  function emptyFC() { return { type: 'FeatureCollection', features: [] }; }
  function setPois(fc) {
    const safe = fc || emptyFC();
    const features = Array.isArray(safe.features) ? safe.features : [];
    const deduped = dedupByOsmId(features);
    const out = { type: 'FeatureCollection', features: deduped };
    state.set({ poisFC: out });
    const mapApi = app.get('map');
    if (mapApi) mapApi.setSource('pois', out);
    if (deduped.length !== features.length) {
      log?.(`poi dedup ${features.length} -> ${deduped.length}`);
    }
    return out;
  }

  async function loadFor(lat, lon, dir) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !dir) return null;
    const api = app.get('api');
    if (!api?.directionPois) return null;
    try {
      const out = await api.directionPois(lat, lon, dir);
      const fc = { type: 'FeatureCollection', features: out.features };
      return setPois(fc);
    } catch (e) {
      log?.(`loadFor failed ${e.message || e}`);
      return null;
    }
  }

  function clear() { return setPois(emptyFC()); }

  function select(feature) {
    if (!feature) return;
    state.set({ selectedPOI: feature, viewMode: 'poi-zoom' });
    const mapApi = app.get('map');
    if (mapApi && feature.geometry?.coordinates) {
      mapApi.fitTo({ type: 'Feature', geometry: { type: 'Point', coordinates: feature.geometry.coordinates }, properties: {} }, { padding: 120, duration: 600 });
    }
    events.emit('poi:selected', { feature });
    events.emit('view:change', { mode: 'poi-zoom' });
    log?.(`poi selected ${feature.properties?.name}`);
  }

  setTimeout(() => {
    const mapApi = app.get('map');
    const map = mapApi?.getMap?.();
    if (!map) return;
    map.on('click', 'poi-circle', (e) => {
      const f = e.features?.[0];
      if (f) select(f);
    });
    map.on('mouseenter', 'poi-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'poi-circle', () => { map.getCanvas().style.cursor = ''; });
  }, 200);

  // When a direction is applied, load POIs for that wedge.
  events.on('direction:change', ({ dir }) => {
    if (!dir) { clear(); return; }
    const boundary = state.get('boundary');
    const center = boundary?._center;
    if (center) loadFor(center[1], center[0], dir);
  });

  // Reset POIs when the user navigates back to the full city view.
  events.on('view:change', ({ mode }) => {
    if (mode === 'city') clear();
  });

  return { setPois, loadFor, clear, select };
}

export default { name, version, deps, init };