// city module - selectCity / selectCounty, boundary persistence. v1.0.0
export const name = 'city';
export const version = '1.0.0';
export const deps = ['map', 'state', 'events'];

function centroidOf(fc) {
  let sx = 0, sy = 0, n = 0;
  const acc = (coords) => {
    if (typeof coords[0] === 'number') { sx += coords[0]; sy += coords[1]; n++; return; }
    coords.forEach(acc);
  };
  fc.features.forEach(f => acc(f.geometry.coordinates));
  return n ? [sx / n, sy / n] : [0, 0];
}

export function init({ app, events, state, log }) {
  async function selectCity(feature, boundary) {
    if (!feature || !boundary) return;
    boundary._center = centroidOf(boundary);
    state.set({
      level: 'city',
      city: { id: feature.id, name: feature.properties?.name, feature, boundary },
      boundary,
      direction: null,
      wedgeFC: null,
      poisFC: null,
      viewMode: 'city',
    });
    const mapApi = app.get('map');
    if (mapApi) {
      mapApi.setSource('boundary', boundary);
      mapApi.fitToBoundary(boundary, { duration: 800 });
    }
    events.emit('city:selected', { level: 'city', feature, boundary });
    log?.(`city selected ${feature.properties?.name}`);
  }

  async function selectCounty(feature, boundary) {
    if (!feature || !boundary) return;
    boundary._center = centroidOf(boundary);
    state.set({
      level: 'county',
      city: { id: feature.id, name: feature.properties?.name, feature, boundary },
      boundary,
      direction: null,
      wedgeFC: null,
      poisFC: null,
      viewMode: 'city',
    });
    const mapApi = app.get('map');
    if (mapApi) {
      mapApi.setSource('boundary', boundary);
      mapApi.fitToBoundary(boundary, { duration: 800 });
    }
    events.emit('city:selected', { level: 'county', feature, boundary });
    log?.(`county selected ${feature.properties?.name}`);
  }

  events.on('map:styledata:ready', () => {
    const b = state.get('boundary');
    const mapApi = app.get('map');
    if (b && mapApi) mapApi.setSource('boundary', b);
  });

  return { selectCity, selectCounty };
}

export default { name, version, deps, init };