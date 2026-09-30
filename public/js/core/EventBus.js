// pub/sub event bus. v1.0.0
export const name = 'event-bus';
export const version = '1.0.0';
export const deps = [];

export class EventBus {
  constructor() { this._h = new Map(); }
  on(ev, fn) {
    if (!this._h.has(ev)) this._h.set(ev, new Set());
    this._h.get(ev).add(fn);
    return () => this.off(ev, fn);
  }
  once(ev, fn) {
    const wrap = (...a) => { this.off(ev, wrap); fn(...a); };
    return this.on(ev, wrap);
  }
  off(ev, fn) { this._h.get(ev)?.delete(fn); }
  emit(ev, payload) {
    const set = this._h.get(ev);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (e) { console.error('[bus]', ev, e); }
    }
  }
  clear() { this._h.clear(); }
}

export default EventBus;