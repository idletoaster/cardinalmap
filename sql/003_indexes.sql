-- Additional composite / partial indexes that speed up the 8-direction query
CREATE INDEX IF NOT EXISTS pois_geom_gist_brin ON pois USING GIST (geom)
  WITH (fillfactor=90);
