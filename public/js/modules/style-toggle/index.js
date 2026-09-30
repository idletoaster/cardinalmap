// style-toggle module - topbar #style-toggle click -> theme.cycle(). v1.0.0
export const name = 'style-toggle';
export const version = '1.0.0';
export const deps = ['theme'];

export function init({ app, log }) {
  document.querySelector('#style-toggle')?.addEventListener('click', () => {
    app.get('theme')?.cycle();
  });
  log?.('style-toggle ready');
  return {};
}

export default { name, version, deps, init };