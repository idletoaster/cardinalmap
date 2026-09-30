// App coordinator: register modules, topological boot, hook wiring, error boundary. v1.0.0
export const name = 'app';
export const version = '1.0.0';
export const deps = ['event-bus', 'state-store'];

const CORE_SERVICES = new Set(['state', 'events', 'dom', 'log']);

function topoSort(mods) {
  const map = new Map(mods.map(m => [m.name, m]));
  const seen = new Set();
  const out = [];
  const visit = (m, path = []) => {
    if (seen.has(m.name)) return;
    if (path.includes(m.name)) throw new Error(`cycle: ${path.join('->')}${m.name}`);
    for (const d of m.deps || []) {
      if (CORE_SERVICES.has(d)) continue;
      const dep = map.get(d);
      if (!dep) throw new Error(`missing dep ${d} for ${m.name}`);
      visit(dep, [...path, m.name]);
    }
    seen.add(m.name);
    out.push(m);
  };
  mods.forEach(m => visit(m));
  return out;
}

export class App {
  constructor({ events, state, dom, log, appVersion, coreVersion }) {
    this.events = events;
    this.state = state;
    this.dom = dom;
    this.log = log;
    this.appVersion = appVersion;
    this.coreVersion = coreVersion;
    this._mods = [];
    this._apis = {};
    this._hooks = new Map();
    this.bootOrder = [];
  }
  register(m) {
    if (!m?.name || !m?.init) throw new Error('module needs name+init');
    this._mods.push(m);
  }
  get(name) { return this._apis[name]; }
  boot() {
    const order = topoSort(this._mods);
    this.bootOrder = order.map(m => m.name);
    this.log?.(`app v${this.appVersion} / core v${this.coreVersion}`);
    this.log?.(`modules: ${order.map(m => `${m.name}@${m.version}`).join(' ')}`);
    const ctx = { app: this, events: this.events, state: this.state, dom: this.dom, log: this.log };
    for (const m of order) {
      try {
        const api = m.init(ctx) || {};
        this._apis[m.name] = api;
        if (m.hooks) this._hooks.set(m.name, m.hooks);
        this.log?.(`boot ${m.name}@${m.version}`);
      } catch (e) {
        console.error(`[boot] ${m.name} failed`, e);
      }
    }
    this.events.on('theme:change', (p) => this._fire('onThemeChange', p));
    this.state.subscribe((patch, prev) => this._fire('onStateChange', { patch, prev }));
    window.addEventListener('resize', () => this._fire('onResize'));
    this.state.subscribe((patch) => this.events.emit('state:patch', patch));
  }
  _fire(hook, arg) {
    for (const [name, h] of this._hooks) {
      try { h[hook]?.(arg); } catch (e) { console.error(`[hook:${name}:${hook}]`, e); }
    }
  }
}

export default App;