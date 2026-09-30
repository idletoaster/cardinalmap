// theme module - ThemeManager with light/dark/system. v1.0.0
export const name = 'theme';
export const version = '1.0.0';
export const deps = ['map'];

const BASEMAPS = { light: 'positron', dark: 'dark_liberty' };
const LS = 'cm.theme';

function migrate() {
  try {
    const t = localStorage.getItem(LS);
    if (t) return t;
    const old = localStorage.getItem('cm.style');
    if (old === 'light' || old === 'dark') {
      localStorage.setItem(LS, old);
      localStorage.removeItem('cm.style');
      return old;
    }
  } catch {}
  return 'system';
}

function resolveName(t) {
  if (t === 'dark' || t === 'light') return t;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function init({ app, events, state, log }) {
  state.set({ theme: migrate() });
  let mql = null;
  let lastResolved = null;

  function applyAll() {
    const t = state.get('theme');
    const resolved = resolveName(t);
    document.documentElement.setAttribute('data-theme', resolved);
    try { localStorage.setItem(LS, t); } catch {}
    const mapApi = app.get('map');
    if (mapApi && resolved !== lastResolved) {
      const style = BASEMAPS[resolved];
      if (mapApi.getCurrentStyleName?.() !== style) {
        mapApi.setStyle(style);
      }
      lastResolved = resolved;
    } else if (!mapApi) {
      lastResolved = resolved;
    }
    events.emit('theme:change', { name: resolved, source: t });
    log?.(`theme applied ${resolved} (source=${t})`);
  }

  function set(t) {
    if (!['light', 'dark', 'system'].includes(t)) return;
    state.set({ theme: t });
    applyAll();
  }
  function toggle() { set(state.get('theme') === 'dark' ? 'light' : 'dark'); }
  function cycle() {
    const cur = state.get('theme');
    const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light';
    set(next);
  }

  mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener?.('change', () => {
    if (state.get('theme') === 'system') applyAll();
  });

  events.on('map:registered', applyAll);
  events.on('map:styledata:ready', () => applyAll());

  setTimeout(applyAll, 0);

  return { set, toggle, cycle, applyAll, resolve: () => resolveName(state.get('theme')) };
}

export default { name, version, deps, init };