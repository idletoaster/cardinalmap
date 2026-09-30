// wedge module - state-derived wedge FC, clips boundary by N/NE/E/SE/S/SW/W/NW pie slice. v1.0.0
export const name = 'wedge';
export const version = '1.0.0';
export const deps = ['map', 'state', 'events'];

const CLIP = (typeof globalThis !== 'undefined' && globalThis.polygonClipping) || null;

const BEARINGS = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

function buildSlicePolygon(center, dir, halfWidthDeg = 45) {
  const bearing = BEARINGS[dir] ?? 0;
  const a1 = ((bearing - halfWidthDeg) + 360) % 360;
  const a2 = ((bearing + halfWidthDeg) + 360) % 360;
  const span = (a2 - a1 + 360) % 360;
  const R = 10;
  const ring = [[center[0], center[1]]];
  const steps = Math.max(2, Math.ceil(span));
  for (let i = 0; i <= steps; i++) {
    const deg = (a1 + (span * i) / steps) * Math.PI / 180;
    const dx = R * Math.sin(deg);
    const dy = R * Math.cos(deg);
    ring.push([center[0] + dx, center[1] + dy]);
  }
  ring.push([center[0], center[1]]);
  return [ring];
}

function centroidOf(fc) {
  let sx = 0, sy = 0, n = 0;
  const acc = (coords) => {
    if (typeof coords[0] === 'number') { sx += coords[0]; sy += coords[1]; n++; return; }
    coords.forEach(acc);
  };
  fc.features.forEach(f => acc(f.geometry.coordinates));
  return n ? [sx / n, sy / n] : [0, 0];
}

function featureFromPolygon(coords, props) {
  return { type: 'Feature', properties: { kind: 'wedge', ...props }, geometry: { type: 'Polygon', coordinates: coords } };
}

function clipBoundaryToSlice(boundaryFC, slicePoly) {
  if (!CLIP || !boundaryFC?.features?.length) return null;
  const clipped = CLIP.intersection(
    boundaryFC.features.map(f => f.geometry.coordinates),
    slicePoly,
  );
  if (!clipped?.length) return null;
  return clipped.map(rings => featureFromPolygon(rings));
}

export function init({ app, events, state, log }) {
  function sync() {
    const boundary = state.get('boundary');
    const direction = state.get('direction');
    const mapApi = app.get('map');
    if (!boundary || !direction || !mapApi) {
      clear();
      return;
    }
    const center = boundary._center || centroidOf(boundary);
    const slice = buildSlicePolygon(center, direction);
    const feats = clipBoundaryToSlice(boundary, slice);
    if (!feats) { clear(); return; }
    const fc = { type: 'FeatureCollection', features: feats };
    state.set({ wedgeFC: fc });
    mapApi.setSource('wedge', fc);
    log?.(`wedge synced dir=${direction}`);
  }

  function clear() {
    state.set({ wedgeFC: null });
    const mapApi = app.get('map');
    if (mapApi) mapApi.setSource('wedge', { type: 'FeatureCollection', features: [] });
  }

  function setWedge(dir) {
    if (!state.get('boundary')) return;
    state.set({ direction: dir });
    sync();
  }

  events.on('state:patch', (patch) => {
    if (patch && ('boundary' in patch || 'direction' in patch)) sync();
  });
  events.on('map:styledata:ready', sync);

  return { setWedge, clear, sync, buildSlicePolygon, centroidOf };
}

export default { name, version, deps, init };