// scripts/state-import/importAll.js
// Bulk-import all US states (skipping those already imported) into cardinalmap_upgraded.
// Bounded concurrency: 2 at a time on a 2-core/4GB-RAM box.
//
// Usage: PGDATABASE=cardinalmap_upgraded node scripts/state-import/importAll.js [concurrency]
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { spawn } = require('child_process');
const { STATES } = require('./states');

const CONCURRENCY = Math.max(1, parseInt(process.argv[2] || '2', 10));
process.env.PGDATABASE = process.env.PGDATABASE || 'cardinalmap_upgraded';

function runImport(stateName) {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, ['scripts/state-import/importState.js', stateName], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('exit', (code) => {
      resolve({ state: stateName, code, stdout, stderr });
    });
  });
}

async function pool(items, n, fn) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      const item = items[idx];
      const res = await fn(item);
      results.push(res);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log(`[bulk] starting, ${STATES.length} states, concurrency=${CONCURRENCY}`);
  const t0 = Date.now();
  const results = await pool(STATES.map((s) => s.name), CONCURRENCY, async (name) => {
    const t1 = Date.now();
    const res = await runImport(name);
    const dt = ((Date.now() - t1) / 1000).toFixed(1);
    const ok = res.code === 0 || (res.stdout && res.stdout.includes('[done]')) || (res.stdout && res.stdout.includes('[skip]'));
    console.log(`[bulk] ${ok ? 'OK' : 'FAIL'} ${name} (${dt}s, exit=${res.code})`);
    if (!ok && res.stderr) console.error(`  stderr: ${res.stderr.split('\n')[0]}`);
    return res;
  });

  const ok = results.filter((r) => r.code === 0 || (r.stdout && (r.stdout.includes('[done]') || r.stdout.includes('[skip]')))).length;
  const fail = results.length - ok;
  console.log(`[bulk] done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${ok} ok, ${fail} fail`);
}

main().catch((e) => { console.error(e); process.exit(1); });
