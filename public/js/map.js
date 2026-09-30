// MapLibre wrapper. Supports Positron <-> Dark Liberty style toggle and auto-switch on system theme.
const STYLES = {
  positron:      'https://tiles.openfreemap.org/styles/positron',
  dark_liberty:  'https://tiles.openfreemap.org/styles/dark',
  liberty:       'https://tiles.openfreemap.org/styles/liberty',
};

const DEFAULT_STYLE = 'positron';
const DARK_STYLE    = 'dark_liberty';

// MapLibre paint expressions that adapt to dark mode. They are reapplied after every style load.
function paintsForDark(isDark) {
  return {
    neighborhoodFill:  isDark ? 'rgba(255,255,255,0.10)' : 'rgba(10,132,255,0.10)',
    neighborhoodLine:  isDark ? 'rgba(255,255,255,0.55)' : '#5a8fde',
    wedgeFill:         isDark ? 'rgba(255,209,102,0.28)' : 'rgba(10,132,255,0.22)',
    wedgeLine:         isDark ? 'rgba(255,209,102,0.85)' : '#0a84ff',
    poiColor:          isDark ? '#ffd166' : '#0a84ff',
    poiStroke:         isDark ? '#1f2226' : '#ffffff',
  };
}

function pickStyleForSystem(prefersDark) {
  const saved = localStorage.getItem('cm.style');
  if (saved && STYLES[saved]) return saved;
  return prefersDark ? DARK_STYLE : DEFAULT_STYLE;
}

function isDarkName(name) {
  return name === 'dark_liberty' || name === 'dark';
}

export function createMap({ container, onStyleChange }) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = pickStyleForSystem(prefersDark);

  const map = new maplibregl.Map({
    container,
    style: STYLES[initial],
    center: [-117.8265, 33.6846], // Irvine, CA default
    zoom: 11,
    attributionControl: { compact: true },
    pitchWithRotate: false,
    dragRotate: false,
  });
  // Position the navigation control bottom-right so it does NOT overlap with the top-right
  // geolocate control OR the topbar style-toggle.
  map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), 'bottom-right');
  map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserHeading: true }), 'bottom-right');

  // Auto-switch on system theme change (only if user has not explicitly chosen).
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener?.('change', (e) => {
    if (localStorage.getItem('cm.style')) return;
    const next = e.matches ? DARK_STYLE : DEFAULT_STYLE;
    map.setStyle(STYLES[next]);
    onStyleChange?.(next);
  });

  // Empty GeoJSON sources we'll populate dynamically. We register them once at construction
  // so toggling styles doesn't lose them (MapLibre re-creates layers on setStyle).
  let sourcesReady = false;

  function ensureLayers() {
    if (map.getSource('pois')) return;
    map.addSource('pois', { type: 'geojson', data: emptyFC() });
    map.addSource('neighborhoods', { type: 'geojson', data: emptyFC() });
    map.addSource('wedge', { type: 'geojson', data: emptyFC() });

    // Neighborhood polygons (subtle background).
    map.addLayer({
      id: 'neighborhoods-fill',
      type: 'fill',
      source: 'neighborhoods',
      paint: { 'fill-color': paintsForDark(isDarkName(currentName())).neighborhoodFill },
    });
    map.addLayer({
      id: 'neighborhoods-line',
      type: 'line',
      source: 'neighborhoods',
      paint: { 'line-color': paintsForDark(isDarkName(currentName())).neighborhoodLine, 'line-width': 1.2 },
    });

    // Direction wedge (the highlighted 45-degree slice).
    map.addLayer({
      id: 'wedge-fill',
      type: 'fill',
      source: 'wedge',
      paint: { 'fill-color': paintsForDark(isDarkName(currentName())).wedgeFill },
    });
    map.addLayer({
      id: 'wedge-line',
      type: 'line',
      source: 'wedge',
      paint: { 'line-color': paintsForDark(isDarkName(currentName())).wedgeLine, 'line-width': 1.5 },
    });

    // POI markers — large enough to see on mobile, color-coded by category.
    map.addLayer({
      id: 'pois-circle',
      type: 'circle',
      source: 'pois',
      paint: {
        'circle-radius': 8,
        'circle-color': ['coalesce', ['get', 'color'], paintsForDark(isDarkName(currentName())).poiColor],
        'circle-stroke-color': paintsForDark(isDarkName(currentName())).poiStroke,
        'circle-stroke-width': 2.5,
      },
    });
    sourcesReady = true;
  }

  function currentName() {
    const saved = localStorage.getItem('cm.style');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK_STYLE : DEFAULT_STYLE;
  }

  // After every style load, re-register our layers and reapply pending data.
  let pendingPOIs = emptyFC();
  let pendingNeighborhoods = emptyFC();
  let pendingWedge = emptyFC();

  map.on('styledata', () => {
    ensureLayers();
    const p = paintsForDark(isDarkName(currentName()));
    if (map.getLayer('neighborhoods-fill')) map.setPaintProperty('neighborhoods-fill', 'fill-color', p.neighborhoodFill);
    if (map.getLayer('neighborhoods-line')) map.setPaintProperty('neighborhoods-line', 'line-color', p.neighborhoodLine);
    if (map.getLayer('wedge-fill'))         map.setPaintProperty('wedge-fill', 'fill-color', p.wedgeFill);
    if (map.getLayer('wedge-line'))         map.setPaintProperty('wedge-line', 'line-color', p.wedgeLine);
    if (map.getLayer('pois-circle')) {
      map.setPaintProperty('pois-circle', 'circle-color',
        ['coalesce', ['get', 'color'], p.poiColor]);
      map.setPaintProperty('pois-circle', 'circle-stroke-color', p.poiStroke);
    }
    map.getSource('pois')?.setData(pendingPOIs);
    map.getSource('neighborhoods')?.setData(pendingNeighborhoods);
    map.getSource('wedge')?.setData(pendingWedge);
  });

  return {
    map,
    setStyle(name) {
      if (!STYLES[name]) return;
      map.setStyle(STYLES[name]);
      localStorage.setItem('cm.style', name);
      onStyleChange?.(name);
    },
    currentStyle: currentName,
    setPOIs(fc) {
      pendingPOIs = fc || emptyFC();
      ensureLayers();
      map.getSource('pois')?.setData(pendingPOIs);
    },
    setNeighborhoods(fc) {
      pendingNeighborhoods = fc || emptyFC();
      ensureLayers();
      map.getSource('neighborhoods')?.setData(pendingNeighborhoods);
    },
    setWedge(fc) {
      pendingWedge = fc || emptyFC();
      ensureLayers();
      map.getSource('wedge')?.setData(pendingWedge);
    },
    fitTo(fc) {
      if (!fc || !fc.features?.length) return;
      const b = bboxOf(fc);
      if (!b) return;
      map.fitBounds(b, { padding: { top: 90, right: 60, bottom: 220, left: 60 }, duration: 700, maxZoom: 15 });
    },
    flyTo(lon, lat, zoom = 16) { map.flyTo({ center: [lon, lat], zoom, duration: 700 }); },
    onPoiClick(handler) {
      map.on('click', 'pois-circle', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties || {};
        const html = poiPopupHTML(p);
        new maplibregl.Popup({ closeButton: true, maxWidth: '260px', offset: 12 })
          .setLngLat(f.geometry.coordinates)
          .setHTML(html)
          .addTo(map);
        handler?.(p);
      });
      map.on('mouseenter', 'pois-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'pois-circle', () => { map.getCanvas().style.cursor = ''; });
    },
  };
}

