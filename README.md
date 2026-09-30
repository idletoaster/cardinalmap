# CardinalMap

A self-hosted, **100% open-source, zero-API-cost**, mobile-first PWA for finding
POIs (convenience stores, gas stations, lottery retailers, and any category you
add) by an **8-direction compass** from your location.

Built on:
- **PostgreSQL + PostGIS** for spatial storage and the `ST_Azimuth` 8-direction filter
- **Node.js + Express** backend managed by **pm2**
- **MapLibre GL JS** with **OpenFreeMap** (Positron / Dark Liberty) tiles
- **Nominatim** for typeahead search, **Overpass API** for POI ingestion
- A **service worker** for shell + tile caching

The PWA is served at `/` by Express and works correctly behind a reverse-proxy
chain (Cloudflare Tunnel → Nginx Proxy Manager → Node :3000).

---

## Architecture

```
cardinalmap/
├── config/
│   ├── poi-categories.json      # Add new POI categories here (no code changes)
│   └── index.js                  # central config (env-driven)
├── sql/
│   ├── 001_extensions.sql        # CREATE EXTENSION postgis
│   ├── 002_schema.sql            # regions, neighborhoods, admin_boundaries, pois, poi_categories
│   └── 003_indexes.sql
├── scripts/
│   ├── install-postgis.sh        # apt install + create db/user + enable PostGIS
│   ├── migrate.js                # applies all sql/*.sql files
│   └── seed-categories.js        # seeds poi_categories from config/poi-categories.json
├── src/
│   ├── server.js                 # Express app entry
│   ├── db/pool.js                # pg Pool
│   ├── overpass/{client,bbox,regionQuery,neighborhoodQuery,poiQuery}.js
│   ├── nominatim/client.js
│   ├── spatial/{sectors,azimuth}.js   # 8-direction logic + ST_Azimuth SQL
│   ├── services/ingestRegion.js      # cache TTL + ingestion orchestration
│   ├── routes/{search,location,direction,poi,admin}.js
│   └── util/{miles,logger}.js
└── public/                       # served at / by Express
    ├── index.html
    ├── manifest.json
    ├── sw.js                     # service worker (shell + tile cache)
    ├── icons/{icon.svg,icon-192.png,icon-512.png}
    ├── css/app.css
    └── js/{app,map,compass,bottomSheet,search,api}.js
```

---

## Adding a new POI category (zero code changes)

Append to `config/poi-categories.json`:

```json
{
  "id": "restaurants",
  "label": "Restaurants",
  "icon": "fork-knife",
  "color": "#e74c3c",
  "enabled": true,
  "overpass": {
    "selectors": [["amenity", "restaurant"], ["amenity", "cafe"]],
    "outFields": ["name", "addr:street", "addr:housenumber", "addr:city",
                  "addr:state", "addr:postcode", "opening_hours",
                  "phone", "website", "brand"]
  }
}
```

Then re-seed and restart pm2:

```bash
npm run seed-categories
pm2 restart cardinalmap
```

That's it. The Overpass query, the DB schema, and the spatial routing code
are all generic. New POIs show up automatically in the list, map, and direction filter.

---

## Deploy (first time)

This server (192.168.125.23, Ubuntu 24.04):

```bash
# 1. Install system deps (already done): Node 20, npm, pm2, Postgres 16, PostGIS 3
sudo apt install -y postgresql postgresql-contrib postgis postgresql-postgis
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs && sudo npm install -g pm2

# 2. Create the DB (idempotent)
bash scripts/install-postgis.sh

# 3. Install Node deps
cd ~/cardinalmap && npm install

# 4. Configure
cp .env.example .env
# Generate an admin token:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Paste it as ADMIN_TOKEN= in .env

# 5. Migrate and seed
npm run migrate
npm run seed-categories

# 6. Start
pm2 start src/server.js --name cardinalmap
pm2 save
# Optional: survive reboots
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u pawan --hp /home/pawan
```

The app listens on `:3000`. Forward it with Nginx Proxy Manager and/or
Cloudflare Tunnel as usual.

---

## Admin API

All `/api/admin/*` endpoints require `Authorization: Bearer $ADMIN_TOKEN`.

```
GET  /api/admin/stats
POST /api/admin/refresh   { lat, lon, label? }
```

Force a refresh of the Austin region:

```bash
TOKEN=$(grep ^ADMIN_TOKEN= .env | cut -d= -f2-)
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"lat":30.2672,"lon":-97.7431,"label":"Austin"}' \
  http://127.0.0.1:3000/api/admin/refresh
```

---

## Public API

```
GET /api/search?q=austin                  # Nominatim typeahead
GET /api/locate?lat=&lon=&label=          # resolve + ensure cache + return
GET /api/direction?lat=&lon=&dir=NE       # ST_Azimuth 8-direction slice
GET /api/direction?lat=&lon=&dir=NE&cats=fuel,convenience
GET /api/poi/:id                          # single POI detail
```

`dir` is one of: `N NE E SE S SW W NW`.

---

## Map style

- Default: **Positron** (light)
- Toggle button (top-right): switches to **Dark Liberty**
- Auto-switch follows `prefers-color-scheme` unless the user has explicitly toggled

State is persisted in `localStorage` under `cm.style`.

---

## Cache behavior

- Region cache TTL: **30 days** (configurable via `APP_CACHE_TTL_DAYS`)
- On `/api/locate`, if cache is fresh: no Overpass call
- If stale or `?force=1` or `/api/admin/refresh`: full re-ingest
- Overpass client retries 3× with backoff on 429/504

---

## Operating notes

- `lottery=yes` in OSM matches a lot of gas stations / convenience stores globally.
  For a 10-mile Austin bbox it usually returns 0 — most `lottery=yes` tagging is sparse.
  `shop=lottery` is also rare. Expect 0–3000 POIs per category depending on region
  and tag density.
- Public Overpass (`overpass-api.de`) is best-effort. 504s are common.
  Consider self-hosting Overpass or running a mirror for production.
- Nominatim's public endpoint is rate-limited to ~1 req/sec.
  For production, self-host Nominatim or use a paid provider.
- The service worker caches up to 50 map tiles for offline use of the last area.

---

## pm2 cheat sheet

```bash
pm2 status                    # process status
pm2 logs cardinalmap           # tail logs
pm2 restart cardinalmap        # restart after config change
pm2 stop cardinalmap           # stop
pm2 delete cardinalmap         # remove from pm2 list
pm2 save                       # persist current process list
```

---

## License

MIT.
