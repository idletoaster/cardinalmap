#!/usr/bin/env node
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const SQL_DIR = path.join(__dirname, '..', 'sql');

async function main() {
  // First connect to the 'postgres' DB to CREATE DATABASE if missing.
  const adminCfg = {
    host: process.env.PGHOST || '127.0.0.1',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'cardinalmap',
    password: process.env.PGPASSWORD || 'cardinalmap_dev_pw',
    database: 'postgres',
  };
  const dbName = process.env.PGDATABASE || 'cardinalmap';

  const admin = new Client(adminCfg);
  await admin.connect();
  const { rows: dbs } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!dbs.length) {
    console.log(`[migrate] creating database "${dbName}"`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } else {
    console.log(`[migrate] database "${dbName}" exists`);
  }
  await admin.end();

  // Now connect to the target DB and apply sql files in order.
  const target = new Client({
    host: adminCfg.host, port: adminCfg.port,
    user: adminCfg.user, password: adminCfg.password, database: dbName,
  });
  await target.connect();

  const files = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(SQL_DIR, f), 'utf8');
    console.log(`[migrate] applying ${f}`);
    await target.query(sql);
  }

  await target.end();
  console.log('[migrate] done');
}

main().catch((e) => { console.error('[migrate] FAILED:', e); process.exit(1); });
