# bbqweer.eu

## What is this?
Public KNMI weather data platform — a standalone website spun out of wo-ict.nl.
Goal: expose KNMI weather data, forecasts, and charts publicly at bbqweer.eu.

## Status: scaffolded and running
The project is fully scaffolded. Docker stack is running locally. KNMI data sync has completed a full run. Frontend is live at `http://localhost` via nginx.

## Project Structure
```
C:\Apps\bbqweer.eu\
├── frontend/               — Angular 19, NgModule-based, PrimeNG v21, AnyChart
│   ├── src/app/
│   │   ├── pages/knmidata/ — KnmiDataComponent + ForecastComponent (lazy module)
│   │   ├── pages/planetarium/ — PlanetariumComponent (lazy module)
│   │   ├── components/     — my-knmi-anychart, my-knmi-chartjs, my-knmi-table,
│   │   │                     my-planetarium, login
│   │   ├── services/       — knmi-reports, forecast, anychart, local-storage,
│   │   │                     stars, planetarium-calc, satellites, satellite-js
│   │   └── layout/         — topbar, footer, layout (AppLayoutModule)
│   └── proxy.conf.json     — /api/* → localhost:3000 for ng serve
├── backend/                — Node.js/Express, CommonJS
│   ├── app.js              — Express + node-cron wiring
│   ├── config.ini          — Docker settings (host=mysql, port=3306) — NOT in git
│   ├── config.local.ini    — Local dev settings (host=127.0.0.1, port=3307) — NOT in git
│   ├── routes/             — knmi-reports, stars, satellites, auth, users
│   ├── helpers/            — mysqlpool-knmi.helper.js, server-tasks.js
│   ├── tasks/              — knmidata-v3.js, satellites-sync.js
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
│   │   └── 07-neerslagstations.sql — 343 precipitation stations
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
| bbqweer-nginx | nginx:alpine | 80 |

### Local dev (Stage 1)
```powershell
# Terminal 1
cd backend && node app.js         # uses config.local.ini automatically

# Terminal 2
cd frontend && ng serve --open    # proxies /api/* to localhost:3000
```

### Full Docker (Stage 2 / production)
```powershell
# Build with timestamp, deploy, restore placeholder (run from project root)
node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts',ts=new Date().toISOString().replace('T',' ').substring(0,19);fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('BUILD_TIME_PLACEHOLDER',ts));console.log('Stamped:',ts);" && cd frontend && ng build --configuration=production && node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/,'BUILD_TIME_PLACEHOLDER'));console.log('Restored');" && cd .. && docker compose restart nginx
```

See `docs/dev-workflow.md` for full three-stage workflow including Hetzner deployment.

## Build Timestamp
- Footer shows `bbqweer.eu v1.0001 — YYYY-MM-DD HH:MM:SS`
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

Both scheduled in `backend/app.js` via `node-cron`:

| Task | Schedule | Description |
|------|----------|-------------|
| `knmidata-v3` | `0 * * * *` | KNMI weather data sync (two-pointer merge) |
| `satellites-sync` | `30 * * * *` | TLE sync from Celestrak |

Manual trigger:
```powershell
cd backend
node callSyncKnmi.js           # incremental
node callSyncKnmi.js --full    # full re-sync
```

## Angular Setup Notes
- Angular 19, NgModule-based (NOT standalone for pages)
- PrimeNG v21 with Aura/blue preset — configured in `app.module.ts`
- AnyChart loaded via CDN script tag + `AnyChartService` (loads from `https://cdn.anychart.com`)
- Font: Nunito (Google Fonts)
- Hash routing (`useHash: true`) — `/#/knmidata`, `/#/planetarium`
- `zone.js` installed and configured — required for automatic change detection after async ops
  - `"polyfills": ["zone.js"]` in `angular.json` build options
  - `provideZoneChangeDetection()` in `src/main.ts` bootstrap options
- Two lazy-loaded modules: `KnmiDataModule`, `PlanetariumModule`
- Budget limit raised to `1.5MB` warn / `3MB` error in `angular.json`

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
- KNMI Data (`/knmidata`) — weather data charts + admin (Beheer menu)
- Weersverwachting (`/knmidata/forecast`) — 3-day hourly forecast via Open-Meteo
- Planetarium (`/planetarium`) — interactive star map with satellites + pass predictions

## Environment Files
- `src/environments/environment.ts` — dev: `apiUrl: 'http://localhost:3000/api'`
- `src/environments/environment.production.ts` — prod: `apiUrl: '/api'` (relative, goes through nginx)
- `angular.json` has `fileReplacements` wired for production build
- **Never hardcode `localhost:3000` in production** — port 3000 is internal to Docker only

## Known Issues / Gotchas
- **MySQL case sensitivity**: table names in stored procedures and task SQL must be lowercase (Linux Docker default)
- **MaxListeners warning** in knmidata-v3: mitigated with `httpsAgent: maxSockets: 5` on axios instance
- **config.local.ini vs config.ini**: pool helper auto-selects — never manually edit config.ini for local dev
- **Angular budget**: initial bundle is ~1.27MB (PrimeNG + AnyChart) — budget raised in angular.json, this is expected
- **zone.js is mandatory**: without it, async callbacks (HTTP, geolocation, timers) won't trigger change detection — pages will appear blank until a user click forces a CD cycle

## First Steps for New Chat
1. Read `docs/system-architecture.md` for full stack overview
2. Read `docs/dev-workflow.md` for how to run locally vs Docker
3. Start MySQL: `docker compose up -d mysql`
4. Start backend: `cd backend && node app.js`
5. Start frontend: `cd frontend && ng serve --open`
