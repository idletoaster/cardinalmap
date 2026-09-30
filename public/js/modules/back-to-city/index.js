// back-to-city module - floating button visible whenever the user is not
// looking at the full city fit. Two cases:
//   1. viewMode !== 'city'         -> direction wedge / POI zoom / etc.
//   2. viewMode === 'city' but map has been panned/zoomed away from the
//      initial fitToBoundary call.
// In either case, clicking recenters on state.boundary and clears wedge/POI.
// v1.1.0
export const name = 'back-to-city';
export const version = '1.1.0';
export const deps = ['map', 'state', 'events', 'sheet'];

const PAN_THRESHOLD_DEG = 0.0008;   // ~80m at CA latitude
const ZOOM_THRESHOLD   = 0.4;

export function init({ app, state, events, log }) {
  const btn = document.createElement('button');
  btn.id = 'back-to-city';
  btn.title = 'Back to full city view';
  btn.innerHTML = '&larr;';
  btn.style.display = 'none';
  document.body.appendChild(btn);

  // initialFit = { center:[lon,lat], zoom } captured after each fitToBoundary.
  let initialFit = null;
  let moved = false;

  function captureFit() {
    const mapApi = app.get('map');
    const m = mapApi?.getMap?.();
    if (!m) return;
    const c = m.getCenter();
    initialFit = { center: [c.lng, c.lat], zoom: m.getZoom() };
    moved = false;
  }

  function checkMoved() {
    if (!initialFit) return;
    const mapApi = app.get('map');
    const m = mapApi?.getMap?.();
    if (!m) return;
    const c = m.getCenter();
    const dz = Math.abs(m.getZoom() - initialFit.zoom);
    const dx = Math.abs(c.lng - initialFit.center[0]);
    const dy = Math.abs(c.lat - initialFit.center[1]);
    moved = dz > ZOOM_THRESHOLD || dx > PAN_THRESHOLD_DEG || dy > PAN_THRESHOLD_DEG;
  }

  function update() {
    const mode = state.get('viewMode') || 'city';
    checkMoved();
    const show = mode !== 'city' || moved;
    btn.style.display = show ? 'flex' : 'none';
  }

  state.subscribe(update);

  // Track map movement for the panned-away case.
  const tryAttach = () => {
    const mapApi = app.get('map');
    const m = mapApi?.getMap?.();
    if (!m) return;
    m.on('moveend', update);
    m.on('zoomend', update);
  };
  // map module boots after this one — give it a beat.
  setTimeout(tryAttach, 50);

  // Capture initial fit each time a city is selected (or after style reload).
  events.on('city:selected', () => {
    setTimeout(captureFit, 850); // fitToBoundary duration is 800ms
    update();
  });
  events.on('map:styledata:ready', () => {
    setTimeout(captureFit, 850);
    update();
  });

  btn.addEventListener('click', () => {
    const mapApi = app.get('map');
    const boundary = state.get('boundary');
    state.set({
      direction: null,
      wedgeFC: null,
      poisFC: null,
      selectedPOI: null,
      viewMode: 'city',
    });
    if (mapApi) {
      mapApi.setSource('wedge', { type: 'FeatureCollection', features: [] });
      mapApi.setSource('pois', { type: 'FeatureCollection', features: [] });
      if (boundary) mapApi.fitToBoundary(boundary, { duration: 600 });
    }
    app.get('sheet')?.set?.('peek');
    events.emit('view:change', { mode: 'city' });
    setTimeout(captureFit, 650);
    log?.('back to city');
  });

  update();
  return { captureFit };
}

export default { name, version, deps, init };