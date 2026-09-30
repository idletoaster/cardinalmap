// theme module - ThemeManager with light/dark/system. v1.0.1
// v1.0.1: cycle() now toggles between light and dark based on the resolved
//          theme (one click = one visible flip). Previously cycled through
//          light→dark→system→light, so a user on explicit 'dark' with an
//          OS-dark preference needed two clicks to land on light.
export const name = 'theme';
export const version = '1.0.1';
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
  // v1.0.1: cycle is a true toggle between light and dark — one click flips
  //          the visible basemap. Previously cycled through light→dark→
  //          system→light, so a user on explicit 'dark' needed two clicks
  //          to land on light (first click went to 'system' which resolved
  //          back to dark if the OS preferred dark scheme).
  function cycle() {
    const cur = resolveName(state.get('theme'));
    set(cur === 'dark' ? 'light' : 'dark');
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