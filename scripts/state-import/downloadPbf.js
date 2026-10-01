// scripts/state-import/downloadPbf.js
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { geofabrikUrl } = require('./states');

const STATE_PBF_DIR = '/tmp/osm';

/**
 * Download a state's OSM PBF from Geofabrik via curl -L (follows redirects).
 * Returns absolute path of the downloaded file.
 */
function downloadPbf(stateName, { force = false, onProgress } = {}) {
  const url = geofabrikUrl(stateName);
  if (!fs.existsSync(STATE_PBF_DIR)) fs.mkdirSync(STATE_PBF_DIR, { recursive: true });
  const dest = path.join(STATE_PBF_DIR, `${stateName}-latest.osm.pbf`);
  if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    return Promise.resolve(dest);
  }

  return new Promise((resolve, reject) => {
    const args = ['-sSL', '--fail', '-o', dest, url];
    if (onProgress) args.push('--write-out', '%{size_download} %{speed_download}\n');
    const proc = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.stdout.on('data', () => { /* drain */ });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
        resolve(dest);
      } else {
        reject(new Error(`curl exited ${code}: ${stderr.slice(0, 500)}`));
      }
    });
  });
}

module.exports = { downloadPbf, STATE_PBF_DIR };
