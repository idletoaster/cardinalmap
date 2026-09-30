'use strict';

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const morgan = require('morgan');

const cfg = require('../config');
const log = require('./util/logger');

const searchRoutes    = require('./routes/search');
const locationRoutes  = require('./routes/location');
const directionRoutes = require('./routes/direction');
const poiRoutes       = require('./routes/poi');
const adminRoutes     = require('./routes/admin');

const APP_VERSION  = '2.5.3';
const CORE_VERSION = '1.0.0';
const MODULES = {
  api: '1.2.0', theme: '1.0.0', map: '1.7.0', wedge: '1.1.0', city: '1.3.0',
  direction: '1.1.0', poi: '1.3.0', search: '1.1.0', geolocate: '1.0.0',
  sheet: '1.4.0', compass: '1.1.0', level: '1.1.0', 'style-toggle': '1.0.0',
  toast: '1.0.0', 'debug-hud': '1.0.0', 'back-to-city': '1.2.0',
};

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '64kb' }));
app.use(morgan(cfg.nodeEnv === 'production' ? 'combined' : 'dev'));

// API routes
app.use('/api', searchRoutes);
app.use('/api', locationRoutes);
app.use('/api', directionRoutes);
app.use('/api', poiRoutes);
app.use('/api/admin', adminRoutes);

// --- New version + shell-manifest endpoints ---
app.get('/api/version', (_req, res) => {
  res.json({
    app: APP_VERSION,
    core: CORE_VERSION,
    modules: MODULES,
    serverTime: new Date().toISOString(),
  });
});

function buildShellManifest() {
  const items = [];
  const PUBLIC_DIR_LOCAL = path.join(__dirname, '..', 'public');
  const walk = (rel) => {
    const full = path.join(PUBLIC_DIR_LOCAL, rel);
    if (!fs.existsSync(full)) return;
    for (const ent of fs.readdirSync(full, { withFileTypes: true })) {
      const childRel = rel ? path.posix.join(rel, ent.name) : ent.name;
      if (ent.isDirectory()) walk(childRel);
      else if (ent.isFile() && ent.name.endsWith('.js')) {
        const fp = path.join(PUBLIC_DIR_LOCAL, childRel);
        let mtime = 0;
        try { mtime = Math.floor(fs.statSync(fp).mtimeMs); } catch {}
        const urlPath = '/' + childRel.split(path.sep).join('/');
        items.push({ path: urlPath, mtime });
      }
    }
  };
  walk('js/core');
  walk('js/modules');
  return items;
}

app.get('/api/shell-manifest', (_req, res) => {
  res.json({ version: 'cardinalmap-v7', items: buildShellManifest() });
});

// Health
app.get('/healthz', (_req, res) => res.json({ ok: true, version: APP_VERSION }));

// Static PWA
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function moduleMtime(absRel) {
  try {
    const fp = path.join(PUBLIC_DIR, absRel);
    return String(Math.floor(fs.statSync(fp).mtimeMs));
  } catch { return String(Date.now()); }
}

// Cache-bust /js/app.js AND rewrite all relative `./...` imports (incl. core/, modules/).
app.get(/^\/js\/.*\.js(?:\?.*)?$/, (req, res, next) => {
  // request URL may include ?v=<mtime>; strip it before reading the file
  const urlPath = req.path;  // already has leading '/'
  const filePath = path.join(PUBLIC_DIR, urlPath);
  fs.readFile(filePath, 'utf8', (err, code) => {
    if (err) return next(err);
    const v = moduleMtime(urlPath.slice(1));
    const busted = code.replace(
      /(from\s+['"])(\.{1,2}\/[^"']+)(['"])/g,
      (_m, head, spec, tail) => {
        // resolve to /js/<...>
        let rel = spec;
        if (rel.startsWith('./')) rel = rel.slice(2);
        else if (rel.startsWith('../')) {
          const parts = rel.split('/');
          const stack = [];
          for (const p of parts) {
            if (p === '..') stack.pop();
            else if (p !== '.') stack.push(p);
          }
          rel = stack.join('/');
        }
        const abs = '/js/' + rel;
        const mv = moduleMtime(abs.slice(1));
        return `${head}${abs}?v=${mv}${tail}`;
      }
    );
    res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(busted);
  });
});

app.use(express.static(PUBLIC_DIR, {
  index: false,
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (/\.html$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/\.(?:css|js)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store');
    } else if (/\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=21600, must-revalidate');
    }
  },
}));

// SPA fallback
app.get(/^\/(?!api\/|healthz$).*/, (_req, res, next) => {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  fs.readFile(indexPath, 'utf8', (err, html) => {
    if (err) return next(err);
    const v = moduleMtime('js/app.js');
    const cssV = moduleMtime('css/app.css');
    let out = html.replace(/src="\/js\/app\.js"/g, `src="/js/app.js?v=${v}"`);
    out = out.replace(/href="\/css\/app\.css"/g, `href="/css/app.css?v=${cssV}"`);
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(out);
  });
});

// Error handler
app.use((err, _req, res, _next) => {
  log.error('unhandled', { msg: err.message, stack: err.stack });
  if (err.status) return res.status(err.status).json({ error: err.message });
  res.status(500).json({ error: 'internal error' });
});

const port = cfg.port;
app.listen(port, () => log.info(`cardinalmap listening on :${port}`, { origin: cfg.publicOrigin || '(none)', version: APP_VERSION }));