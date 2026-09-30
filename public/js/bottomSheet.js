// Bottom-sheet controller + POI list rendering. Clear expand/collapse UX:
//   - The chevron button (#sheet-toggle-btn) explicitly expands or collapses.
//   - The drag handle (#sheet-handle) also toggles.
//   - The header row toggles.
//   - Dragging from collapsed->peek->expanded is wired with simple touch/mouse handlers.

export function createBottomSheet(rootEl) {
  const handle      = rootEl.querySelector('#sheet-handle');
  const toggleBtn   = rootEl.querySelector('#sheet-toggle-btn');
  const header      = rootEl.querySelector('.sheet-header');
  const title       = rootEl.querySelector('#sheet-title');
  const sub         = rootEl.querySelector('#sheet-subtitle');
  const count       = rootEl.querySelector('#sheet-count');
  const list        = rootEl.querySelector('#sheet-list');

  function expand()  { rootEl.classList.remove('collapsed', 'peek'); rootEl.classList.add('expanded'); updateToggle(); }
  function collapse(){ rootEl.classList.remove('expanded', 'peek'); rootEl.classList.add('collapsed'); updateToggle(); }
  function peek()    { rootEl.classList.remove('collapsed', 'expanded'); rootEl.classList.add('peek'); updateToggle(); }

  function isCollapsed() { return rootEl.classList.contains('collapsed'); }
  function isExpanded()  { return rootEl.classList.contains('expanded'); }

  function toggle() {
    if (isCollapsed()) expand();
    else collapse();
  }

  function updateToggle() {
    if (!toggleBtn) return;
    toggleBtn.textContent = isCollapsed() ? '↑' : '↓';
    toggleBtn.setAttribute('aria-label', isCollapsed() ? 'Expand list' : 'Collapse list');
  }

  // Tap on the chevron or handle: toggle.
  handle.addEventListener('click', toggle);
  if (toggleBtn) toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

  // Tap on the header (but not on a list item, handle, or chevron) toggles.
  header.addEventListener('click', (e) => {
    if (e.target.closest('#sheet-toggle-btn')) return;
    if (e.target === handle) return;
    toggle();
  });

  // Simple drag-to-resize: drag down collapses, drag up expands.
  let dragStart = null;
  const onDown = (e) => { dragStart = (e.touches ? e.touches[0].clientY : e.clientY); };
  const onUp = (e) => {
    if (dragStart == null) return;
    const y = (e.changedTouches ? e.changedTouches[0].clientY : e.clientY);
    const dy = y - dragStart;
    dragStart = null;
    if (Math.abs(dy) < 30) return;
    if (dy > 30) collapse();
    else expand();
  };
  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, { passive: true });
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchend', onUp);

  updateToggle();

  return {
    showSkeleton() {
      list.innerHTML = '';
      for (let i = 0; i < 4; i++) {
        const li = document.createElement('li');
        li.className = 'skeleton-row';
        li.innerHTML = '<div class="skeleton"></div><div class="skeleton small"></div>';
        list.appendChild(li);
      }
      count.textContent = '…';
    },
    setHeader({ title: t, subtitle: s, count: c }) {
      if (t !== undefined) title.textContent = t;
      if (s !== undefined) sub.textContent = s || '';
      if (c !== undefined) count.textContent = c;
    },
    render(pois, onClick) {
      list.innerHTML = '';
      if (!pois.length) {
        const empty = document.createElement('li');
        empty.style.color = 'var(--fg-2)';
        empty.style.textAlign = 'center';
        empty.style.padding = '20px 6px';
        empty.textContent = 'No POIs in this slice.';
        list.appendChild(empty);
        count.textContent = '0';
        return;
      }
      for (const p of pois) {
        const li = document.createElement('li');
        const dot = document.createElement('span');
        dot.className = 'cat-dot';
        dot.style.background = p.color || '#888';
        const name = document.createElement('div');
        name.className = 'poi-name';
        name.textContent = p.name || '(unnamed)';
        const meta = document.createElement('div');
        meta.className = 'poi-meta';
        meta.textContent = [p.brand, p.address, p.city, p.state].filter(Boolean).join(' · ');
        const dist = document.createElement('div');
        dist.className = 'poi-dist';
        dist.textContent = (p.distance_miles != null) ? `${p.distance_miles.toFixed(2)} mi` : '';
        li.appendChild(dot); li.appendChild(name); li.appendChild(meta); li.appendChild(dist);
        li.addEventListener('click', () => onClick?.(p));
        list.appendChild(li);
      }
      count.textContent = String(pois.length);
    },
    expand, collapse, peek, isCollapsed, isExpanded,
  };
}
