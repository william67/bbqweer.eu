# System Architecture — bbqweer.eu

## Overview

bbqweer.eu is a public KNMI weather data platform. It exposes Dutch weather observations, forecasts, and a planetarium via a three-tier stack running in Docker.

---

## Stack

```
Browser
  │
  ▼
nginx:alpine  (port 80)
  │  static files: Angular dist/
  │  /api/*  → reverse proxy
  ▼
node:20-alpine  (port 3000, internal only)
  │  Express REST API
  │  node-cron background tasks
  ▼
mysql:8.0  (port 3307 on host, 3306 internal)
  └─ database: bbqweer
```

All three services are defined in `docker-compose.yml` and share the default Docker bridge network (`bbqweer_default`), so they address each other by service name (`mysql`, `nodejs`, `nginx`).

---

## Services

### nginx
- Image: `nginx:alpine`
- Serves the Angular production build from `frontend/dist/frontend/browser/` (bind-mounted read-only)
- Proxies all `/api/*` requests to `http://nodejs:3000`
- Config: `nginx/nginx.conf`

### nodejs
- Built from `backend/Dockerfile` (node:20-alpine)
- Runs `node app.js` — Express on port 3000
- `config.ini` bind-mounted read-only at `/app/config.ini` — never baked into the image
- Connects to MySQL using hostname `mysql` (Docker service name)
- Runs two cron tasks (see below)

### mysql
- Image: `mysql:8.0`
- Data persisted in named volume `mysql_data` (survives container restarts)
- Init scripts in `database/init/` run automatically on first start (numbered 01–07)
- Exposed on host port `3307` to avoid clashing with any local MySQL installation
- Root password and app credentials set via `.env` file (never committed)

---

## Configuration

### `.env` (root of project, never commit)
```ini
MYSQL_ROOT_PASSWORD=...
MYSQL_USER=bbqweer_user
MYSQL_PASSWORD=...
```

### `backend/config.ini` (bind-mounted into container, never commit)
```ini
[mysql_knmi]
host     = mysql        ← Docker service name (use 127.0.0.1 + port=3307 for local dev)
port     = 3306
user     = bbqweer_user
password = ...
database = bbqweer

[jwt]
secret_key = ...
```

---

## Database

Database name: `bbqweer`  
Engine: MySQL 8.0 InnoDB throughout

### Key tables

| Table | Description |
|-------|-------------|
| `etmgeg` | Daily weather observations (51 stations, ~1M+ rows) |
| `uurgeg` | Hourly weather observations (~10M+ rows) |
| `neerslaggeg` | Daily precipitation (rain gauge stations) |
| `stations` | 51 KNMI weather station codes + names |
| `neerslagstations` | ~343 precipitation station codes + names |
| `datafiles` | One row per KNMI data file — tracks URL, last import date, line count |
| `categories` | KNMI report categories |
| `datasets` | Report datasets (FK → categories) |
| `reports_new` | Saved report configurations (FK → datasets) |
| `column_mapping` | Display config for table columns (header, decimals, flex width) |
| `satellites` | TLE orbital elements (synced from Celestrak) |
| `satellite_groups` | Maps satellites to groups (visual, weather, noaa) |
| `stars` | HYG star catalogue |
| `users` | Admin accounts (bcrypt passwords, JWT auth) |
| `server-tasks` | Background task progress tracking |
| `logfile` | Task log entries |

### Views
All 30+ `v_*` views are defined in `01-schema.sql`. The KNMI sync reads from `v_etmgeg`, `v_uurgeg`, `v_neerslaggeg` during the two-pointer merge.

### Stored procedures
`UpdateHistory()` — called after every sync — chains: `UpdatePeriodeGegevens` → `UpdateNormen` → `UpdateVorstperiodes` → `UpdateKoudegolven` → `UpdateHittegolven` → `UpdateSuperHittegolven`. All table references use lowercase (Linux case-sensitive).

---

## Background Tasks (cron)

Both tasks are scheduled in `backend/app.js` via `node-cron` and run inside the nodejs container.

| Task | Schedule | File |
|------|----------|------|
| KNMI data sync | `0 * * * *` (every hour at :00) | `backend/tasks/knmidata-v3.js` |
| Satellites TLE sync | `30 * * * *` (every hour at :30) | `backend/tasks/satellites-sync.js` |

Progress is tracked in the `server-tasks` table (`knmidata-sync`, `satellites-sync`).

---

## API Routes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/knmi-reports/...` | KNMI data queries | Public |
| GET | `/api/stars` | HYG star catalogue | Public |
| GET | `/api/satellites/tle` | TLE data by group | Public |
| POST | `/api/auth/login` | Email + password login | — |
| POST | `/api/auth/checktoken` | Validate JWT | — |
| GET/POST/PUT | `/api/users` | User management | Admin JWT |

---

## Frontend

- Angular 19, NgModule-based (not standalone for pages)
- PrimeNG v21 with Aura/blue preset
- Hash routing (`/#/knmidata`, `/#/planetarium`)
- Two lazy-loaded modules: `KnmiDataModule`, `PlanetariumModule`
- AnyChart loaded via CDN (`AnyChartService` — dynamic script inject)
- `zone.js` polyfill configured in `angular.json` + `provideZoneChangeDetection()` in `main.ts`
- Production build output: `frontend/dist/frontend/browser/` — served by nginx

---

## Deployment

```powershell
# Build Angular
cd frontend
ng build --configuration=production

# Start / rebuild Docker stack
cd ..
docker compose up -d --build

# View logs
docker compose logs -f nodejs
docker compose logs -f nginx
```

---

## Local Development

For local dev, the Angular dev server proxies `/api/*` to the Express backend.

```powershell
# Terminal 1 — backend (connects to Docker MySQL on 127.0.0.1:3307)
cd backend
node app.js

# Terminal 2 — frontend dev server
cd frontend
ng serve --open
```

The backend auto-selects config: if `backend/config.local.ini` exists it is used (local dev), otherwise falls back to `config.ini` (Docker). No manual switching needed. See `docs/dev-workflow.md`.
