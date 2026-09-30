// level module - city/county toggle, persists to localStorage. v1.1.0
// v1.1.0: emit source:'user' on level:change so downstream handlers (city.auto-
//          county) can distinguish user-driven toggles from internal state moves.
export const name = 'level';
export const version = '1.1.0';
export const deps = ['state', 'events'];

const LS = 'cm.level';

export function init({ state, events, log }) {
  let stored = 'city';
  try { stored = localStorage.getItem(LS) || 'city'; } catch {}
  state.set({ level: stored });
  document.documentElement.setAttribute('data-level', stored);

  function set(level) {
    if (!['city', 'county'].includes(level)) return;
    try { localStorage.setItem(LS, level); } catch {}
    state.set({
      level,
      direction: null,
      wedgeFC: null,
      poisFC: null,
      selectedPOI: null,
      viewMode: 'city',
    });
    document.documentElement.setAttribute('data-level', level);
    applyActive(level);
    events.emit('level:change', { level, source: 'user' });
    log?.(`level ${level}`);
  }

  function applyActive(level) {
    document.querySelectorAll('button[data-level]').forEach((el) => {
      const on = el.dataset.level === level;
      el.classList.toggle('active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  // Sync .active class with stored level on boot
  applyActive(stored);

  document.querySelectorAll('button[data-level]').forEach((el) => {
    const v = el.dataset.level;
    if (!['city', 'county'].includes(v)) return;
    el.addEventListener('click', () => set(v));
  });

  return { set, get: () => state.get('level') };
}

export default { name, version, deps, init };