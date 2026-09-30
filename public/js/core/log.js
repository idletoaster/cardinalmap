// log.js - tagged logger gated on localStorage['cm.debug']. v1.0.0
export const name = 'log';
export const version = '1.0.0';
export const deps = [];

const TAG = '[cardinalmap]';
const enabled = () => { try { return localStorage.getItem('cm.debug') === '1'; } catch { return false; } };

export function log(...args) { if (enabled()) console.log(TAG, ...args); }
export function warn(...args) { console.warn(TAG, ...args); }
export function err(...args) { console.error(TAG, ...args); }

export default log;