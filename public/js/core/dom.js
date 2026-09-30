// dom.js - root element cache. v1.0.0
export const name = 'dom';
export const version = '1.0.0';
export const deps = [];

export function dom() {
  const cache = new Map();
  return (sel) => {
    if (cache.has(sel)) return cache.get(sel);
    const el = document.querySelector(sel);
    if (!el) console.warn('[dom] not found', sel);
    cache.set(sel, el);
    return el;
  };
}

export default dom;