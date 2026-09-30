'use strict';

const { Pool } = require('pg');
const cfg = require('../../config');

const pool = new Pool({
  host: cfg.pg.host,
  port: cfg.pg.port,
  user: cfg.pg.user,
  password: cfg.pg.password,
  database: cfg.pg.database,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[pg] idle client error:', err);
});

module.exports = pool;
