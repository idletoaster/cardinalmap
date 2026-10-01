// scripts/state-import/extractOsm.js
// Uses osmium to extract subsets of a state PBF into GeoJSON files.
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => { stdout += d.toString(); });
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('error', reject);
    p.on('exit', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited ${code}: ${stderr || stdout}`));
    });
  });
}

/**
 * Extract admin boundaries with admin_level in [4,6,8] as GeoJSON.
 * Level 4 = state boundary, 6 = county, 8 = city/place.
 */
async function extractAdminBoundaries(pbfPath, outPath) {
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) return outPath;
  // tags-filter: nwr/way/relation with admin_level tag, in allowed values.
  // First filter, then convert to GeoJSON.
  const tmp = outPath + '.tmp.osm';
  await run('osmium', [
    'tags-filter',
    pbfPath,
    'r/admin_level=4,6,8',
    '-o', tmp,
  ]);
  await run('osmium', [
    'export',
    tmp,
    '-f', 'geojson',
    '-o', outPath,
    '--geometry-types=polygon',
    '-u', 'type_id',
  ]);
  fs.unlinkSync(tmp);
  return outPath;
}

/**
 * Extract candidate POIs by tags. Brand selectors + shop=convenience + amenity=fuel + lottery=yes.
 * Returns GeoJSON FeatureCollection.
 */
async function extractPOIs(pbfPath, outPath) {
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) return outPath;
  const tmp = outPath + '.tmp.osm';
  // Build tags-filter expression from common POI tags. Conservative set — we'll
  // accept false positives; the loader will skip rows that aren't in poi_categories.
  await run('osmium', [
    'tags-filter',
    pbfPath,
    'nwr/shop',
    'nwr/amenity',
    'nwr/brand',
    'nwr/operator',
    'nwr/lottery',
    '-o', tmp,
  ]);
  await run('osmium', [
    'export',
    tmp,
    '-f', 'geojson',
    '-o', outPath,
    '--geometry-types=point',
    '-u', 'type_id',
  ]);
  fs.unlinkSync(tmp);
  return outPath;
}

module.exports = { extractAdminBoundaries, extractPOIs };