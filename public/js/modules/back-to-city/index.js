// back-to-city module - floating button visible whenever the user is not
// looking at the full city fit. Two cases:
//   1. viewMode !== 'city'         -> direction wedge / POI zoom / etc.
//   2. viewMode === 'city' but map has been panned/zoomed away from the
//      initial fitToBoundary call.
// In either case, clicking recenters on state.boundary and clears wedge/POI.
// v1.2.1 — clicking back-to-city resets the sheet to 'mini' instead of
//          'peek' so the POI bar stays minimized (was 'peek' which expanded
//          the sheet after every back click). User feedback: "clicking the
//          blue back arrow button expands the POI bar".
// v1.2.0 — use map.idle (not setTimeout) for captureFit so we land on the
// truly-final transform; gate moveend updates with an ignore-window so
// in-flight fitToBoundary animations don't spuriously show the button.
export const name = 'back-to-city';
export const version = '1.2.1';
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
  // We use MapLibre's `idle` event (fires after all animations and tile
  // loading complete) instead of a fixed timeout so captureFit lands on
  // the true final transform, not an in-flight frame.
  let initialFit = null;
  let moved = false;

  function captureFit() {
    const mapApi = app.get('map');
    const m = mapApi?.getMap?.();
    if (!m) return;
    const c = m.getCenter();
    initialFit = { center: [c.lng, c.lat], zoom: m.getZoom() };
    moved = false;
    update();
  }

  function checkMoved() {
    if (!initialFit) return false;
    const mapApi = app.get('map');
    const m = mapApi?.getMap?.();
    if (!m) return false;
    const c = m.getCenter();
    const dz = Math.abs(m.getZoom() - initialFit.zoom);
    const dx = Math.abs(c.lng - initialFit.center[0]);
    const dy = Math.abs(c.lat - initialFit.center[1]);
    return dz > ZOOM_THRESHOLD || dx > PAN_THRESHOLD_DEG || dy > PAN_THRESHOLD_DEG;
  }

  function update() {
    const mode = state.get('viewMode') || 'city';
    moved = checkMoved();
    const show = mode !== 'city' || moved;
    btn.style.display = show ? 'flex' : 'none';
  }

  state.subscribe(update);

  // Track map movement for the panned-away case. `moveend` fires
  // mid-animation, which would over-report "moved" while the initial
  // fitToBoundary is still in flight. We latch a small ignore window
  // starting at every fit.
  let ignoreMoveEndUntil = 0;
  function onMoveOrZoom() {
    if (Date.now() < ignoreMoveEndUntil) return;
    update();
  }

  const tryAttach = () => {
    const mapApi = app.get('map');
    const m = mapApi?.getMap?.();
    if (!m) return;
    m.on('moveend', onMoveOrZoom);
    m.on('zoomend', onMoveOrZoom);
  };
  setTimeout(tryAttach, 50);

  // Capture initial fit each time a city is selected (or after style
  // reload). Use `idle` so we land on the truly-final transform.
  function onCitySelected() {
    ignoreMoveEndUntil = Date.now() + 1500; // silence moveend during fitToBoundary (800ms) + buffer
    const m = app.get('map')?.getMap?.();
    if (m && !m.isMoving() && !m.isZooming()) {
      // Already idle — capture now.
      captureFit();
      return;
    }
    const handler = () => {
      m.off('idle', handler);
      captureFit();
    };
    m.on('idle', handler);
    // Belt-and-suspenders: hard ceiling in case `idle` never fires.
    setTimeout(() => { try { m.off('idle', handler); } catch {} captureFit(); }, 1500);
    update();
  }
  events.on('city:selected', onCitySelected);
  events.on('map:styledata:ready', () => {
    ignoreMoveEndUntil = Date.now() + 1500;
    setTimeout(captureFit, 1200);
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
    app.get('sheet')?.set?.('mini');
    events.emit('view:change', { mode: 'city' });
    ignoreMoveEndUntil = Date.now() + 900;
    setTimeout(captureFit, 700);
    log?.('back to city');
  });

  update();
  return { captureFit };
}

export default { name, version, deps, init };