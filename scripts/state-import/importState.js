// scripts/state-import/importState.js
// Orchestrator: download PBF -> extract admin+POIs -> load into DB.
// Designed to be called once per state.
//
// Usage:
//   PGHOST=... PGDATABASE=cardinalmap_upgraded node scripts/state-import/importState.js <state-name|state-code>
//   e.g. node scripts/state-import/importState.js california
//        node scripts/state-import/importState.js CA
//
// Skips already-imported states (detects by state_code in regions where is_state_synthetic=true).
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs = require('fs');
const path = require('path');
const { byCode, byName, STATES } = require('./states');
const { downloadPbf, STATE_PBF_DIR } = require('./downloadPbf');
const { extractAdminBoundaries, extractPOIs } = require('./extractOsm');
const { loadAdminBoundaries } = require('./loadAdmin');
const { loadPOIs } = require('./loadPois');

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node importState.js <state-name|state-code> [--force] [--wipe]');
    process.exit(2);
  }
  const state = byCode(arg.toUpperCase()) || byName(arg.toLowerCase());
  if (!state) { console.error('Unknown state:', arg); process.exit(2); }

  const force = process.argv.includes('--force');
  const wipe = process.argv.includes('--wipe');

  // Override DB target via env if not already set.
  process.env.PGDATABASE = process.env.PGDATABASE || 'cardinalmap_upgraded';

  const pool = require('../../src/db/pool');

  if (wipe) {
    console.log(`[wipe] removing state ${state.code} rows`);
    await pool.query(
      `DELETE FROM regions WHERE state_code=$1 OR parent_state_region_id IN
        (SELECT id FROM regions WHERE state_code=$1 AND is_state_synthetic=true)`,
      [state.code],
    );
  }

  // Skip if already imported.
  const exists = await pool.query(
    `SELECT id FROM regions WHERE state_code=$1 AND is_state_synthetic=true LIMIT 1`,
    [state.code],
  );
  if (exists.rows.length && !force) {
    console.log(`[skip] ${state.name}: state region already exists (id=${exists.rows[0].id}). Use --force --wipe to redo.`);
    process.exit(0);
  }

  const t0 = Date.now();
  const adminOut = path.join(STATE_PBF_DIR, `${state.name}.admin.geojson`);
  const poiOut = path.join(STATE_PBF_DIR, `${state.name}.pois.geojson`);
  const pbf = path.join(STATE_PBF_DIR, `${state.name}-latest.osm.pbf`);

  console.log(`[1/4] download ${state.name} PBF`);
  await downloadPbf(state.name, {
    force: false,
    onProgress: (d, t) => process.stdout.write(`  ${(d / 1024 / 1024).toFixed(1)} / ${(t / 1024 / 1024).toFixed(1)} MB\r`),
  });
  console.log(`\n  -> ${pbf} (${(fs.statSync(pbf).size / 1024 / 1024).toFixed(1)} MB)`);

  console.log(`[2/4] extract admin boundaries`);
  await extractAdminBoundaries(pbf, adminOut);
  console.log(`  -> ${adminOut}`);

  console.log(`[3/4] extract POIs`);
  await extractPOIs(pbf, poiOut);
  console.log(`  -> ${poiOut}`);

  console.log(`[4/4] load into DB`);
  const adminResult = await loadAdminBoundaries(pool, state, adminOut);
  console.log(`  state region: id=${adminResult.stateRegionId}, counties=${adminResult.counties.length}, cities=${adminResult.cities.length}`);
  const poiResult = await loadPOIs(pool, adminResult.stateRegionId, adminResult.cities, poiOut);
  console.log(`  POIs: inserted=${poiResult.inserted} skipped=${poiResult.skipped}`);

  console.log(`[done] ${state.name} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[importState] FAIL:', e.message);
  console.error(e.stack);
  process.exit(1);
});