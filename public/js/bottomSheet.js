// Bottom-sheet controller + POI list rendering.

export function createBottomSheet(rootEl) {
  const handle = rootEl.querySelector('#sheet-handle');
  const title  = rootEl.querySelector('#sheet-title');
  const sub    = rootEl.querySelector('#sheet-subtitle');
  const count  = rootEl.querySelector('#sheet-count');
  const list   = rootEl.querySelector('#sheet-list');

  function expand() { rootEl.classList.remove('collapsed', 'peek'); rootEl.classList.add('expanded'); }
  function collapse() { rootEl.classList.remove('expanded', 'peek'); rootEl.classList.add('collapsed'); }

  // Tap on the sheet (but not on a list item) toggles expand/collapse.
  rootEl.addEventListener('click', (e) => {
    if (e.target.closest('li')) return;
    if (e.target === handle) return toggle();
    if (rootEl.classList.contains('collapsed')) expand();
  });
  function toggle() {
    if (rootEl.classList.contains('collapsed')) expand();
    else if (rootEl.classList.contains('expanded')) collapse();
    else expand();
  }

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
    expand,
    collapse,
  };
}