function emptyFC() { return { type: 'FeatureCollection', features: [] }; }

function poiPopupHTML(p) {
  const name = escapeHTML(p.name || '(unnamed)');
  const brand = p.brand ? `<div class="popup-brand">${escapeHTML(p.brand)}</div>` : '';
  const addr = [p.address, p.city, p.state].filter(Boolean).map(escapeHTML).join(', ');
  const dist = (p.distance_miles != null) ? `<div class="popup-dist">${p.distance_miles.toFixed(2)} mi ${p.bearing != null ? '· bearing ' + Math.round(p.bearing) + '°' : ''}</div>` : '';
  const cat = p.category_id ? `<div class="popup-cat" style="color:${escapeHTML(p.color || '#888')}">${escapeHTML(p.category_id.replace(/_/g, ' '))}</div>` : '';
  const hours = p.opening_hours ? `<div class="popup-hours">${escapeHTML(p.opening_hours)}</div>` : '';
  const phone = p.phone ? `<div><a href="tel:${escapeHTML(p.phone)}">${escapeHTML(p.phone)}</a></div>` : '';
  const web = p.website ? `<div><a href="${escapeHTML(p.website)}" target="_blank" rel="noopener">Website</a></div>` : '';
  return `<div class="poi-popup">
    <div class="popup-name">${name}</div>
    ${brand}${addr ? `<div class="popup-addr">${addr}</div>` : ''}${cat}${dist}${hours}${phone}${web}
  </div>`;
}

function escapeHTML(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]); }

function bboxOf(fc) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of fc.features) {
    const coords = f.geometry.type === 'Point' ? [f.geometry.coordinates] : flatten(f.geometry.coordinates);
    for (const c of coords) {
      const [x, y] = c;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return [[minX, minY], [maxX, maxY]];
}
function flatten(coords) {
  const out = [];
  (function walk(c) {
    if (typeof c[0] === 'number') out.push(c);
    else for (const x of c) walk(x);
  })(coords);
  return out;
}
