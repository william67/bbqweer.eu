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
│   │   ├── components/     — my-knmi-anychart, my-knmi-chartjs, my-knmi-table,
│   │   │                     my-planetarium, login
│   │   ├── services/       — knmi-reports, forecast, anychart, local-storage,
│   │   │                     stars, planetarium-calc, satellites, satellite-js,
│   │   │                     energy-prices, solar
│   │   └── layout/         — topbar, footer, layout (AppLayoutModule)
│   └── proxy.conf.json     — deleted; not needed (environment.ts uses full localhost:3000 URL directly)
├── backend/                — Node.js/Express, CommonJS
│   ├── app.js              — Express + node-cron wiring
│   ├── config.ini          — Docker settings (host=mysql, port=3306) — NOT in git
│   ├── config.local.ini    — Local dev settings (host=127.0.0.1, port=3307) — NOT in git
│   ├── routes/             — knmi-reports, stars, satellites, auth, users, energy-prices, solar
│   ├── helpers/            — mysqlpool-knmi.helper.js, server-tasks.js
│   ├── tasks/              — knmidata-v4.js, satellites-sync.js, energy-prices-sync.js
│   ├── callSyncKnmi.js     — manual sync trigger
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
│   └── knmi_stars.sql      — HYG star catalogue (87,475 rows)
├── docs/                   — Documentation
│   ├── system-architecture.md
│   ├── knmi-data-sync.md
│   ├── docker-guide.md
│   ├── dev-workflow.md
│   └── knmi-config-export-import.md
├── nginx/nginx.conf        — static files + /api/* proxy to nodejs:3000
├── .env                    — MySQL root + app passwords — NOT in git
├── .gitignore
└── docker-compose.yml
```

## Running Stack

### Docker services
| Container | Image | Port |
|-----------|-------|------|
| bbqweer-mysql | mysql:8.0 | 3307 (host) / 3306 (internal) |
| bbqweer-nodejs | node:20-alpine (built from backend/) | 3000 (internal only) |
| bbqweer-nginx | nginx:alpine | 80, 443 |
| bbqweer-certbot | certbot/certbot | — (auto-renew) |

### Local dev (Stage 1)
Leave Docker running (MySQL always available). Cron tasks auto-disabled when `config.local.ini` exists.
```powershell
# Terminal 1
cd backend && node app.js         # uses config.local.ini, cron tasks disabled

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

## Build Timestamp
- Footer shows `bbqweer.eu v1.0005 — YYYY-MM-DD HH:MM:SS` (version/timestamp in smaller font)
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
node callSyncKnmi.js           # incremental
node callSyncKnmi.js --full    # full re-sync

# On VPS (run inside container)
docker compose exec nodejs node callSyncKnmi.js --full
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
- Four lazy-loaded modules: `KnmiDataModule`, `PlanetariumModule`, `EnergyPricesModule`, `SolarModule`
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
- Weersverwachting (`/knmidata/forecast`) — 3-day hourly forecast via Open-Meteo
- Planetarium (`/planetarium`) — interactive star map with satellites + pass predictions
- Energie (`/energy-prices`) — hourly electricity prices from energyzero.nl, green→red bar chart
- Zonne-energie (`/solar`) — solar panel output forecast for tomorrow via Open-Meteo GTI
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
- Location picker: Leaflet map inside collapsible "Verliezen & locatie" section

## Leaflet Map — Critical Pattern
**Always use `@ViewChild` + `setTimeout` to initialize Leaflet — never `getElementById`.**

```typescript
@ViewChild('mapEl') mapEl!: ElementRef;

toggleMap() {
    this.mapVisible = !this.mapVisible;
    if (this.mapVisible) setTimeout(() => this.initMap()); // defer 1 tick
}

private initMap() {
    this.map = L.map(this.mapEl.nativeElement, { center: [...], zoom: 11 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { ... }).addTo(this.map);
}
```

**Why**: `getElementById` finds the element before the browser completes its layout pass — Leaflet
measures the container as wrong/zero size, tiles get sub-pixel offsets → white seam lines between tiles.
`@ViewChild` with `setTimeout` (even 0ms) defers init to the next event loop tick, after the browser
has finished layout — container has correct dimensions → tiles position perfectly, no seams.

Template: `<div class="location-map" *ngIf="mapVisible" #mapEl></div>`
angular.json: add `node_modules/leaflet/dist/leaflet.css` to styles array and `"leaflet"` to allowedCommonJsDependencies.

## Environment Files
- `src/environments/environment.ts` — dev: `apiUrl: 'http://localhost:3000/api'`
- `src/environments/environment.production.ts` — prod: `apiUrl: '/api'` (relative, goes through nginx)
- `angular.json` has `fileReplacements` wired for production build
- **Never hardcode `localhost:3000` in production** — port 3000 is internal to Docker only

## Known Issues / Gotchas
- **MySQL case sensitivity**: table names in stored procedures and task SQL must be lowercase (Linux Docker default)
- **MaxListeners warning** in knmidata-v3: mitigated with `httpsAgent: maxSockets: 5` on axios instance
- **config.local.ini vs config.ini**: pool helper auto-selects — never manually edit config.ini for local dev
- **Angular budget**: initial bundle is ~1.3MB+ (PrimeNG + AnyChart + Table/Tag/ProgressBar) — budget raised to 2MB warn, this is expected
- **Windows live reload**: `poll: 1000` in angular.json serve options — without it, file changes may not trigger auto-reload
- **zone.js is mandatory**: without it, async callbacks (HTTP, geolocation, timers) won't trigger change detection — pages will appear blank until a user click forces a CD cycle
- **`docker compose restart nodejs` does NOT deploy new backend code** — nodejs is baked into a Docker image, so `restart` just restarts the old image. Always use `docker compose up -d --build nodejs` after a `git pull` to rebuild the image with the new code.
- **`docker compose restart nginx` IS sufficient for frontend changes** — the frontend dist is bind-mounted into nginx, so a restart picks up the new files immediately.
- **SSH known_hosts for bbqweer.eu**: run `ssh-keyscan bbqweer.eu >> C:/Users/William/.ssh/known_hosts` once to avoid host key prompts. Without this, automated ssh/scp commands hang waiting for interactive input.
- **Leaflet default marker icon breaks in production** — Angular's bundler cannot resolve the default icon image paths from node_modules. Fix: add leaflet images as an asset glob in `angular.json` and call `L.Icon.Default.mergeOptions()` with explicit paths. See the Leaflet Map section above.

## First Steps for New Chat
1. Read `docs/system-architecture.md` for full stack overview
2. Read `docs/dev-workflow.md` for how to run locally vs Docker
3. Start MySQL: `docker compose up -d mysql`
4. Start backend: `cd backend && node app.js`
5. Start frontend: `cd frontend && ng serve --open`
