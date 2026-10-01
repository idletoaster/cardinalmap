// scripts/state-import/downloadPbf.js
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { geofabrikUrl } = require('./states');

const STATE_PBF_DIR = '/tmp/osm';

/**
 * Download a state's OSM PBF file from Geofabrik.
 * Uses redirect-following https.get so 302 redirects work transparently.
 * Returns absolute path of the downloaded file.
 */
function downloadPbf(stateName, { force = false, onProgress } = {}) {
  const url = geofabrikUrl(stateName);
  const destDir = STATE_PBF_DIR;
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, `${stateName}-latest.osm.pbf`);

  if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    return Promise.resolve(dest);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    function settle(fn) {
        if (settled) return;
        settled = true;
        fn();
      }
    const req = https.get(url, { timeout: 30000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const next = res.headers.location;
        if (!next) return settle(() => reject(new Error('redirect without Location')));
        // Recurse with new URL.
        const nextReq = https.get(next, { timeout: 30000 }, (res2) => {
          if (res2.statusCode !== 200) {
            return settle(() => reject(new Error(`HTTP ${res2.statusCode} after redirect`)));
          }
          const ws = fs.createWriteStream(dest);
          let downloaded = 0;
          const total = parseInt(res2.headers['content-length'] || '0', 10);
          res2.on('data', (chunk) => {
            downloaded += chunk.length;
            if (onProgress && total) onProgress(downloaded, total);
          });
          res2.pipe(ws);
          ws.on('finish', () => ws.close(() => settle(() => resolve(dest))));
          ws.on('error', (e) => settle(() => reject(e)));
        });
        nextReq.on('error', (e) => settle(() => reject(e)));
        return;
      }
      if (res.statusCode !== 200) {
        return settle(() => reject(new Error(`HTTP ${res.statusCode} for ${url}`)));
      }
      const ws = fs.createWriteStream(dest);
      let downloaded = 0;
      const total = parseInt(res.headers['content-length'] || '0', 10);
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress && total) onProgress(downloaded, total);
      });
      res.pipe(ws);
      ws.on('finish', () => ws.close(() => settle(() => resolve(dest))));
      ws.on('error', (e) => settle(() => reject(e)));
    });
    req.on('error', (e) => settle(() => reject(e)));
    req.on('timeout', () => {
      req.destroy(new Error('connect timeout'));
    });
  });
}

module.exports = { downloadPbf, STATE_PBF_DIR };