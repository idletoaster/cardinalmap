// Typeahead search bar wrapper. Calls /api/search and renders suggestions.

export function createSearch(inputEl, resultsEl, { onPick }) {
  let timer = null;
  let activeIdx = -1;
  let currentResults = [];

  function close() {
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
    activeIdx = -1;
    currentResults = [];
  }

  inputEl.addEventListener('input', () => {
    const q = inputEl.value.trim();
    if (timer) clearTimeout(timer);
    if (q.length < 2) { close(); return; }
    timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.json());
        currentResults = res.results || [];
        if (!currentResults.length) { close(); return; }
        resultsEl.innerHTML = '';
        currentResults.forEach((r, i) => {
          const li = document.createElement('li');
          li.textContent = r.display_name;
          li.addEventListener('click', () => pick(i));
          resultsEl.addEventListener('mouseover', () => setActive(i), { once: true });
          resultsEl.appendChild(li);
        });
        resultsEl.hidden = false;
        activeIdx = -1;
      } catch (e) {
        console.error('search failed', e);
        close();
      }
    }, 220);
  });

  inputEl.addEventListener('keydown', (e) => {
    if (resultsEl.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(activeIdx + 1, currentResults.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(activeIdx - 1, 0)); }
    else if (e.key === 'Enter')  { e.preventDefault(); if (activeIdx >= 0) pick(activeIdx); }
    else if (e.key === 'Escape') close();
  });

  document.addEventListener('click', (e) => {
    if (!resultsEl.contains(e.target) && e.target !== inputEl) close();
  });

  function setActive(i) {
    activeIdx = i;
    Array.from(resultsEl.children).forEach((el, idx) => {
      el.style.background = (idx === i) ? 'var(--bg-2)' : '';
    });
  }
  function pick(i) {
    const r = currentResults[i];
    if (!r) return;
    inputEl.value = r.display_name.split(',')[0];
    close();
    onPick?.(r);
  }
}
