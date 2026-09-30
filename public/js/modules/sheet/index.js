// sheet module - collapsed/peek/expanded/hidden states (Bug 3 fix). v1.0.0
export const name = 'sheet';
export const version = '1.0.0';
export const deps = ['state', 'events'];

const ORDER = ['collapsed', 'peek', 'expanded', 'hidden'];

export function init({ state, events, log }) {
  state.set({ sheet: 'peek' });

  function set(mode) {
    if (!ORDER.includes(mode)) return;
    state.set({ sheet: mode });
    document.documentElement.setAttribute('data-sheet', mode);
    const el = document.querySelector('#sheet') || document.querySelector('#bottom-sheet');
    if (el) {
      el.dataset.state = mode;
      el.classList.remove('collapsed', 'peek', 'expanded', 'hidden');
      el.classList.add(mode);
    }
    events.emit('ui:sheet:set', { state: mode });
    log?.(`sheet ${mode}`);
  }

  function cycle() {
    const cur = state.get('sheet');
    const idx = ORDER.indexOf(cur);
    set(ORDER[(idx + 1) % ORDER.length]);
  }

  document.querySelector('#sheet-handle')?.addEventListener('click', () => {
    const cur = state.get('sheet');
    if (cur === 'collapsed') set('peek');
    else if (cur === 'peek') set('expanded');
    else if (cur === 'expanded') set('peek');
    else if (cur === 'hidden') set('peek');
  });

  document.querySelector('#expand-sheet')?.addEventListener('click', () => {
    const cur = state.get('sheet');
    if (cur === 'hidden') set('peek');
    else cycle();
  });
  // existing legacy button id from prior UI
  document.querySelector('#sheet-toggle-btn')?.addEventListener('click', () => {
    const cur = state.get('sheet');
    if (cur === 'peek') set('expanded');
    else set('peek');
  });

  return { set, cycle, states: ORDER };
}

export default { name, version, deps, init };