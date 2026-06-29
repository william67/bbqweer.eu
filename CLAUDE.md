# bbqweer.eu

## What is this?
Public KNMI weather data platform — a standalone website spun out of wo-ict.nl.
Goal: expose KNMI weather data, forecasts, and charts publicly at bbqweer.eu.

## Status: live in production
Running locally and deployed to Hetzner VPS at https://bbqweer.eu (HTTPS, Let's Encrypt). KNMI data sync completed. Frontend live via nginx.

## Project Structure
```
C:\Apps\bbqweer.eu\
├── frontend/               — Angular 19, NgModule-based, PrimeNG v21, AnyChart
│   ├── src/app/
│   │   │   ├── pages/knmidata/ — KnmiDataComponent + ForecastComponent (lazy module)
│   │   ├── pages/planetarium/ — PlanetariumComponent (lazy module)
│   │   ├── pages/energy-prices/ — EnergyPricesComponent (lazy module)
│   │   ├── pages/solar/    — SolarComponent (lazy module)
│   │   ├── pages/lightning/ — LightningComponent (lazy module) — real-time strike map
│   │   ├── components/     — my-knmi-anychart, my-knmi-chartjs, my-knmi-table,
│   │   │                     my-planetarium, login
│   │   ├── services/       — knmi-reports, forecast, anychart, local-storage,
│   │   │                     stars, planetarium-calc, satellites, satellite-js,
│   │   │                     energy-prices, solar, lightning
│   │   └── layout/         — topbar, footer, layout (AppLayoutModule)
│   └── proxy.conf.json     — deleted; not needed (environment.ts uses full localhost:3000 URL directly)
├── backend/                — Node.js/Express, CommonJS
│   ├── app.js              — Express + Socket.IO + node-cron wiring
│   ├── socket/             — blitzortung.js (WSS → Redis → Socket.IO)
│   ├── config.ini          — Docker settings (host=mysql, port=3306) — NOT in git
│   ├── config.local.ini    — Local dev settings (host=127.0.0.1, port=3307) — NOT in git
│   ├── routes/             — knmi-reports, stars, satellites, auth, users, energy-prices, solar
│   ├── helpers/            — mysqlpool-knmi.helper.js, server-tasks.js
│   ├── tasks/              — knmidata-v4.js, satellites-sync.js, energy-prices-sync.js
│   ├── callSyncKnmiData.js        — manual sync trigger (uses knmidata-v4)
│   ├── callSyncEnergiePrices.js   — manual/historical energy price sync from energyzero.nl
│   ├── createUser.js       — one-off admin user creation script
│   └── importReports.js    — import JSON configs into categories/datasets/reports_new
├── database/
│   ├── init/               — MySQL init scripts (run once on first container start)
│   │   ├── 01-schema.sql   — full bbqweer schema (tables, views, stored procedures)
│   │   ├── 02-extras.sql   — column_mapping, users, server-tasks, logfile tables
│   │   ├── 03-column-mapping.sql — 42 column display config rows
│   │   ├── 04-datafiles.sql — 1000 KNMI datafile rows
│   │   ├── 05-server-tasks.sql — seed rows for knmidata-sync, satellites-sync
│   │   ├── 06-stations.sql — 51 KNMI weather stations
│   │   ├── 07-neerslagstations.sql — 343 precipitation stations
│   │   ├── 08-energy-prices.sql — energie_prices table
│   │   └── 09-datafiles-http-lastmod.sql — http_lastmod column for datafiles
│   ├── knmi reports/       — JSON export files per dataset (versioned, import via UI)
│   ├── fix-procedures.sql  — one-time fix: lowercase table names in stored procedures
│   ├── migrate-uurgeg-datum-tijd.sql — one-time: rename DATUM_TIJD → DATUM_TIJD_VAN, add DATUM_TIJD_TOT (run on live DB)
│   ├── mysql-binlog-expire.cnf — MySQL config: binlog_expire_logs_seconds = 604800 (7 days)
│   └── knmi_stars.sql      — HYG star catalogue (87,475 rows)
├── docs/                   — Documentation
│   ├── system-architecture.md
│   ├── knmi-data-sync.md
│   ├── docker-guide.md
│   ├── dev-workflow.md
│   ├── deploy-to-hetzner.md
│   └── knmi-config-export-import.md
├── nginx/nginx.conf        — serves bbqweer.eu; HTTP→HTTPS redirect + SSL + /api/* proxy to nodejs:3000
├── deploy-hetzner.ps1      — automated deploy script (build + upload + VPS git pull + health check)
├── .env                    — MySQL root + app passwords — NOT in git
├── .gitignore
└── docker-compose.yml
```

