# Development Workflow

Three stages: local dev → local Docker → production (Hetzner).

---

## Stage 1 — Local Dev (daily work)

MySQL runs in Docker, backend and frontend run directly on your machine. Fastest for iteration — no Docker rebuilds needed.

```
MySQL     → Docker (port 3307 on host)
Backend   → node app.js in terminal  (port 3000)
Frontend  → ng serve in terminal     (port 4200)
Browser   → http://localhost:4200
```

The Angular dev server proxies `/api/*` → `http://localhost:3000` automatically (via `proxy.conf.json`).

### Switch from Docker stack to local dev
```powershell
cd C:\Apps\bbqweer.eu
docker compose stop nodejs nginx   # keep MySQL running, stop backend + nginx
```

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

---

## Stage 2 — Local Docker (pre-deploy test)

Runs the full production stack locally — nginx serves the Angular build, backend runs in a container. Use this to verify the production setup before pushing to Hetzner.

```
MySQL     → Docker
Backend   → Docker (internal port 3000, not exposed)
nginx     → Docker (port 80)
Browser   → http://localhost
```

### Steps
```powershell
# 1. Stop local backend + frontend (Ctrl+C in both terminals)

# 2. Bring nodejs + nginx back into Docker
cd C:\Apps\bbqweer.eu
docker compose up -d nodejs nginx   # MySQL is already running

# 3. Build Angular with build timestamp
node -e "
const fs = require('fs');
const ts = new Date().toISOString().replace('T',' ').substring(0,19);
const f = 'c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts';
fs.writeFileSync(f, fs.readFileSync(f,'utf8').replace('BUILD_TIME_PLACEHOLDER', ts));
console.log('Stamped:', ts);
" && cd frontend && ng build --configuration=production && node -e "
const fs = require('fs');
const f = 'c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts';
fs.writeFileSync(f, fs.readFileSync(f,'utf8').replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/, 'BUILD_TIME_PLACEHOLDER'));
console.log('Placeholder restored');
"

# 4. Rebuild nodejs image if backend changed
cd ..
docker compose up -d --build

# 5. Restart nginx to pick up new Angular dist
docker compose restart nginx
```

### After making backend changes
```powershell
docker compose up -d --build   # rebuilds nodejs image, restarts container
```

### After making frontend changes (full one-liner)
```powershell
node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts',ts=new Date().toISOString().replace('T',' ').substring(0,19);fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('BUILD_TIME_PLACEHOLDER',ts));console.log('Stamped:',ts);" && cd c:/Apps/bbqweer.eu/frontend && ng build --configuration=production && node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/,'BUILD_TIME_PLACEHOLDER'));console.log('Restored');" && cd c:/Apps/bbqweer.eu && docker compose restart nginx
```

The build timestamp is visible in the footer as `bbqweer.eu v1.0001 — YYYY-MM-DD HH:MM:SS`.
`BUILD_TIME_PLACEHOLDER` is restored in the source file after each build so it is never committed with a real timestamp.

---

## Stage 3 — Production (Hetzner VPS)

Same `docker-compose.yml` as Stage 2. The VPS just needs Docker + Docker Compose installed.

### First-time setup on VPS

```bash
# 1. Install Docker on the VPS (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # allow running docker without sudo

# 2. Copy project files to VPS (from your Windows machine)
# Option A: git clone (recommended — set up a private repo first)
git clone https://github.com/youruser/bbqweer.eu.git /opt/bbqweer

# Option B: rsync (copy directly)
rsync -av --exclude=node_modules --exclude=dist C:/Apps/bbqweer.eu/ user@hetzner-ip:/opt/bbqweer/

# 3. On the VPS — create config files (never in git)
nano /opt/bbqweer/backend/config.ini        # host=mysql, prod passwords
nano /opt/bbqweer/.env                      # prod MySQL root + app passwords

# 4. Build Angular on your local machine and rsync just the dist
# (saves installing Node on the VPS)
# On Windows:
cd C:\Apps\bbqweer.eu\frontend
ng build --configuration=production
# Then rsync dist:
rsync -av dist/ user@hetzner-ip:/opt/bbqweer/frontend/dist/

# 5. Start the stack
cd /opt/bbqweer
docker compose up -d --build
```

### Deploying updates to production

```powershell
# On Windows — build Angular
cd C:\Apps\bbqweer.eu\frontend
ng build --configuration=production

# Sync changed files to VPS (adjust path/IP)
rsync -av --exclude=node_modules --exclude=dist C:/Apps/bbqweer.eu/backend/ user@hetzner-ip:/opt/bbqweer/backend/
rsync -av C:/Apps/bbqweer.eu/frontend/dist/ user@hetzner-ip:/opt/bbqweer/frontend/dist/

# On VPS — rebuild and restart
ssh user@hetzner-ip
cd /opt/bbqweer
docker compose up -d --build
```

### HTTPS on Hetzner (Let's Encrypt)

Add a second nginx config and certbot container, or use Hetzner's load balancer for SSL termination. Document separately when ready.

---

## Summary Table

| | MySQL | Backend | Frontend | URL |
|---|---|---|---|---|
| Stage 1 (dev) | Docker :3307 | `node app.js` | `ng serve` | localhost:4200 |
| Stage 2 (local Docker) | Docker | Docker | Docker (nginx) | localhost:80 |
| Stage 3 (production) | Docker | Docker | Docker (nginx) | bbqweer.eu:80/443 |

---

## First-Time Setup Checklist (any machine)

- [ ] Install Docker Desktop (Windows) or Docker Engine (Linux)
- [ ] Copy `.env` to project root with MySQL passwords
- [ ] Copy `backend/config.ini` with correct host/passwords
- [ ] Copy `backend/config.local.ini` for local dev (if running backend outside Docker)
- [ ] `docker compose up -d mysql` — start MySQL
- [ ] Wait ~15 seconds for MySQL init scripts to run
- [ ] `docker exec -i bbqweer-mysql mysql -uroot -p<pass> bbqweer < database/init/05-server-tasks.sql` — seed server-tasks
- [ ] `cd backend && node createUser.js` — create first admin user
- [ ] `cd backend && node callSyncKnmi.js --full` — initial data sync (~30-60 min)
- [ ] `cd frontend && ng build --configuration=production` — build Angular
- [ ] `docker compose up -d --build` — start full stack
- [ ] Open http://localhost — verify app loads and data shows
