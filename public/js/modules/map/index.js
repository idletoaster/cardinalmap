// map module - MapLibre instance, registry, ensureLayers guarded on style. v1.4.0
// v1.4.0: POI pins more prominent — radius 7→10→13 (was 6→8→10), stroke 3px,
//          minzoom=6 so pins appear earlier.
// v1.2.0: larger POI pins (radius 8), smooth theme swap via .theme-fading overlay,
//          Google/Apple-style dark CSS palette already in app.css.
// v1.3.0: apply Google/Apple-style paint overrides directly on the basemap layers
//          so dark-mode streets and labels stand out from the dark background.
//          Light-mode overrides are minimal (just label halo boost). All overrides
//          are scoped to basemap layers only — REGISTRY layers (boundary/wedge/pois)
//          keep their own theme-driven colors via paintsForTheme().
export const name = 'map';
export const version = '1.4.0';
export const deps = [];

const STYLE_URLS = {
  positron:      'https://tiles.openfreemap.org/styles/positron',
  dark_liberty:  'https://tiles.openfreemap.org/styles/dark',
  liberty:       'https://tiles.openfreemap.org/styles/liberty',
};

// Registry layers (boundary / wedge / pois) — untouched by basemap overrides.
const REGISTRY = {
  sources: [
    { id: 'boundary', spec: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
    { id: 'wedge',    spec: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
    { id: 'pois',     spec: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
  ],
  layers: [
    { id: 'boundary-fill', type: 'fill', source: 'boundary', paint: {
      'fill-color': ['get', 'fillColor'], 'fill-opacity': 0.06,
    } },
    { id: 'boundary-line', type: 'line', source: 'boundary', paint: {
      'line-color': ['get', 'lineColor'], 'line-width': 3,
    } },
    { id: 'wedge-fill', type: 'fill', source: 'wedge', paint: {
      'fill-color': ['get', 'fillColor'], 'fill-opacity': 0.25,
    } },
    { id: 'wedge-line', type: 'line', source: 'wedge', paint: {
      'line-color': ['get', 'lineColor'], 'line-width': 2, 'line-dasharray': [2, 1],
    } },
    { id: 'poi-circle', type: 'circle', source: 'pois', minzoom: 6, paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 7, 12, 10, 16, 13],
      'circle-color': ['get', 'markerColor'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 3,
      'circle-opacity': 1.0,
      'circle-stroke-opacity': 1.0,
    } },
    { id: 'poi-label', type: 'symbol', source: 'pois', minzoom: 9, layout: {
      'text-field': ['get', 'name'], 'text-size': 12, 'text-offset': [0, 1.4],
      'text-anchor': 'top', 'text-allow-overlap': false,
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
    }, paint: {
      'text-color': ['coalesce', ['get', 'labelColor'], '#222'],
      'text-halo-color': ['coalesce', ['get', 'labelHaloColor'], 'rgba(255,255,255,0.85)'],
      'text-halo-width': 1.6,
    } },
  ],
};

function readVar(n) {
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}

function paintsForTheme(name) {
  const dark = name === 'dark';
  return {
    boundary: {
      line: dark ? (readVar('--boundary-dark')     || '#FDD663')
                 : (readVar('--boundary-light')    || '#0a6cff'),
      fill: dark ? (readVar('--wedge-fill-dark')   || 'rgba(138,180,248,0.20)')
                 : (readVar('--wedge-fill-light')  || 'rgba(10,108,255,0.06)'),
    },
    wedge: {
      line: dark ? (readVar('--wedge-stroke-dark') || '#8AB4F8')
                 : (readVar('--wedge-stroke-light')|| '#0a6cff'),
      fill: dark ? (readVar('--wedge-fill-dark')   || 'rgba(138,180,248,0.20)')
                 : (readVar('--wedge-fill-light')  || 'rgba(10,108,255,0.10)'),
    },
    poi: {
      label: dark ? '#E8EAED' : '#1a1d22',
      halo:  dark ? 'rgba(0,0,0,0.95)' : 'rgba(255,255,255,0.95)',
      marker: dark ? '#8AB4F8' : '#0a6cff',
    },
  };
}

function annotate(fc, palette) {
  if (!fc) return fc;
  fc.features?.forEach(f => {
    f.properties = {
      ...f.properties,
      fillColor: f.properties.kind === 'wedge' ? palette.wedge.fill : palette.boundary.fill,
      lineColor: f.properties.kind === 'wedge' ? palette.wedge.line : palette.boundary.line,
      markerColor: palette.poi.label,
      labelColor: palette.poi.label,
      labelHaloColor: palette.poi.halo,
    };
  });
  return fc;
}

// ---------- BASEMAP PAINT OVERRIDES (v1.3.0) ----------
// Layer-id groups come from the OpenFreeMap basemaps (positron, dark, liberty).
// We never touch REGISTRY layer ids here. setPaintProperty is wrapped in a safe
// helper so missing paint properties on a layer (different basemap variants)
// silently skip instead of throwing.

function safeSetPaint(map, layerId, prop, value) {
  try {
    if (!map.getLayer(layerId)) return false;
    const layer = map.getLayer(layerId);
    const paint = layer && layer.paint;
    if (paint && Object.prototype.hasOwnProperty.call(paint, prop)) {
      map.setPaintProperty(layerId, prop, value);
      return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

function applyBasemapOverrides(map, theme) {
  if (!map || !map.isStyleLoaded()) return;
  const layers = (map.getStyle() && map.getStyle().layers) || [];
  const dark = theme === 'dark';

  // Light tweaks — give the positron labels a slightly stronger white halo so
  // they read clearly over light-grey map tiles.
  if (!dark) {
    for (const layer of layers) {
      if (layer.type !== 'symbol') continue;
      const id = layer.id;
      if (id === 'poi-label') continue;
      if (id.includes('name') || id.startsWith('place') || id.startsWith('road_label')) {
        safeSetPaint(map, id, 'text-halo-color', 'rgba(255,255,255,1)');
        safeSetPaint(map, id, 'text-halo-width', 1.6);
      }
    }
    return;
  }

  // ---------- DARK MODE OVERRIDES ----------
  // Google Maps / Apple Maps dark palette — picked so streets visibly differ
  // from the background and labels read crisp with a dark halo.
  safeSetPaint(map, 'background', 'background-color', '#1a1a1a');

  for (const layer of layers) {
    const id = layer.id;
    if (layer.type === 'fill' && (id === 'water' || id.startsWith('water_') || id.startsWith('ocean') || id === 'landuse_water')) {
      safeSetPaint(map, id, 'fill-color', '#1c2e3f');
    }
    if (layer.type === 'line' && (id.startsWith('waterway') || id.includes('water'))) {
      safeSetPaint(map, id, 'line-color', '#2c4763');
    }
  }

  for (const layer of layers) {
    const id = layer.id;
    if (layer.type !== 'line') continue;
    const isRoad = id.startsWith('transportation') || id.startsWith('highway') ||
                   id.startsWith('road') || id === 'street';
    if (!isRoad) continue;

    if (id.includes('motorway') || id.includes('trunk') || id.includes('primary')) {
      safeSetPaint(map, id, 'line-color', '#545458');
    } else if (id.includes('secondary')) {
      safeSetPaint(map, id, 'line-color', '#3a3a3c');
    } else if (id.includes('tertiary') || id.includes('minor') || id.includes('residential') || id.includes('service')) {
      safeSetPaint(map, id, 'line-color', '#2c2c2e');
    } else {
      safeSetPaint(map, id, 'line-color', '#383838');
    }
  }

  for (const layer of layers) {
    const id = layer.id;
    if (id.startsWith('building') && layer.type === 'fill') {
      safeSetPaint(map, id, 'fill-color', '#262626');
      safeSetPaint(map, id, 'fill-outline-color', '#3a3a3a');
    }
    if ((id === 'landcover' || id.startsWith('landuse') || id.startsWith('landcover')) && layer.type === 'fill') {
      safeSetPaint(map, id, 'fill-color', '#1f1f1f');
    }
  }

  for (const layer of layers) {
    if (layer.type !== 'symbol') continue;
    const id = layer.id;
    if (id === 'poi-label') continue;
    const isLabel = id.includes('name') || id.startsWith('place') ||
                    id.startsWith('road_label') || id.startsWith('poi_') ||
                    id.startsWith('waterway_label') || id.startsWith('transit') ||
                    id.startsWith('housenum');
    if (!isLabel) continue;
    safeSetPaint(map, id, 'text-color', '#e8eaed');
    safeSetPaint(map, id, 'text-halo-color', 'rgba(0,0,0,1)');
    safeSetPaint(map, id, 'text-halo-width', 1.6);
    safeSetPaint(map, id, 'text-halo-blur', 0.4);
  }
}

export function init({ app, events, log }) {
  let map = null;
  let currentStyle = null;
  const styleName = () => currentStyle;

  function ensureLayers() {
    if (!map) return;
    if (!map.isStyleLoaded()) {
      map.once('styledata', ensureLayers);
      map.once('idle', ensureLayers);
      return;
    }
    const t = document.documentElement.getAttribute('data-theme') || 'light';
    const pal = paintsForTheme(t);
    for (const s of REGISTRY.sources) {
      if (!map.getSource(s.id)) map.addSource(s.id, s.spec);
    }
    for (const l of REGISTRY.layers) {
      if (!map.getLayer(l.id)) map.addLayer(l);
    }
    const apply = (id, fc) => {
      const src = map.getSource(id);
      if (src) src.setData(annotate(fc, pal));
    };
    apply('boundary', map.getSource('boundary')?._data || { type: 'FeatureCollection', features: [] });
    apply('wedge',    map.getSource('wedge')?._data    || { type: 'FeatureCollection', features: [] });
    apply('pois',     map.getSource('pois')?._data     || { type: 'FeatureCollection', features: [] });
    // Basemap paint overrides run AFTER REGISTRY is in place so we never
    // touch our own layer ids (boundary-*, wedge-*, poi-*, etc.).
    applyBasemapOverrides(map, t);
    events.emit('map:styledata:ready');
    log?.('map:styledata:ready');
  }

  function setStyle(name) {
    currentStyle = name;
    if (map) {
      const url = STYLE_URLS[name] || name;
      const container = map.getContainer?.();
      if (container?.parentElement?.parentElement) {
        container.parentElement.parentElement.classList.add('theme-fading');
      }
      try { map.setStyle(url, { diff: false }); } catch { map.setStyle(url); }
      map.once('styledata', () => {
        if (container?.parentElement?.parentElement) {
          container.parentElement.parentElement.classList.remove('theme-fading');
        }
        ensureLayers();
      });
      map.once('idle', () => {
        if (container?.parentElement?.parentElement) {
          container.parentElement.parentElement.classList.remove('theme-fading');
        }
      });
    }
  }

  function fitTo(featureOrFC, opts = {}) {
    if (!map) return;
    let fc = featureOrFC;
    if (fc.type !== 'FeatureCollection') fc = { type: 'FeatureCollection', features: [fc] };
    const coords = [];
    const collect = (g) => {
      if (g.type === 'Polygon') g.coordinates.forEach(r => r.forEach(c => coords.push(c)));
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(r => r.forEach(c => coords.push(c))));
    };
    fc.features.forEach(f => collect(f.geometry));
    if (!coords.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of coords) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    map.fitBounds([[minX, minY], [maxX, maxY]], {
      padding: opts.padding ?? 60, duration: opts.duration ?? 600,
    });
  }

  function initMap(container, opts = {}) {
    const styleName = opts.style || 'positron';
    const styleUrl = STYLE_URLS[styleName] || styleName;
    map = new window.maplibregl.Map({
      container,
      style: styleUrl,
      center: opts.center || [-117.85, 33.68],
      zoom: opts.zoom || 9,
      attributionControl: { compact: true },
    });
    currentStyle = styleName;
    map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => { ensureLayers(); events.emit('map:registered'); });
    return map;
  }

  function on(event, fn) { return map?.on(event, fn); }
  function getMap() { return map; }

  // Re-apply basemap overrides on theme change so they follow CSS without
  // needing a full setStyle() round-trip.
  events.on('theme:change', ({ name }) => {
    if (!map) return;
    if (map.isStyleLoaded()) applyBasemapOverrides(map, name);
    else map.once('styledata', () => applyBasemapOverrides(map, name));
  });

  log?.('map ready');

  return {
    initMap, ensureLayers, setStyle, fitTo, on, getMap,
    getCurrentStyleName: styleName,
    setSource(id, fc) { if (map?.getSource(id)) { const t = document.documentElement.getAttribute("data-theme") || "light"; map.getSource(id).setData(annotate(fc, paintsForTheme(t))); } },
    getSource: (id) => map?.getSource(id),
    getLayer:  (id) => map?.getLayer(id),
    fitToWedge: (fc, opts) => fitTo(fc, { padding: 80, ...opts }),
    fitToBoundary: (fc, opts) => fitTo(fc, { padding: 60, ...opts }),
    paintsForTheme,
    _applyBasemapOverrides: (theme) => applyBasemapOverrides(map, theme),
  };
}

export default { name, version, deps, init };