## Running Stack

### Docker services
| Container | Image | Port |
|-----------|-------|------|
| bbqweer-mysql | mysql:8.0 | 3307 (host) / 3306 (internal) |
| bbqweer-redis | redis:8-alpine | internal only (6379 exposed on host via docker-compose.local.yml) |
| bbqweer-nodejs | node:20-alpine (built from backend/) | 3000 (internal only) |
| bbqweer-nginx | nginx:alpine | 80, 443 |
| bbqweer-certbot | certbot/certbot | — (auto-renew) |

### Local dev (Stage 1)
Leave Docker running (MySQL always available). Cron tasks auto-disabled when `config.local.ini` exists.
```powershell
# Terminal 1 — backend with nodemon (auto-restarts on file changes)
# VS Code: Ctrl+Shift+B runs the nodemon task — no manual restart needed after editing backend files
cd backend && nodemon app.js      # uses config.local.ini, cron tasks disabled

# Terminal 2
cd frontend && ng serve --open    # proxies /api/* to localhost:3000, live reload via poll
```

### Full Docker local (Stage 2 — no HTTPS)
Uses `docker-compose.local.yml` override — HTTP only, no SSL certs needed.

```powershell
# Build with timestamp, deploy, restore placeholder (run from project root)
node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts',ts=new Date().toISOString().replace('T',' ').substring(0,19);fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('BUILD_TIME_PLACEHOLDER',ts));console.log('Stamped:',ts);" && cd frontend && ng build --configuration=production && node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/,'BUILD_TIME_PLACEHOLDER'));console.log('Restored');"

# Restart nginx with local override (HTTP only, no certs)
cd c:/Apps/bbqweer.eu
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --no-build nginx
```

### Hetzner VPS (Stage 3 — HTTPS)
Uses `docker-compose.yml` only — nginx.conf has SSL, certs at `/opt/bbqweer/certbot_certs`.
See `docs/deploy-to-hetzner.md` for full deployment guide.

**Automated deploy** (requires clean working tree):
```powershell
.\deploy-hetzner.ps1   # build + scp dist + git pull + rebuild nodejs + restart nginx + health check
```

**MySQL Workbench via SSH tunnel:**
```powershell
ssh -L 3307:127.0.0.1:3307 root@65.109.129.96   # keep open while working
# then connect Workbench to 127.0.0.1:3307 as bbqweer_user
```

## Build Timestamp
- Footer shows `bbqweer.eu v1.0009 — YYYY-MM-DD HH:MM:SS` (version/timestamp in smaller font)
- `environment.production.ts` contains `buildTime: 'BUILD_TIME_PLACEHOLDER'`
- The build command above injects the real timestamp before `ng build`, then restores the placeholder
- **Never commit with a real timestamp** — always restore `BUILD_TIME_PLACEHOLDER` after building

## Config / Secrets

### config.ini (Docker — bind-mounted, never in git)
```ini
[mysql_knmi]
host     = mysql
port     = 3306
user     = bbqweer_user
password = ...
database = bbqweer

[jwt]
secret_key = ...
```

### config.local.ini (local dev — never in git, never in Docker image)
```ini
[mysql_knmi]
host     = 127.0.0.1
port     = 3307
...
```

The pool helper (`helpers/mysqlpool-knmi.helper.js`) auto-detects `config.local.ini` if it exists, falls back to `config.ini`. No manual switching needed.

### .env (root — never in git)
```ini
MYSQL_ROOT_PASSWORD=...
MYSQL_USER=bbqweer_user
MYSQL_PASSWORD=...
```

## Database

