// sheet module - state machine + title/subtitle/count/list rendering. v1.4.0
// v1.4.0: lottery categories (lottery_shop, lottery_yes) now render with
//          a friendly "Lottery" label + ★ badge in the POI list, so users
//          can spot lottery retailers at a glance instead of seeing the
//          raw "lottery yes" / "lottery shop" category_id strings.
// v1.3.0: stay at 'mini' on city:selected instead of auto-expanding to
//          'peek' (user feedback: POI sheet was overlapping the map).
//          Toggle button is now bidirectional (up=expand, down=minimize)
//          and updates its arrow glyph to match the current state.
export const name = 'sheet';
export const version = '1.4.0';
export const deps = ['state', 'events', 'poi'];

// Order matters: cycle() rotates through these. 'mini' is the minimize
// state (~56px) - only the handle + title bar visible, no POI list, no
// subtitle. Cycle: mini -> peek -> expanded -> hidden -> mini.
const ORDER = ['mini', 'peek', 'expanded', 'hidden'];

export function init({ app, state, events, log }) {
  // Apply initial sheet state. The hardcoded `state.set` patch doesn't run
  // our local `set()` function. setTimeout schedules the DOM sync after the
  // current task, so #sheet is in the DOM and any module that touches the
  // sheet (style-toggle, etc.) has completed its synchronous init.
  state.set({ sheet: 'mini' });
  setTimeout(() => set('mini'), 0);

  function set(mode) {
    if (!ORDER.includes(mode)) return;
    state.set({ sheet: mode });
    document.documentElement.setAttribute('data-sheet', mode);
    const el = document.querySelector('#sheet') || document.querySelector('#bottom-sheet');
    if (el) {
      el.dataset.state = mode;
      el.classList.remove('mini', 'collapsed', 'peek', 'expanded', 'hidden');
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

  // Drag handle cycles: mini/hidden/collapsed -> peek -> expanded -> mini
  document.querySelector('#sheet-handle')?.addEventListener('click', () => {
    const cur = state.get('sheet');
    if (cur === 'mini' || cur === 'hidden' || cur === 'collapsed') set('peek');
    else if (cur === 'peek') set('expanded');
    else if (cur === 'expanded') set('mini');
  });

  // Topbar expand button: cycle from hidden, otherwise cycle.
  document.querySelector('#expand-sheet')?.addEventListener('click', () => {
    const cur = state.get('sheet');
    if (cur === 'hidden') set('peek');
    else cycle();
  });

  // v1.3.0: bidirectional toggle button in sheet header.
  //  - sheet at mini/collapsed/hidden -> click goes to peek (expand)
  //  - sheet at peek/expanded -> click goes to mini (minimize)
  // Arrow glyph also flips: up-arrow when minimized, down-arrow when expanded.
  function syncToggleArrow() {
    const btn = document.querySelector('#sheet-toggle-btn');
    if (!btn) return;
    const cur = state.get('sheet');
    const isExpanded = cur === 'peek' || cur === 'expanded';
    btn.textContent = isExpanded ? '\u2193' : '\u2191';
    btn.setAttribute('aria-label', isExpanded ? 'Minimize list' : 'Expand list');
    btn.title = isExpanded ? 'Minimize list' : 'Expand list';
  }
  state.subscribe((patch) => { if (patch && 'sheet' in patch) syncToggleArrow(); });
  document.querySelector('#sheet-toggle-btn')?.addEventListener('click', () => {
    const cur = state.get('sheet');
    if (cur === 'peek' || cur === 'expanded') set('mini');
    else set('peek');
  });
  syncToggleArrow();// ---- title / subtitle / count / list ----
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
      const catRaw = props.category_id || '';
      // Lottery categories get a friendly label + a small badge so users
      // can spot lottery retailers at a glance (vs raw "lottery yes").
      let cat;
      let isLottery = false;
      if (catRaw === 'lottery_shop' || catRaw === 'lottery_yes') {
        cat = 'Lottery';
        isLottery = true;
      } else {
        cat = catRaw.replace(/_/g, ' ');
      }
      const dist = props.distance_m != null
        ? `${(props.distance_m / 1609.34).toFixed(2)} mi`
        : '';
      li.innerHTML = `
        <div style="flex:1;min-width:0;">
          <div class="name">${props.name || 'Unnamed'}${isLottery ? ' <span class="lottery-badge" aria-label="Lottery retailer">★</span>' : ''}</div>
          <div class="meta">${[cat, props.address, dist].filter(Boolean).join(' \u00b7 ')}</div>
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

  // v1.3.0: do NOT auto-expand on city selection - sheet stays at current
  // state so the user can see the map. They expand manually via the
  // up-arrow button in the sheet header.
  events.on('city:selected', () => { renderPois(); /* stay at current sheet */ });
  events.on('direction:change', () => renderPois());
  events.on('view:change', () => renderPois());

  // Listen on state-store directly for poisFC / selectedPOI / city / direction changes.
  const KEYS = ['poisFC', 'selectedPOI', 'city', 'direction'];
  state.subscribe((patch) => { if (KEYS.some((k) => k in patch)) renderPois(); });

  return { set, cycle, states: ORDER, renderPois };
}

export default { name, version, deps, init };