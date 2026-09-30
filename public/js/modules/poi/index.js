// poi module - POI layers, popups, click handler, POI-zoom view-mode.
// Loads POIs for the active direction wedge from /api/direction, dedupes
// defensively on the client, and renders them on the map. v1.2.0 adds a
// popup with a Directions button (deep-links to Google Maps / Apple Maps).
export const name = 'poi';
export const version = '1.3.0';
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

  let activePopup = null;

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function directionsLinks(feature) {
    const c = feature.geometry?.coordinates;
    if (!c) return { google: '#', apple: '#' };
    const [lon, lat] = c;
    const name = encodeURIComponent(feature.properties?.name || 'POI');
    // Google Maps universal directions URL
    const google = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving&destination_place_id=${name}`;
    // Apple Maps directions URL (macOS / iOS)
    const apple  = `https://maps.apple.com/?daddr=${lat},${lon}&dirflg=d`;
    return { google, apple };
  }

  function popupHtml(feature) {
    const p = feature.properties || {};
    const name = escapeHtml(p.name || 'Unnamed');
    const meta = [p.category_id, p.address].filter(Boolean).map(escapeHtml).join(' · ');
    const { google, apple } = directionsLinks(feature);
    const isApple = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
    return `
      <div class="poi-popup">
        <div class="poi-popup-name">${name}</div>
        ${meta ? `<div class="poi-popup-meta">${meta}</div>` : ''}
        <div class="popup-actions">
          <a href="${google}" target="_blank" rel="noopener">Directions</a>
          ${isApple ? `<a class="alt" href="${apple}" target="_blank" rel="noopener">Apple Maps</a>` : ''}
        </div>
      </div>
    `;
  }

  function select(feature) {
    if (!feature) return;
    state.set({ selectedPOI: feature, viewMode: 'poi-zoom' });
    const mapApi = app.get('map');
    if (mapApi && feature.geometry?.coordinates) {
      mapApi.fitTo({ type: 'Feature', geometry: { type: 'Point', coordinates: feature.geometry.coordinates }, properties: {} }, { padding: 120, duration: 600 });
      // Show a popup with name + Directions buttons
      const map = mapApi.getMap?.();
      if (map && window.maplibregl) {
        if (activePopup) { activePopup.remove(); activePopup = null; }
        activePopup = new window.maplibregl.Popup({ closeButton: true, offset: 14, maxWidth: '280px' })
          .setLngLat(feature.geometry.coordinates)
          .setHTML(popupHtml(feature))
          .addTo(map);
        activePopup.on('close', () => { activePopup = null; });
      }
    }
    events.emit('poi:selected', { feature });
    events.emit('view:change', { mode: 'poi-zoom' });
    log?.(`poi selected ${feature.properties?.name}`);
  }

  function clearPopup() { if (activePopup) { activePopup.remove(); activePopup = null; } }

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

  // Reset POIs (and any open popup) when the user navigates back to the full city view.
  events.on('view:change', ({ mode }) => {
    if (mode === 'city') { clearPopup(); clear(); }
  });
  events.on('back:city', () => { clearPopup(); });

  return { setPois, loadFor, clear, select };
}

export default { name, version, deps, init };