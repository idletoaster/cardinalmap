// sheet module - state machine + title/subtitle/count/list rendering. v1.1.0
export const name = 'sheet';
export const version = '1.1.0';
export const deps = ['state', 'events', 'poi'];

const ORDER = ['collapsed', 'peek', 'expanded', 'hidden'];

export function init({ app, state, events, log }) {
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

  // ---- title / subtitle / count / list ----
  const titleEl    = () => document.querySelector('#sheet-title');
  const subtitleEl = () => document.querySelector('#sheet-subtitle');
  const countEl    = () => document.querySelector('#sheet-count');
  const listEl     = () => document.querySelector('#sheet-list');

  const DIR_LABEL = { N: 'North', NE: 'NE', E: 'East', SE: 'SE', S: 'South', SW: 'SW', W: 'West', NW: 'NW' };

  function setTitle(text) { const el = titleEl(); if (el) el.textContent = text; }
  function setSubtitle(text) { const el = subtitleEl(); if (el) el.textContent = text || ''; }
  function setCount(n) { const el = countEl(); if (el) el.textContent = String(n); }

  function clearList() { const el = listEl(); if (el) el.innerHTML = ''; }
  function setEmpty(msg) {
    clearList();
    const el = listEl(); if (!el) return;
    const li = document.createElement('li');
    li.className = 'sheet-empty';
    li.style.cssText = 'padding:14px 4px;color:var(--fg-2);font-size:13px;text-align:center;';
    li.textContent = msg;
    el.appendChild(li);
  }

  function renderEmptyState() {
    setTitle('Search a city');
    setSubtitle('Type a name above to begin');
    setCount(0);
    setEmpty('No city selected yet.');
  }

  function renderPois() {
    const pois = state.get('poisFC')?.features || [];
    const sel = state.get('selectedPOI');
    const city = state.get('city');
    const dir = state.get('direction');

    if (city && dir) setTitle(`${city.name} - ${DIR_LABEL[dir] || dir}`);
    else if (city) setTitle(city.name);
    else setTitle('Search a city');

    if (dir) setSubtitle(`${pois.length} POIs in ${DIR_LABEL[dir] || dir} wedge`);
    else setSubtitle(city ? 'Tap a direction on the compass to highlight POIs' : 'Type a name above to begin');

    setCount(pois.length);
    clearList();

    if (!pois.length) {
      if (dir) setEmpty('No POIs found in this direction.');
      else setEmpty('Tap a direction to load POIs.');
      return;
    }

    const el = listEl(); if (!el) return;
    for (const f of pois) {
      const props = f.properties || {};
      const li = document.createElement('li');
      li.dataset.osmId = props.osm_id || '';
      if (sel && (sel.properties?.osm_id === props.osm_id)) li.classList.add('selected');
      const cat = (props.category_id || '').replace(/_/g, ' ');
      const dist = props.distance_m != null
        ? `${(props.distance_m / 1609.34).toFixed(2)} mi`
        : '';
      li.innerHTML = `
        <div style="flex:1;min-width:0;">
          <div class="name">${props.name || 'Unnamed'}</div>
          <div class="meta">${[cat, props.address, dist].filter(Boolean).join(' - ')}</div>
        </div>
      `;
      li.addEventListener('click', () => {
        const poiApi = app.get('poi');
        poiApi?.select(f);
      });
      el.appendChild(li);
    }
  }

  // Initial empty state on boot
  renderEmptyState();

  // Re-render whenever any of the relevant state slices change.
  events.on('city:selected', () => { renderPois(); set('peek'); });
  events.on('direction:change', () => renderPois());
  events.on('view:change', () => renderPois());

  // Listen on state-store directly for poisFC / selectedPOI / city / direction changes.
  const KEYS = ['poisFC', 'selectedPOI', 'city', 'direction'];
  state.subscribe((patch) => { if (KEYS.some((k) => k in patch)) renderPois(); });

  return { set, cycle, states: ORDER, renderPois };
}

export default { name, version, deps, init };