// toast module - lightweight toast(msg, type). v1.0.0
export const name = 'toast';
export const version = '1.0.0';
export const deps = [];

export function init({ log }) {
  let host = document.querySelector('#toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    document.body.appendChild(host);
  }

  function toast(msg, type = 'info', timeout = 2500) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 300);
    }, timeout);
    log?.(`toast: ${msg}`);
  }

  return { toast };
}

export default { name, version, deps, init };