# Development Workflow

Two local stages: Stage 1 (live dev) and Stage 2 (local Docker test).
For remote deployments see `deploy-to-nuc.md` and `deploy-to-hetzner.md`.

---

## Stage 1 — Local Dev (daily work)

MySQL runs in Docker, backend and frontend run directly on your machine. Fastest for iteration — live reload, no Docker rebuilds needed.

```
MySQL     → Docker (port 3307 on host)
Backend   → node app.js in terminal  (port 3000)
Frontend  → ng serve in terminal     (port 4200)
Browser   → http://localhost:4200
```

Leave Docker running at all times. Cron tasks (knmidata-sync, satellites-sync) are automatically disabled when `config.local.ini` is present.

### Start MySQL (only if not already running)
```powershell
cd C:\Apps\bbqweer.eu
docker compose up -d mysql
```

### Terminal 1 — backend
```powershell
cd C:\Apps\bbqweer.eu\backend
node app.js
```
You should see:
```
mySqlPoolKnmi using config.local.ini
mySqlPoolKnmi initiated (127.0.0.1:3307)
bbqweer backend listening on port 3000
Cron tasks disabled (local dev)
```

### Terminal 2 — frontend
```powershell
cd C:\Apps\bbqweer.eu\frontend
ng serve --open
```

### How the config switch works
- `backend/config.local.ini` — local dev settings (`host=127.0.0.1`, `port=3307`)
- `backend/config.ini` — Docker settings (`host=mysql`, `port=3306`)
- The backend helper automatically uses `config.local.ini` if it exists, otherwise falls back to `config.ini`
- `config.local.ini` is in `.dockerignore` so it is never copied into the Docker image
- Both files are in `.gitignore` — never committed

### Notes
- No proxy config — `environment.ts` points directly to `http://localhost:3000/api`; backend has `cors()` enabled
- `"hmr": false` in `angular.json` — required for live reload to work with NgModule apps
- `platformBrowserDynamic` in `main.ts` — required for Angular dev server live reload hooks

---

## Stage 2 — Local Docker (pre-deploy test)

Runs the full production stack locally — nginx serves the Angular build, backend runs in a container. Use this to verify the production setup before pushing to a remote server.

```
MySQL     → Docker
Backend   → Docker (internal port 3000, not exposed)
nginx     → Docker (port 80)
Browser   → http://localhost
```

### Build and deploy (one-liner from project root)
```powershell
node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts',ts=new Date().toISOString().replace('T',' ').substring(0,19);fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('BUILD_TIME_PLACEHOLDER',ts));console.log('Stamped:',ts);" && cd frontend && ng build --configuration=production && node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/,'BUILD_TIME_PLACEHOLDER'));console.log('Restored');" && cd .. && docker compose restart nginx
```

### After making backend changes
```powershell
cd C:\Apps\bbqweer.eu
docker compose up -d --build nodejs
```

### Build timestamp
The footer shows `bbqweer.eu v1.0003 — YYYY-MM-DD HH:MM:SS`.
`BUILD_TIME_PLACEHOLDER` is restored in the source file after each build — never commit with a real timestamp.

---

## Summary Table

| | MySQL | Backend | Frontend | URL |
|---|---|---|---|---|
| Stage 1 (dev) | Docker :3307 | `node app.js` | `ng serve` | localhost:4200 |
| Stage 2 (local Docker) | Docker | Docker | Docker (nginx) | localhost:80 |

---

## First-Time Setup Checklist (local machine)

- [ ] Install Docker Desktop
- [ ] Copy `.env` to project root with MySQL passwords
- [ ] Copy `backend/config.ini` with `host=mysql` and prod-style passwords
- [ ] Copy `backend/config.local.ini` with `host=127.0.0.1`, `port=3307`
- [ ] `docker compose up -d mysql` — start MySQL
- [ ] Wait ~15 seconds for MySQL init scripts to run
- [ ] `cd backend && node createUser.js` — create first admin user
- [ ] `cd backend && node callSyncKnmi.js --full` — initial data sync (~30–60 min)
- [ ] `cd frontend && ng serve --open` — start dev server
