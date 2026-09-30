// CardinalMap orchestrator. v2.0.0
import { App } from './core/App.js';
import { EventBus } from './core/EventBus.js';
import { StateStore } from './core/StateStore.js';
import { dom as mkDom } from './core/dom.js';
import { log } from './core/log.js';
import { APP_VERSION, CORE_VERSION, MODULES } from './core/versions.js';

import api from './modules/api/index.js';
import theme from './modules/theme/index.js';
import mapMod from './modules/map/index.js';
import wedge from './modules/wedge/index.js';
import city from './modules/city/index.js';
import direction from './modules/direction/index.js';
import poi from './modules/poi/index.js';
import search from './modules/search/index.js';
import geolocate from './modules/geolocate/index.js';
import sheet from './modules/sheet/index.js';
import compass from './modules/compass/index.js';
import level from './modules/level/index.js';
import styleToggle from './modules/style-toggle/index.js';
import toast from './modules/toast/index.js';
import debugHud from './modules/debug-hud/index.js';
import backToCity from './modules/back-to-city/index.js';

const initialState = {
  theme: 'system',
  level: 'city',
  city: null,
  boundary: null,
  direction: null,
  wedgeFC: null,
  poisFC: null,
  selectedPOI: null,
  viewMode: 'city',
  sheet: 'peek',
  mapReady: false,
};

const app = new App({
  events: new EventBus(),
  state: new StateStore(initialState),
  dom: mkDom(),
  log,
  appVersion: APP_VERSION,
  coreVersion: CORE_VERSION,
});

[api, theme, mapMod, wedge, city, direction, poi, search, geolocate,
 sheet, compass, level, styleToggle, toast, debugHud, backToCity]
  .forEach(m => app.register(m));

window.__CARDINALMAP__ = { app, APP_VERSION, CORE_VERSION, MODULES };
app.boot();

window.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('#map');
  if (container) app.get('map')?.initMap(container);

  app.events.on('search:picked', async (r) => {
    try {
      const osmType = r.osm_type || 'relation';
      const osmId = r.osm_id || r.id;
      const level = app.state.get('level') || 'city';
      const url = `/api/locate?lat=${encodeURIComponent(r.lat)}&lon=${encodeURIComponent(r.lon)}&label=${encodeURIComponent(r.name || '')}&osm_type=${osmType}&osm_id=${osmId}&mode=${level}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('locate ' + res.status);
      const data = await res.json();
      // Include lat/lon + osm ids on the feature so downstream modules
      // (city.autoCountyFromCity, etc.) can re-query the same place without
      // needing to re-search.
      const feature = {
        id: osmId,
        osm_type: osmType,
        osm_id: osmId,
        lat: r.lat,
        lon: r.lon,
        properties: { name: r.name },
      };
      const bg = data.boundary_geojson;
      const fc = bg && bg.type === 'FeatureCollection'
        ? bg
        : { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: bg }] };
      if (level === 'county') await app.get('city').selectCounty(feature, fc);
      else await app.get('city').selectCity(feature, fc);
    } catch (e) {
      console.warn('[search:picked] failed', e);
    }
  });
});