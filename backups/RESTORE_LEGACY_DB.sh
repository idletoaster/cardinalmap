#!/bin/bash
# Rollback to legacy prod state.
# Pre-requisite: cardinalmap database still exists (was preserved).
# Run this to point the app back at cardinalmap instead of cardinalmap_upgraded.
set -e
cd ~/cardinalmap
echo "1) restoring .env PGDATABASE=cardinalmap"
sed -i 's/^PGDATABASE=cardinalmap_upgraded/PGDATABASE=cardinalmap/' .env
grep PGDATABASE .env
echo "2) restarting PM2"
pm2 restart cardinalmap
echo "3) verifying"
curl -s http://127.0.0.1:3000/healthz
