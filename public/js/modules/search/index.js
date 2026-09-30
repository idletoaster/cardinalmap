// search module - debounced /api/search, emits search:picked. v1.0.0
export const name = 'search';
export const version = '1.0.0';
export const deps = ['api', 'events'];

export function init({ app, events, log }) {
  const input = document.querySelector('#search-input');
  const list = document.querySelector('#search-results');
  let token = 0;
  let timer = null;

  async function run(q) {
    const api = app.get('api');
    if (!api) return;
    const my = ++token;
    const results = await api.search(q).catch(() => []);
    if (my !== token) return;
    if (!list) return;
    list.innerHTML = '';
    for (const r of results) {
      const li = document.createElement('li');
      li.className = 'search-result';
      const displayName = r.name || r.display_name || r.label || 'Unknown';
      li.textContent = displayName;
      li.dataset.id = r.osm_id || r.id;
      li.dataset.kind = r.level || r.kind || 'city';
      li.dataset.osmType = r.osm_type || 'relation';
      li.dataset.lat = r.lat;
      li.dataset.lon = r.lon;
      li.dataset.displayName = displayName;
      li.addEventListener('click', () => {
        events.emit('search:picked', { ...r, id: r.osm_id || r.id, name: displayName, kind: li.dataset.kind });
        list.innerHTML = '';
      });
      list.appendChild(li);
    }
  }

  if (input) {
    input.addEventListener('input', (e) => {
      clearTimeout(timer);
      const q = e.target.value;
      timer = setTimeout(() => run(q), 200);
    });
  }

  log?.('search ready');
  return { run };
}

export default { name, version, deps, init };