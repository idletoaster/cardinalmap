// level module - city/county toggle, persists to localStorage. v1.0.0
export const name = 'level';
export const version = '1.0.0';
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
    events.emit('level:change', { level });
    log?.(`level ${level}`);
  }

  document.querySelectorAll('button[data-level]').forEach((el) => {
    const v = el.dataset.level;
    if (!['city', 'county'].includes(v)) return;
    el.addEventListener('click', () => set(v));
  });

  return { set, get: () => state.get('level') };
}

export default { name, version, deps, init };