- Name: `bbqweer`
- Engine: MySQL 8.0, all InnoDB
- **Case sensitivity**: MySQL runs on Linux inside Docker — table names are case-sensitive. All SQL in tasks and stored procedures must use lowercase table names (`etmgeg`, `datafiles`, `logfile`, etc.)
- **No FK constraints** on etmgeg/uurgeg/neerslaggeg → stations. Intentional — KNMI data contains historical station codes with no station record.
- **Stored procedures**: `UpdateHistory()` chains 6 sub-procedures. All use lowercase table names (fixed directly in `01-schema.sql`).
- **Views**: 30+ `v_*` views defined in `01-schema.sql`. Sync reads from `v_etmgeg`, `v_uurgeg`, `v_neerslaggeg`.
- **uurgeg schema**: `DATUM_TIJD` was split into `DATUM_TIJD_VAN` (hour start, UTC) and `DATUM_TIJD_TOT` (hour end, UTC). Run `migrate-uurgeg-datum-tijd.sql` on any existing DB that still has the old column. New installs get the correct schema from `01-schema.sql`.

## Background Tasks

Scheduled in `backend/app.js` via `node-cron`:

| Task | Schedule | Description |
|------|----------|-------------|
| `knmidata-v4` | `0 * * * *` | KNMI weather data sync (two-pointer merge) |
| `satellites-sync` | `30 * * * *` | TLE sync from Celestrak |
| `energy-prices-sync` | `0 13-17 * * *` | Hourly electricity prices from energyzero.nl |

Manual trigger:
```powershell
# Local
cd backend
node callSyncKnmiData.js           # incremental
node callSyncKnmiData.js --full    # full re-sync
node callSyncEnergiePrices.js              # yesterday → tomorrow
node callSyncEnergiePrices.js 2025-01-01   # historical backfill from date

# On VPS (run inside container)
docker compose exec nodejs node callSyncKnmiData.js --full
docker compose exec nodejs node callSyncEnergiePrices.js 2025-01-01
docker compose exec nodejs node createUser.js
```

## Angular Setup Notes
- Angular 21.2, NgModule-based (NOT standalone for pages)
- PrimeNG v21 with Aura/blue preset — configured in `app.module.ts`
- AnyChart loaded via CDN script tag + `AnyChartService` (loads from `https://cdn.anychart.com`)
- Font: Nunito (Google Fonts)
- Hash routing (`useHash: true`) — `/#/knmidata`, `/#/planetarium`
- `zone.js` installed and configured — required for automatic change detection after async ops
  - `"polyfills": ["zone.js"]` in `angular.json` build options
  - `provideZoneChangeDetection()` in `src/main.ts` bootstrap options
- Six lazy-loaded modules: `KnmiDataModule`, `ForecastModule`, `PlanetariumModule`, `EnergyPricesModule`, `SolarModule`, `LightningModule`
- `socket.io-client` installed; added to `allowedCommonJsDependencies`; `environment.wsUrl` points to backend Socket.IO server (`http://localhost:3000` dev, `''` prod)
- Budget limit raised to `2MB` warn / `3MB` error in `angular.json` (PrimeNG Table/Tag/ProgressBar)
- `"hmr": false` in `angular.json` serve options — required; HMR is unreliable with NgModule apps
- `platformBrowserDynamic` (from `@angular/platform-browser-dynamic`) required in `main.ts` — `platformBrowser` breaks live reload
- No proxy config — `environment.ts` uses `http://localhost:3000/api` directly; backend has `cors()` enabled
- `allowedCommonJsDependencies: [file-saver, crypto-js]` in `angular.json` — suppresses CommonJS warnings
- `preloading.css` in `angular.json` styles array (not in `index.html`) — avoids build-time path resolution warning

## KNMI Page — Key Patterns
- No-flash chart updates: `[hidden]="loading && !rawRows.length"`, spinner same condition
- `onDatasetChange`/`onTimebaseChange`: never pre-clear rows or filterOptions — execute() replaces atomically
- AnyChart in-place update: `suspendSignalsDispatching` → `series.data()` → `resumeSignalsDispatching(true)`
- Chart.js: only rebuild `chartOptions` when configJson/timebase changes
- `filteredRows` is a cached property, never a getter
- Chart height: `calc(100vh - 360px)`

## Report Config Workflow
- Configs live in `database/knmi reports/` as JSON files (one per dataset)
- Export: admin UI → Beheer → Save Config
- Import: admin UI → Beheer → Load Config
- Always commit updated JSON after editing chart config
- See `docs/knmi-config-export-import.md`

