#!/usr/bin/env node
'use strict';

require('dotenv').config();
const path = require('path');
const pool = require('../src/db/pool');
const cfg = require('../config');

async function main() {
  for (const c of cfg.poiCategories) {
    await pool.query(
      `INSERT INTO poi_categories (id, label, icon, color, enabled, config_json)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
         SET label       = EXCLUDED.label,
             icon        = EXCLUDED.icon,
             color       = EXCLUDED.color,
             enabled     = EXCLUDED.enabled,
             config_json = EXCLUDED.config_json,
             updated_at  = now()`,
      [c.id, c.label, c.icon, c.color, !!c.enabled, c]
    );
    console.log(`[seed] category ${c.id}`);
  }
  await pool.end();
  console.log('[seed] done');
}

main().catch((e) => { console.error('[seed] FAILED:', e); process.exit(1); });
