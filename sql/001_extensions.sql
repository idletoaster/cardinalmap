-- Enable PostGIS. Run as superuser (postgres role) on the cardinalmap database.
-- Note: postgis_topology requires superuser too; we don't use it.
CREATE EXTENSION IF NOT EXISTS postgis;
