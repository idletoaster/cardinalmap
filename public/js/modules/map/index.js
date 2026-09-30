// map module - MapLibre instance, registry, ensureLayers guarded on style. v1.1.0
export const name = 'map';
export const version = '1.1.0';
export const deps = [];

const STYLE_URLS = {
  positron:      'https://tiles.openfreemap.org/styles/positron',
  dark_liberty:  'https://tiles.openfreemap.org/styles/dark',
  liberty:       'https://tiles.openfreemap.org/styles/liberty',
};

const REGISTRY = {
  sources: [
    { id: 'boundary', spec: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
    { id: 'wedge', spec: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
    { id: 'pois', spec: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
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
    { id: 'poi-circle', type: 'circle', source: 'pois', paint: {
      'circle-radius': 5, 'circle-color': ['get', 'markerColor'],
      'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.6,
    } },
    { id: 'poi-label', type: 'symbol', source: 'pois', layout: {
      'text-field': ['get', 'name'], 'text-size': 12, 'text-offset': [0, 1.2],
      'text-anchor': 'top', 'text-allow-overlap': false,
    }, paint: {
      'text-color': ['coalesce', ['get', 'labelColor'], '#222'],
      'text-halo-color': ['coalesce', ['get', 'labelHaloColor'], 'rgba(255,255,255,0.85)'],
      'text-halo-width': 1.4,
    } },
  ],
};

function readVar(n) {
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}

function paintsForTheme(name) {
  // Reads CSS custom properties (so dark mode matches Google/Apple Maps
  // palette via @media or [data-theme]). Falls back to known-good hex if
  // the var is missing for any reason.
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

export function init({ app, events, log }) {
  let map = null;
  let currentStyle = null;
  const styleName = () => currentStyle;

  function ensureLayers() {
    if (!map) return;
    if (!map.isStyleLoaded()) {
      // style still loading — wait for the next style-data tick
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
    apply('wedge', map.getSource('wedge')?._data || { type: 'FeatureCollection', features: [] });
    apply('pois', map.getSource('pois')?._data || { type: 'FeatureCollection', features: [] });
    events.emit('map:styledata:ready');
    log?.('map:styledata:ready');
  }

  function setStyle(name) {
    currentStyle = name;
    if (map) {
      const url = STYLE_URLS[name] || name;
      map.setStyle(url);
      ensureLayers();
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
  };
}

export default { name, version, deps, init };