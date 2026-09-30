// compass module - N/E/S/W click handler. v1.1.0
// v1.1.0: highlight the currently selected direction in the pad so the user can
//          see at a glance which direction is active. Owns only the .active class
//          toggle on [data-dir] buttons; never mutates map / wedge / state directly.
export const name = 'compass';
export const version = '1.1.0';
export const deps = ['events', 'state'];

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function init({ events, state, log }) {
  const buttons = new Map();
  document.querySelectorAll('[data-dir]').forEach((el) => {
    const dir = el.dataset.dir;
    if (!DIRS.includes(dir)) return;
    buttons.set(dir, el);
    el.addEventListener('click', () => events.emit('compass:dir', { dir }));
  });

  function highlight(dir) {
    for (const [d, el] of buttons) {
      el.classList.toggle('active', !!dir && d === dir);
      el.setAttribute('aria-pressed', d === dir ? 'true' : 'false');
    }
  }

  // mirror state.direction -> pad highlight (single source of truth: state)
  state.subscribe((patch) => {
    if (patch && 'direction' in patch) highlight(patch.direction);
  });

  // initial sync
  highlight(state.get('direction'));

  log?.('compass ready');
  return {};
}

export default { name, version, deps, init };