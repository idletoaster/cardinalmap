#!/usr/bin/env bash
# CardinalMap: install Postgres + PostGIS + create db/user.
# Run as a user with sudo (i.e., `pawan` on this server). Idempotent.
set -euo pipefail

echo "[install-postgis] checking apt presence of postgres+postgis..."
if ! dpkg -l postgresql-16-postgis-3 >/dev/null 2>&1; then
  echo "[install-postgis] installing postgresql + postgis..."
  sudo apt-get update
  sudo apt-get install -y postgresql postgresql-contrib postgis postgresql-postgis
fi

DB="${PGDATABASE:-cardinalmap}"
USER="${PGUSER:-cardinalmap}"
PW="${PGPASSWORD:-cardinalmap_dev_pw}"

echo "[install-postgis] ensuring role '$USER'..."
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$USER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER $USER WITH PASSWORD '$PW';"

echo "[install-postgis] ensuring database '$DB'..."
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE $DB OWNER $USER;"

echo "[install-postgis] enabling postgis in $DB..."
sudo -u postgres psql -d "$DB" -c "CREATE EXTENSION IF NOT EXISTS postgis;" >/dev/null
sudo -u postgres psql -d "$DB" -c "GRANT ALL ON SCHEMA public TO $USER;" >/dev/null

echo "[install-postgis] done."
