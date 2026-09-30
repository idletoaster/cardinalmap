// MapLibre wrapper. Supports Positron <-> Dark Liberty style toggle and auto-switch on system theme.
const STYLES = {
  positron:      'https://tiles.openfreemap.org/styles/positron',
  dark_liberty:  'https://tiles.openfreemap.org/styles/dark',
  liberty:       'https://tiles.openfreemap.org/styles/liberty',
};

const DEFAULT_STYLE = 'positron';
const DARK_STYLE    = 'dark_liberty';

function pickStyleForSystem(prefersDark) {
  const saved = localStorage.getItem('cm.style');
  if (saved && STYLES[saved]) return saved;
  return prefersDark ? DARK_STYLE : DEFAULT_STYLE;
}

export function createMap({ container, onStyleChange }) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = pickStyleForSystem(prefersDark);

  const map = new maplibregl.Map({
    container,
    style: STYLES[initial],
    center: [-97.7431, 30.2672], // Austin, TX default
    zoom: 11,
    attributionControl: { compact: true },
    pitchWithRotate: false,
    dragRotate: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');
  map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserHeading: true }), 'top-right');

  // Auto-switch on system theme change (only if user has not explicitly chosen).
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener?.('change', (e) => {
    if (localStorage.getItem('cm.style')) return;
    const next = e.matches ? DARK_STYLE : DEFAULT_STYLE;
    map.setStyle(STYLES[next]);
    onStyleChange?.(next);
  });

  // Empty GeoJSON sources we'll populate dynamically.
  map.on('load', () => {
    map.addSource('pois', { type: 'geojson', data: emptyFC() });
    map.addSource('neighborhoods', { type: 'geojson', data: emptyFC() });
    map.addSource('wedge', { type: 'geojson', data: emptyFC() });
    map.addLayer({
      id: 'neighborhoods-fill',
      type: 'fill',
      source: 'neighborhoods',
      paint: { 'fill-color': '#0a84ff', 'fill-opacity': 0.06 },
    });
    map.addLayer({
      id: 'neighborhoods-line',
      type: 'line',
      source: 'neighborhoods',
      paint: { 'line-color': '#0a84ff', 'line-width': 1, 'line-opacity': 0.4 },
    });
    map.addLayer({
      id: 'wedge-fill',
      type: 'fill',
      source: 'wedge',
      paint: { 'fill-color': '#0a84ff', 'fill-opacity': 0.12 },
    });
    map.addLayer({
      id: 'pois-circle',
      type: 'circle',
      source: 'pois',
      paint: {
        'circle-radius': 7,
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });
  });

  return {
    map,
    setStyle(name) {
      if (!STYLES[name]) return;
      map.setStyle(STYLES[name]);
      localStorage.setItem('cm.style', name);
      onStyleChange?.(name);
    },
    currentStyle() {
      // Re-derive from localStorage or system pref.
      const saved = localStorage.getItem('cm.style');
      if (saved) return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK_STYLE : DEFAULT_STYLE;
    },
    setPOIs(fc) {
      if (!map.isStyleLoaded()) {
        map.once('idle', () => map.getSource('pois')?.setData(fc || emptyFC()));
      } else {
        map.getSource('pois')?.setData(fc || emptyFC());
      }
    },
    setNeighborhoods(fc) {
      const apply = () => map.getSource('neighborhoods')?.setData(fc || emptyFC());
      if (!map.isStyleLoaded()) map.once('idle', apply); else apply();
    },
    setWedge(fc) {
      const apply = () => map.getSource('wedge')?.setData(fc || emptyFC());
      if (!map.isStyleLoaded()) map.once('idle', apply); else apply();
    },
    fitTo(fc) {
      if (!fc || !fc.features?.length) return;
      const b = bboxOf(fc);
      if (!b) return;
      map.fitBounds(b, { padding: { top: 80, right: 60, bottom: 220, left: 60 }, duration: 600, maxZoom: 15 });
    },
    flyTo(lon, lat, zoom = 13) { map.flyTo({ center: [lon, lat], zoom, duration: 600 }); },
    onPoiClick(handler) {
      map.on('click', 'pois-circle', (e) => {
        const f = e.features?.[0]; if (f) handler(f.properties);
      });
      map.on('mouseenter', 'pois-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'pois-circle', () => { map.getCanvas().style.cursor = ''; });
    },
  };
}

function emptyFC() { return { type: 'FeatureCollection', features: [] }; }

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
