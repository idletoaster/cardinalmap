// 8-direction compass controller. Emits 'change' with the selected direction or null.

export function createCompass(rootEl, { onChange }) {
  const buttons = Array.from(rootEl.querySelectorAll('.dir'));

  function setActive(dir) {
    for (const b of buttons) {
      b.classList.toggle('active', b.dataset.dir === dir);
    }
  }

  buttons.forEach((b) => {
    b.addEventListener('click', () => {
      const d = b.dataset.dir;
      const next = (d === 'C') ? null : d;
      setActive(next);
      onChange?.(next);
    });
  });

  return {
    set(dir) { setActive(dir); },
  };
}
