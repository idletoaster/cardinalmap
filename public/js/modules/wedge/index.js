// wedge module - state-derived wedge FC, clips boundary by N/NE/E/SE/S/SW/W/NW pie slice. v1.2.0
// v1.2.0: clipBoundaryToSlice now correctly expands MultiPolygon features into
//          a flat list of polygons. The previous v1.1.0 implementation passed
//          `boundary.features.map(f => f.geometry.coordinates)` to
//          polygon-clipping — for a MultiPolygon feature this produced
//          `[[poly1, poly2, poly3]]`, which polygon-clipping parsed as a
//          single Polygon-with-2-holes (not a MultiPolygon). The "hole" ring
//          then swallowed the wedge and the intersection always returned
//          empty for any city whose city boundary is a MultiPolygon (San
//          Diego, Los Angeles, San Francisco, Sacramento, ...). Now we flatten
//          Polygon and MultiPolygon features into a flat [poly1, poly2, ...]
//          array, matching polygon-clipping's MultiPolygon contract.
// v1.1.0: proper 8-wind compass — each direction spans exactly 45° (halfWidth 22.5°),
//          centered on its true bearing (N=0°, NE=45°, E=90°, SE=135°, S=180°,
//          SW=225°, W=270°, NW=315°). N spans 337.5°→22.5°, NE spans 22.5°→67.5°,
//          etc. — no overlap between adjacent directions. Centroid uses bbox-center
//          of the largest outer ring (more stable than raw vertex averaging which
//          biases toward dense-coord parts of the polygon).
export const name = 'wedge';
export const version = '1.2.0';
export const deps = ['map', 'state', 'events'];

const CLIP = (typeof globalThis !== 'undefined' && globalThis.polygonClipping) || null;

const BEARINGS = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

function ringToPoly(ring) { return [ring.map(([x, y]) => [x, y])]; }
function polyToRing(poly) { return poly[0]; }

function buildSlicePolygon(center, dir, halfWidthDeg = 22.5) {
  const bearing = BEARINGS[dir] ?? 0;
  // wedge spanning (bearing +/- halfWidth) around the city's centroid
  const a1 = ((bearing - halfWidthDeg) + 360) % 360;
  const a2 = ((bearing + halfWidthDeg) + 360) % 360;
  const span = (a2 - a1 + 360) % 360;
  // box: large radius
  const R = 10;
  const ring = [[center[0], center[1]]];
  // sample edges at 1deg steps
  const steps = Math.max(2, Math.ceil(span));
  for (let i = 0; i <= steps; i++) {
    const deg = (a1 + (span * i) / steps) * Math.PI / 180;
    // approximate dx/dy in degrees using local scale (approx)
    const dx = R * Math.sin(deg);
    const dy = R * Math.cos(deg);
    ring.push([center[0] + dx, center[1] + dy]);
  }
  ring.push([center[0], center[1]]);
  return [ring];
}

function centroidOf(fc) {
  if (!fc?.features?.length) return [0, 0];
  // bbox-center of the largest outer ring — more stable than vertex-averaging
  // which biases toward parts of the polygon that happen to have dense coords.
  let bestRing = null;
  let bestArea = -1;
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates]
                : g.type === 'MultiPolygon' ? g.coordinates
                : [];
    for (const poly of polys) {
      const ring = poly?.[0];
      if (!ring || ring.length < 4) continue;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of ring) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      const area = (maxX - minX) * (maxY - minY);
      if (area > bestArea) { bestArea = area; bestRing = ring; }
    }
  }
  if (!bestRing) return [0, 0];
  let sx = 0, sy = 0;
  for (const [x, y] of bestRing) { sx += x; sy += y; }
  return [sx / bestRing.length, sy / bestRing.length];
}

function featureFromPolygon(coords, props) {
  return { type: 'Feature', properties: { kind: 'wedge', ...props }, geometry: { type: 'Polygon', coordinates: coords } };
}

function clipBoundaryToSlice(boundaryFC, slicePoly) {
  if (!CLIP || !boundaryFC?.features?.length) return null;
  // Expand the FeatureCollection into a flat list of polygons for
  // polygon-clipping's MultiPolygon format: [poly1, poly2, ...] where
  // each poly = [outerRing, ...holes].
  // - Polygon feature: g.coordinates = [outerRing, ...holes] → one polygon
  // - MultiPolygon feature: g.coordinates = [poly1, poly2, ...] → multiple
  // The old code blindly mapped f.geometry.coordinates which, for a
  // MultiPolygon feature, produced [[poly1, poly2, poly3]] — interpreted
  // as a Polygon-with-2-holes, which never intersects the wedge for
  // cities like San Diego whose boundary is MultiPolygon.
  const subjectPolygons = [];
  for (const f of boundaryFC.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') {
      subjectPolygons.push(g.coordinates);
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) subjectPolygons.push(poly);
    }
  }
  if (!subjectPolygons.length) return null;
  const clipped = CLIP.intersection(subjectPolygons, slicePoly);
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