## Pages / Nav
- KNMI Data (`/knmidata`) — weather data charts + admin (Beheer menu); chart-type buttons show text labels (Tabel/AnyChart/Chart.js) with active state highlighted
- Weersverwachting (`/forecast`) — own lazy module (`ForecastModule`); 10-day hourly forecast via Open-Meteo (KNMI Seamless model); columns: temp, humidity, pressure, wind, rain, snow, cloud cover, radiation (GTI); location picked via Leaflet map dialog (saved in `localStorage` key `forecast_location`); Nominatim reverse geocoding resolves city name on save
- Planetarium (`/planetarium`) — interactive star map with satellites + pass predictions; location picked via Leaflet map dialog (saved in `localStorage` key `planetarium_location`); Nominatim reverse geocoding resolves city name on save; uses default coords if no stored location (no geolocation)
- Energieprijzen (`/energy-prices`) — hourly electricity prices from energyzero.nl, green→red bar chart; always shows today + tomorrow (fixed, no date nav); summary cards (Nu/Gemiddeld/Laagste/Hoogste) for today, summary cards (Gemiddeld/Laagste/Hoogste) for tomorrow; historical section with date picker below; UTC→local time conversion (Dutch UTC+1/+2 offsets); backend fetches CURDATE-1 through CURDATE+1 so local 00:00–01:00 hours are included; manual backfill: `node callSyncEnergiePrices.js [YYYY-MM-DD]`
- Zonne-energie (`/solar`) — solar panel output forecast (3-day) via Open-Meteo GTI + historical backtest via KNMI uurgeg radiation data; backtest at bottom of page (collapsible); selected station saved in `localStorage` key `solar_backtest_stn`
- Bliksem (`/lightning`) — real-time lightning strike map via Blitzortung/lightningmaps.org WebSocket; **worldwide coverage** (`p: [90, 180, -90, -180]`); strikes stored in Redis (10min TTL); Socket.IO pushes live updates; yellow bolt = active (<30s), grey = older; thunder ring animates at zoom ≥ 11; map counter (4 values: total/active/viewport-total/viewport-active) computed client-side from `strikeMap` in single RAF pass; **topbar badge shows CE KPI** (`ceActive`/`ceTotal` from `strikes:ce:time` sorted set — BOUNDS-filtered, Central Europe only)
  - **Flash sequence**: new strike → white(0ms) → yellow(150ms) → white(200ms) → yellow(350ms) → white(400ms) → yellow(550ms, stays) — triple white/yellow flash via 5 chained `setTimeout` calls
  - **Navigate-back fix**: `Router` + `NavigationEnd` (skip first) → after 50ms calls `map.invalidateSize()` + `requestInitialList()` — fixes blank map on back-navigation
  - **Reconnect fix**: `socketReconnect$ = new Subject<void>()` in service, fired by `socket.io.on('reconnect')`; component subscribes and calls `requestInitialList()` — recovers strike list after connection drops
  - **Canvas overlay** (`StrikeOverlay`): single `<canvas>` per layer (grey + live) in `overlayPane`; layer coordinates + 300px padding so pan is a CSS transform with no per-frame redraws. `zoomAnimation: false` on the Leaflet map so canvas redraws instantly at zoomend with no CSS-scale distortion. See `docs/lightning-map.md`.
  - **NgZone**: tick/fade `setInterval` and all `styleTimer` `setTimeout` calls run via `ngZone.runOutsideAngular()`; CD triggered only when counts change — eliminates zone.js overhead at high strike counts
  - **Two-canvas split**: `drawLive()` in RAF frame draws only active strikes (<1ms); `addToGrey()` paints one bolt additively on transition; full grey redraw only on pan/zoom end and `fade()` — map stays smooth at 7000+ total strikes
  - **Age-as-pure-function**: no per-strike `styleTimer` setTimeouts — live/grey phase is `now - entry.timeMs < RING_DURATION_MS` computed each frame; `_liveKeys` set detects transitions for additive grey paint; active count recomputed from age each frame
  - **RAF loop**: live canvas driven by `requestAnimationFrame` (not `setInterval(100ms)`) — smooth flash animation, auto-pauses when tab is hidden
  - **Playback timestamp chip**: `lightning-index` includes `lastMs` (origTimeMs of last strike); shown in counter pill as formatted `HH:MM:SS` or `DD-MM HH:MM:SS` with "laatste" label
  - **Playback tooling** (`tests/playbackWss.js`): `--from HH:MM:SS` or `--from YYYY-MM-DDTHH:MM:SS` (UTC) seeks into recording; prefills Redis with the 10-min window before `--from` (strikes appear correctly aged), then emits `prefill-done` → frontend reloads initial list so old strikes appear as grey before playback starts. See `docs/lightning-map.md`.
