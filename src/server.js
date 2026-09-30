'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const morgan = require('morgan');

const cfg = require('../config');
const log = require('./util/logger');

const searchRoutes    = require('./routes/search');
const locationRoutes  = require('./routes/location');
const directionRoutes = require('./routes/direction');
const poiRoutes       = require('./routes/poi');
const adminRoutes     = require('./routes/admin');

const app = express();

// Trust the Cloudflare / Nginx proxy chain so req.ip / X-Forwarded-* work.
app.set('trust proxy', true);

// Body parsing for /api/admin
app.use(express.json({ limit: '64kb' }));

// Request log
app.use(morgan(cfg.nodeEnv === 'production' ? 'combined' : 'dev'));

// API routes
app.use('/api', searchRoutes);
app.use('/api', locationRoutes);
app.use('/api', directionRoutes);
app.use('/api', poiRoutes);
app.use('/api/admin', adminRoutes);

// Health
app.get('/healthz', (_req, res) => res.json({ ok: true, version: '1.0.0' }));

// Static PWA. Serve the PWA at the root "/" so it works behind a reverse proxy.
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Cache headers for hashed assets could go here; for simplicity we keep no-cache for HTML.
app.use(express.static(PUBLIC_DIR, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (/\.html$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/\.(?:png|jpg|jpeg|svg|webp|ico|css|js|woff2?)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable'); // 7d
    }
  },
}));

// SPA fallback: any non-/api GET serves index.html so client-side routes work.
app.get(/^\/(?!api\/|healthz$).*/, (_req, res, next) => {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  res.sendFile(indexPath, (err) => { if (err) next(err); });
});

// Error handler
app.use((err, _req, res, _next) => {
  log.error('unhandled', { msg: err.message, stack: err.stack });
  if (err.status) return res.status(err.status).json({ error: err.message });
  res.status(500).json({ error: 'internal error' });
});

const port = cfg.port;
app.listen(port, () => log.info(`cardinalmap listening on :${port}`, { origin: cfg.publicOrigin || '(none)' }));
