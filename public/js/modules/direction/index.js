// direction module - applyDirection, fitToWedge, view-mode transition.
// Re-clicking the active direction toggles the wedge OFF (re-fit to full
// city, clear selection). v1.1.0
export const name = 'direction';
export const version = '1.1.0';
export const deps = ['map', 'state', 'events', 'wedge', 'city'];

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function init({ app, events, state, log }) {
  function clearDirection() {
    const wedge = app.get('wedge');
    wedge?.clear?.();
    const mapApi = app.get('map');
    const boundary = state.get('boundary');
    state.set({
      direction: null,
      wedgeFC: null,
      selectedPOI: null,
      viewMode: 'city',
    });
    if (mapApi) {
      mapApi.setSource('wedge', { type: 'FeatureCollection', features: [] });
      if (boundary) mapApi.fitToBoundary(boundary, { duration: 600 });
    }
    app.get('sheet')?.set?.('peek');
    events.emit('direction:change', { dir: null, wedge: null });
    events.emit('view:change', { mode: 'city' });
    log?.('direction cleared');
  }

  async function applyDirection(dir) {
    if (!DIRS.includes(dir)) return;
    if (!state.get('city') || !state.get('boundary')) {
      log?.('applyDirection: no city selected');
      return;
    }
    // Toggle off when clicking the active direction.
    if (state.get('direction') === dir) {
      clearDirection();
      return;
    }
    const wedge = app.get('wedge');
    wedge?.setWedge(dir);
    setTimeout(() => {
      const fc = state.get('wedgeFC');
      const poisFC = state.get('poisFC');
      const mapApi = app.get('map');
      if (mapApi && fc) {
        // POIs can sit OUTSIDE the city boundary in the wedge direction
        // (e.g. retailers across the city line that are still in the same
        // compass slice). fitToWedge alone zooms to the city-clipped wedge
        // polygon and hides those POIs off-screen. Combine wedge + POIs
        // for the zoom extent.
        const combined = (poisFC && poisFC.features?.length)
          ? { type: 'FeatureCollection', features: [...fc.features, ...poisFC.features] }
          : fc;
        mapApi.fitTo(combined, { padding: 80, duration: 600 });
      }
      state.set({ viewMode: 'direction-zoom' });
      events.emit('direction:change', { dir, wedge: fc });
      events.emit('view:change', { mode: 'direction-zoom' });
      log?.(`direction ${dir} applied`);
    }, 50);
  }

  events.on('compass:dir', ({ dir }) => applyDirection(dir));

  return { applyDirection, clearDirection, dirs: DIRS };
}

export default { name, version, deps, init };