- Taakstatus dialog — in login dropdown, polls `/api/server-tasks` every 2s while open (logged-in only)

## Solar Page — Key Details
- Uses Open-Meteo `global_tilted_irradiance` (GTI) — already corrected for tilt + azimuth
- Supports **multiple inverters**, each with multiple panel arrays and its own AC cap (`maxAcW`)
- One Open-Meteo call per array (parallel) — different tilt/azimuth = different GTI profile
- Formula per array: `powerW = (GTI / 1000) × panels × wp × efficiency`, summed per inverter, capped at `maxAcW`, then summed system total
- Losses stored as percentages: inverter, wiring, soiling, temperature — combined into single efficiency factor (global, applies to all arrays)
- Config persisted in `localStorage` under key `solar_config_v3`; migrates automatically from `solar_config_v2`
- Inverter clipping: SE5000H = 5000W limit — applied on combined DC output of all arrays per inverter
- Calibrated against SolarEdge history: real April max ~38 kWh with 16 × 370Wp, SE5000H
- Azimuth convention: 0=South, -90=East, +90=West (Open-Meteo convention)
- 3-day forecast with day tab selector (Vandaag / Morgen / Overmorgen)
- Location picker: `p-dialog` with draggable Leaflet map, Nominatim reverse geocoding, Save/Cancel — opened via "Locatie op kaart" button in the page header (top-right, next to city label); city label + coordinates stored in `localStorage` under key `solar_location`
- "Verliezen" section (collapsible): 4 loss inputs only; "Standaard" button resets only those 4 values — inverters/arrays are not affected

## Leaflet Map — Critical Pattern
**Always use `@ViewChild` + `setTimeout` to initialize Leaflet — never `getElementById`.**

**Icon fix and `mergeOptions` go at module level (top of file, after imports) — not inside `initMap()`.**

```typescript
import * as L from 'leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconUrl:       'assets/leaflet/marker-icon.png',
    iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
    shadowUrl:     'assets/leaflet/marker-shadow.png',
});

// inside the component:
@ViewChild('mapEl') mapEl!: ElementRef;

toggleMap() {
    this.mapVisible = !this.mapVisible;
    if (this.mapVisible) setTimeout(() => this.initMap()); // defer 1 tick
    else this.destroyMap();
}

private initMap() {
    if (this.map) return;
    this.map = L.map(this.mapEl.nativeElement, { center: [...], zoom: 11 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { ... }).addTo(this.map);
}
```

**Why `@ViewChild` + `setTimeout`**: `getElementById` finds the element before the browser completes its layout pass — Leaflet measures the container as wrong/zero size, tiles get sub-pixel offsets → white seam lines between tiles. `setTimeout` (even 0ms) defers init to the next event loop tick, after the browser has finished layout.

**Why module level for icon fix**: `delete _getIconUrl` must run once before any marker is created. Module level is cleaner and ensures it runs exactly once regardless of how many times the map is toggled.

**No NgZone needed** — zone.js patches native DOM `addEventListener`, so Leaflet click events naturally run inside Angular's zone.

Template: `<div class="location-map mb-3" #mapEl></div>` (use `@if (mapVisible)` wrapper)
angular.json: add `node_modules/leaflet/dist/leaflet.css` to styles array and `"leaflet"` to allowedCommonJsDependencies.

## Environment Files
- `src/environments/environment.ts` — dev: `apiUrl: 'http://localhost:3000/api'`
- `src/environments/environment.production.ts` — prod: `apiUrl: '/api'` (relative, goes through nginx)
- `angular.json` has `fileReplacements` wired for production build
- **Never hardcode `localhost:3000` in production** — port 3000 is internal to Docker only

