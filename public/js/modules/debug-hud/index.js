// debug-hud module - version pill only when localStorage['cm.debug']==='1'. v1.0.0
export const name = 'debug-hud';
export const version = '1.0.0';
export const deps = ['state', 'events'];

export function init({ app, state, events, log }) {
  let enabled = false;
  try { enabled = localStorage.getItem('cm.debug') === '1'; } catch {}
  if (!enabled) return { show() {}, hide() {} };

  const APP_VERSION  = app?.appVersion  || '?';
  const CORE_VERSION = app?.coreVersion || '?';
  const MODULES = (typeof window !== 'undefined' && window.__CARDINALMAP__?.MODULES) || {};

  const pill = document.createElement('div');
  pill.id = 'debug-pill';
  pill.textContent = `cardinalmap v${APP_VERSION}`;
  document.body.appendChild(pill);

  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.innerHTML = `<h4>cardinalmap debug</h4>
    <div>app ${APP_VERSION} / core ${CORE_VERSION}</div>
    <pre id="debug-modules"></pre>
    <pre id="debug-state"></pre>
    <pre id="debug-events"></pre>`;
  panel.style.display = 'none';
  document.body.appendChild(panel);

  document.getElementById('debug-modules').textContent = JSON.stringify(MODULES, null, 2);

  let evtLog = [];
  const allEvents = ['theme:change', 'city:selected', 'direction:change', 'poi:selected',
                     'view:change', 'map:styledata:ready', 'state:patch', 'ui:sheet:set'];
  allEvents.forEach(e => events.on(e, (p) => {
    evtLog.unshift(`${new Date().toISOString().slice(11, 19)} ${e}`);
    if (evtLog.length > 20) evtLog.length = 20;
    const el = document.getElementById('debug-events');
    if (el) el.textContent = evtLog.join('\n');
  }));
  state.subscribe(() => {
    const el = document.getElementById('debug-state');
    if (el) el.textContent = JSON.stringify(state.get(), null, 2);
  });

  pill.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  log?.('debug-hud ready');
  return { show() { pill.style.display = 'block'; }, hide() { pill.style.display = 'none'; } };
}

export default { name, version, deps, init };