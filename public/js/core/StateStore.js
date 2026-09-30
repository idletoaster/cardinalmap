// Observable state store with invariant validation. v1.0.0
export const name = 'state-store';
export const version = '1.0.0';
export const deps = [];

export class StateStore {
  constructor(initial = {}) {
    this._state = { ...initial };
    this._subs = new Set();
  }
  get(key) { return key === undefined ? { ...this._state } : this._state[key]; }
  has(key) { return Object.prototype.hasOwnProperty.call(this._state, key); }
  set(patch) {
    const prev = { ...this._state };
    const next = { ...this._state, ...patch };
    const errs = this.validate(next);
    if (errs.length) {
      console.warn('[state] invariant:', errs.join('; '));
      for (const k of Object.keys(patch)) {
        if (!errs.some(e => e.startsWith(k))) this._state[k] = patch[k];
      }
    } else {
      this._state = next;
    }
    const applied = { ...this._state };
    for (const fn of this._subs) {
      try { fn(patch, prev, applied); } catch (e) { console.error('[state.sub]', e); }
    }
    return { ...this._state };
  }
  subscribe(fn) {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  }
  validate(s) {
    const errs = [];
    if (s.wedgeFC != null) {
      if (!s.city || !s.direction) errs.push('wedgeFC requires city & direction');
    }
    if (s.viewMode === 'direction-zoom' && !s.direction) {
      errs.push('viewMode direction-zoom requires direction');
    }
    if (s.viewMode === 'poi-zoom' && !s.selectedPOI) {
      errs.push('viewMode poi-zoom requires selectedPOI');
    }
    if (s.theme && !['light', 'dark', 'system'].includes(s.theme)) {
      errs.push(`unknown theme ${s.theme}`);
    }
    if (s.level && !['city', 'county'].includes(s.level)) {
      errs.push(`unknown level ${s.level}`);
    }
    if (s.sheet && !['collapsed', 'peek', 'expanded', 'hidden'].includes(s.sheet)) {
      errs.push(`unknown sheet state ${s.sheet}`);
    }
    return errs;
  }
}

export default StateStore;