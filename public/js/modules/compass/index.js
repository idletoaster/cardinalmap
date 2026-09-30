// compass module - N/E/S/W click handler. v1.0.0
export const name = 'compass';
export const version = '1.0.0';
export const deps = ['events'];

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function init({ events, log }) {
  document.querySelectorAll('[data-dir]').forEach((el) => {
    const dir = el.dataset.dir;
    if (!DIRS.includes(dir)) return;
    el.addEventListener('click', () => events.emit('compass:dir', { dir }));
  });
  log?.('compass ready');
  return {};
}

export default { name, version, deps, init };