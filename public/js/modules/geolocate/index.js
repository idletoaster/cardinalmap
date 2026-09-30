// geolocate module - locate button uses MapLibre GeolocateControl. v1.0.0
export const name = 'geolocate';
export const version = '1.0.0';
export const deps = ['map'];

export function init({ app, events, log }) {
  setTimeout(() => {
    const mapApi = app.get('map');
    const map = mapApi?.getMap?.();
    if (!map || !window.maplibregl?.GeolocateControl) return;
    const ctrl = new window.maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showUserHeading: false,
    });
    map.addControl(ctrl, 'top-right');
  }, 100);
  log?.('geolocate ready');
  return {};
}

export default { name, version, deps, init };