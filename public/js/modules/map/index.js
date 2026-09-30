// map module - MapLibre instance, registry, ensureLayers guarded on style. v1.8.0
// v1.8.0: Attribution moved to bottom-left (was bottom-right) so the POI
//          sheet can't intercept clicks. collapseAttribution() simplified —
//          only runs on first render so user click toggles stick. Added a
//          hierarchy to dark-mode label paints so neighborhoods/cities/
//          arterials read at distinct weights (was single #e8eaed for all).
// v1.7.0:
// v1.7.0: Google Maps dark palette — split road override into separate
//          casing / inner / minor loops so highway rendering keeps its
//          "outer ring + dark fill" look. Casing now uses a bright
//          rgba(124,124,128,.95) so motorways/highways visibly pop against
//          the dark background; inner stays near-black like GMaps. Added a
//          subtle green tint to parks/wood and a deeper blue to water.
// v1.6.0: POI pins recolored by category (fuel=orange, convenience=blue,
//          lottery=purple) — modern map style instead of the previous opaque
//          black/near-white dots. Stroke narrowed to 2px and opacity softened
//          to .92 for a less heavy appearance. Colors match the per-category
//          colors defined in config/poi-categories.json. Annotate no longer
//          stamps markerColor on each feature; the paint expression reads
//          category_id directly.
// v1.5.0: AttributionControl starts collapsed — just a small "i" icon in the
//          bottom-right corner. Click expands to show full "OpenFreeMap ©
//          OpenMapTiles Data from OpenStreetMap". Previously the control
//          shipped with `open=""` and `maplibregl-compact-show`, rendering the
//          full 350px attribution block across the center of the map.
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
export const version = '1.8.0';
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
      // Category-driven pin colors (modern map style). Falls back to a
      // generic accent blue for unknown category_ids.
      'circle-color': [
        'match', ['get', 'category_id'],
        'fuel',         '#e67e22',
        'convenience',  '#1f7aec',
        'lottery_shop', '#9b59b6',
        'lottery_yes',  '#8e44ad',
        '#0a6cff'
      ],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5, 12, 8, 16, 11],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
      'circle-opacity': 0.95,
      'circle-stroke-opacity': 0.9,
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
  // Google Maps dark palette. Three independent road passes so casing/inner
  // stay distinct (GMaps uses a bright outer ring + near-black road surface):
  //   1) casing    -> bright visible outer ring
  //   2) inner     -> dark road surface
  //   3) minor     -> single-line roads that have no casing split
  // Water gets a deeper blue; parks/wood get a subtle green tint so they
  // visually distinguish from generic landuse; labels get a dark halo.
  safeSetPaint(map, 'background', 'background-color', '#1a1a1a');

  // Water — deeper, more saturated blue than the basemap's near-black.
  for (const layer of layers) {
    const id = layer.id;
    if (layer.type === 'fill' && (id === 'water' || id.startsWith('water_') || id.startsWith('ocean') || id === 'landuse_water')) {
      safeSetPaint(map, id, 'fill-color', '#0f1c2b');
    }
    if (layer.type === 'line' && (id.startsWith('waterway') || id.includes('water'))) {
      safeSetPaint(map, id, 'line-color', '#234159');
    }
  }

  // Road casings — bright outer ring so highways stand out.
  for (const layer of layers) {
    const id = layer.id;
    if (layer.type !== 'line' || !id.includes('_casing')) continue;
    if (id.includes('motorway') || id.includes('trunk')) {
      safeSetPaint(map, id, 'line-color', 'rgba(124,124,128,0.95)');
    } else if (id.includes('primary') || id.includes('secondary')) {
      safeSetPaint(map, id, 'line-color', 'rgba(96,96,100,0.9)');
    } else if (id.includes('major') || id.includes('tertiary') || id.includes('minor') || id.includes('residential')) {
      safeSetPaint(map, id, 'line-color', 'rgba(72,72,76,0.85)');
    } else {
      safeSetPaint(map, id, 'line-color', 'rgba(60,60,64,0.8)');
    }
  }

  // Road inners — near-black surface, slightly lighter than background so
  // they read as "road" rather than a hole in the map.
  for (const layer of layers) {
    const id = layer.id;
    if (layer.type !== 'line' || !id.includes('_inner')) continue;
    if (id.includes('motorway') || id.includes('trunk') || id.includes('primary')) {
      safeSetPaint(map, id, 'line-color', '#26262a');
    } else if (id.includes('secondary') || id.includes('major')) {
      safeSetPaint(map, id, 'line-color', '#1f1f22');
    } else {
      safeSetPaint(map, id, 'line-color', '#1a1a1c');
    }
  }

  // Single-line roads (no casing split): minor roads, paths, piers.
  for (const layer of layers) {
    const id = layer.id;
    if (layer.type !== 'line') continue;
    if (id.includes('_casing') || id.includes('_inner') || id.includes('_subtle')) continue;
    const isRoad = id.startsWith('highway') || id.startsWith('transportation') ||
                   id.startsWith('road') || id === 'street';
    if (!isRoad) continue;
    if (id.includes('minor') || id.includes('residential') || id.includes('tertiary') || id.includes('service')) {
      safeSetPaint(map, id, 'line-color', '#3a3a3c');
    } else if (id.includes('path') || id.includes('track')) {
      safeSetPaint(map, id, 'line-color', '#545458');
    } else if (id.includes('pier')) {
      safeSetPaint(map, id, 'line-color', '#3a3a3c');
    } else {
      safeSetPaint(map, id, 'line-color', '#3a3a3c');
    }
  }

  // Buildings + landuse — subtle green tint for parks/wood so they
  // distinguish from generic residential gray.
  for (const layer of layers) {
    const id = layer.id;
    if (id.startsWith('building') && layer.type === 'fill') {
      safeSetPaint(map, id, 'fill-color', '#1f1f22');
      safeSetPaint(map, id, 'fill-outline-color', '#3a3a3e');
    }
    if (id.startsWith('landuse_park') || id.startsWith('landcover_wood') || id.startsWith('park')) {
      if (layer.type === 'fill') {
        safeSetPaint(map, id, 'fill-color', '#1c2820');
      }
    } else if ((id === 'landcover' || id.startsWith('landuse') || id.startsWith('landcover')) && layer.type === 'fill') {
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
    // v1.8.0 — Label hierarchy. Previously every label was painted the
    // same color (#e8eaed) which made neighborhoods, arterials and city
    // names blur into one another on dark backgrounds. Now:
    //   • place_label_*city/state  → bright white   (most prominent)
    //   • place_label_*town        → soft white     (next tier)
    //   • place_label_*suburb/village/neighbourhood → dim grey
    //   • road_label major         → medium white
    //   • road_label minor         → dim grey       (less prominent)
    //   • waterway/water labels    → light blue
    //   • transit                  → medium grey
    //   • housenum                 → dim grey
    let color;
    if (id.startsWith('place_label')) {
      if (id.includes('city') || id.includes('state') || id.includes('country')) {
        color = '#ffffff';
      } else if (id.includes('town')) {
        color = '#e8eaed';
      } else {
        // suburb, village, neighbourhood, hamlet, quarter, locality
        color = '#9aa3ad';
      }
    } else if (id.startsWith('road_label') || id.includes('road_label')) {
      if (id.includes('minor') || id.includes('service') || id.includes('path') || id.includes('track')) {
        color = '#9aa3ad';
      } else {
        color = '#dadde2';
      }
    } else if (id.startsWith('waterway_label') || id.startsWith('water_label')) {
      color = '#9ec3ff';
    } else if (id.startsWith('transit')) {
      color = '#b6bcc6';
    } else if (id.startsWith('housenum')) {
      color = '#7d858f';
    } else {
      color = '#dadde2';
    }
    safeSetPaint(map, id, 'text-color', color);
    safeSetPaint(map, id, 'text-halo-color', 'rgba(26,26,26,1)');
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
        collapseAttribution();
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

  // v1.5.0 — MapLibre's compact AttributionControl renders open by default,
// filling the center of the map with the full attribution string. Force it
// closed so only the small "i" icon shows until the user taps it.
//
// v1.8.0 — Simplified: only collapse on initial creation / style swap.
// Previous code had a no-op setInterval and a MutationObserver that stripped
// the `open` attribute after the user clicked, which sometimes caused the
// click toggle to fail. We now let MapLibre own the toggle once the element
// is in the DOM — the user clicks the <summary> button, MapLibre's onclick
// handler adds/removes `maplibregl-compact-show`, and CSS shows/hides inner
// text. We only collapse once on initial render (idempotent via flag).
  let _attribObserver = null;
  function collapseAttribution() {
    const el = document.querySelector('.maplibregl-ctrl-attrib');
    if (!el) {
      // Element not yet in DOM — wait for it via DOM observer.
      if (_attribObserver) return;
      _attribObserver = new MutationObserver(() => {
        if (document.querySelector('.maplibregl-ctrl-attrib')) {
          _attribObserver.disconnect();
          _attribObserver = null;
          collapseAttribution();
        }
      });
      _attribObserver.observe(document.documentElement, { childList: true, subtree: true });
      return;
    }
    // Collapse only on first encounter. After that, leave the user's
    // open/closed state alone so click toggles stick.
    if (!el._cmInitialCollapseDone) {
      el.removeAttribute('open');
      el.classList.remove('maplibregl-compact-show');
      el._cmInitialCollapseDone = true;
    }
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
    // v1.8.0: Attribution moved to bottom-left (was bottom-right) so the
    // POI sheet can't intercept clicks on it. User feedback: the small
    // info icon above the POI bar didn't expand on click because the
    // sheet sometimes overlapped it.
    map.addControl(new window.maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    // Collapse attribution immediately (control element already exists in DOM)
    // and again after load (defensive — MapLibre may re-render on style swap).
    collapseAttribution();
    map.on('load', () => {
      ensureLayers();
      collapseAttribution();
      events.emit('map:registered');
    });
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