## Known Issues / Gotchas
- **MySQL case sensitivity**: table names in stored procedures and task SQL must be lowercase (Linux Docker default)
- **knmidata-v4 `HTTP_LAST_MODIFIED`**: updated after both successful processing and date-unchanged skips — ensures `If-Modified-Since` stays current so future syncs 304 correctly. `maxSockets: 5` on axios to avoid throttling by KNMI server.
- **config.local.ini vs config.ini**: pool helper auto-selects — never manually edit config.ini for local dev
- **Angular budget**: initial bundle is ~1.3MB+ (PrimeNG + AnyChart + Table/Tag/ProgressBar) — budget raised to 2MB warn, this is expected
- **Windows live reload**: `poll: 1000` in angular.json serve options — without it, file changes may not trigger auto-reload
- **zone.js is mandatory**: without it, async callbacks (HTTP, geolocation, timers) won't trigger change detection — pages will appear blank until a user click forces a CD cycle
- **`docker compose restart nodejs` does NOT deploy new backend code** — nodejs is baked into a Docker image, so `restart` just restarts the old image. Always use `docker compose up -d --build nodejs` after a `git pull` to rebuild the image with the new code.
- **`docker compose restart nginx` IS sufficient for frontend changes** — the frontend dist is bind-mounted into nginx, so a restart picks up the new files immediately.
- **SSH known_hosts for bbqweer.eu**: run `ssh-keyscan bbqweer.eu >> C:/Users/William/.ssh/known_hosts` once to avoid host key prompts. Without this, automated ssh/scp commands hang waiting for interactive input.
- **Leaflet default marker icon breaks in production** — Angular's bundler cannot resolve the default icon image paths from node_modules. Fix: `delete (L.Icon.Default.prototype as any)._getIconUrl` + `L.Icon.Default.mergeOptions()` at module level (top of component file). See the Leaflet Map section above.
- **Topbar logo** — `frontend/src/assets/logo.png` (44px height, `border-radius: 8px`); source file in `logo/` folder (not served, just version-controlled).
- **MySQL binary logs**: configured to expire after 7 days via `database/mysql-binlog-expire.cnf` (mounted into bbqweer-mysql). Without this, binlogs accumulate indefinitely and can fill the disk (17GB observed before fix).
- **mysql2 returns DATE columns as ISO strings**: e.g. `"2026-04-23T00:00:00.000Z"` — always `.slice(0, 10)` before comparing or displaying date-only values.
- **mysql2 charset — `SET NAMES utf8mb4` required**: without it, the pool defaults to `latin1` and UTF-8 characters stored in `utf8mb4` columns (e.g. `°`) are returned as mojibake (`Â°`). Fixed in `helpers/mysqlpool-knmi.helper.js` via `pool.on('connection', c => c.query('SET NAMES utf8mb4'))`. Also add `SET NAMES utf8mb4;` at the top of any init SQL file that contains non-ASCII characters.
- **`column_mapping` format values**: `'date'` → `dd-MM-yyyy`; `'timestamp'` → `dd-MM-yyyy HH:mm:ss`; `'number'` → decimal pipe (also triggered when `decimals` is set without format). Add a row per field via the admin edit dialog (pencil icon) or directly in `03-column-mapping.sql`.

## Central standards
Read the relevant file before writing code in that domain:
- Workflow:             c:\Apps\dev-standards\workflow\dev-workflow.md
- Angular:             c:\Apps\dev-standards\frontend\angular-conventions.md
- Location picker:     c:\Apps\dev-standards\frontend\location-picker.md
- Socket.IO / live data: c:\Apps\dev-standards\frontend\live-data-socketio.md
- Task monitoring:     c:\Apps\dev-standards\backend\task-monitoring.md

### Deviations from central standard

**No map bounds saving** (location-picker.md)
The skill stores SW+NE bounds separately from the station location. bbqweer location pickers store only `{lat, lng, label}`. Reason: the pickers are point-selection modals (p-dialog), not persistent map navigation tools — the app's main view is data charts. Saving bounds adds no value here.

**HTTP REST instead of Socket.IO** (live-data-socketio.md)
The skill uses Socket.IO for live data. bbqweer fetches on demand via HTTP REST. Reason: weather data is batch-oriented, not real-time push — there is no server-side push event to react to.

**`toggleMap()` instead of `set` accessor for @ViewChild** (location-picker.md)
The skill uses the `set` accessor form on `@ViewChild` to auto-detect when `@if` shows/hides the map element. bbqweer uses an explicit `toggleMap()` + `setTimeout(() => this.initMap())`. Functionally equivalent — all map opens are explicitly triggered, so the set accessor provides no extra benefit. The approach is documented in the Leaflet Map section above.


## First Steps for New Chat
1. Read `docs/system-architecture.md` for full stack overview
2. Read `docs/dev-workflow.md` for how to run locally vs Docker
3. Start MySQL: `docker compose up -d mysql`
4. Start backend: `cd backend && node app.js`
5. Start frontend: `cd frontend && ng serve --open`
