# Deploy bbqweer.eu to Intel NUC (docker-prod)

## Server details
- Ubuntu 24, Intel NUC, hostname: `docker-prod` (192.168.0.217)
- Docker data on `/mnt/docker-data` (688GB volume)
- Older Docker version — use `docker-compose` not `docker compose`
- Port 80 free (IoT stack uses 1880, 3000, 9050, 6333, 8812)
- Access via SSH/Putty and Portainer (port 9050)

## One-time setup on the NUC

### 1. Clone the repo
`/mnt/docker-data` requires sudo for writes:
```bash
cd /mnt/docker-data
sudo git clone https://github.com/william67/bbqweer.eu.git bbqweer.eu
sudo chown -R william:william bbqweer.eu
cd bbqweer.eu
```

### 2. Create .env
Use the same passwords as the local Docker setup:
```bash
nano .env
```
```ini
MYSQL_ROOT_PASSWORD=...
MYSQL_USER=bbqweer_user
MYSQL_PASSWORD=...
```
Save: `Ctrl+O`, `Enter`, `Ctrl+X`

### 3. Create backend/config.ini
```bash
nano backend/config.ini
```
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
Save: `Ctrl+O`, `Enter`, `Ctrl+X`

### 4. Copy Angular build from Windows
First create the target directory on the NUC:
```bash
mkdir -p /mnt/docker-data/bbqweer.eu/frontend/dist/frontend
```

Build on Windows (from project root), then scp the dist:
```powershell
# Build
node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts',ts=new Date().toISOString().replace('T',' ').substring(0,19);fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('BUILD_TIME_PLACEHOLDER',ts));console.log('Stamped:',ts);" && cd frontend && ng build --configuration=production && node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/,'BUILD_TIME_PLACEHOLDER'));console.log('Restored');"

# Copy dist to NUC
scp -r frontend\dist\frontend\browser william@docker-prod:/mnt/docker-data/bbqweer.eu/frontend/dist/frontend/
```

### 5. Start the stack
```bash
cd /mnt/docker-data/bbqweer.eu
docker-compose up -d
```

MySQL runs init scripts on first start (~30s). Verify it's ready:
```bash
docker logs bbqweer-mysql 2>&1 | tail -5
```
Look for: `ready for connections`

### 6. Verify
Open `http://192.168.0.217` — bbqweer.eu should be live.

---

## Redeploying after changes

### Frontend change (Angular)
On Windows — build and copy dist:
```powershell
node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts',ts=new Date().toISOString().replace('T',' ').substring(0,19);fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('BUILD_TIME_PLACEHOLDER',ts));console.log('Stamped:',ts);" && cd frontend && ng build --configuration=production && node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/,'BUILD_TIME_PLACEHOLDER'));console.log('Restored');" && cd .. && scp -r frontend\dist\frontend\browser william@docker-prod:/mnt/docker-data/bbqweer.eu/frontend/dist/frontend/
```
Then on NUC:
```bash
docker restart bbqweer-nginx
```

### Backend change (Node.js)
```bash
cd /mnt/docker-data/bbqweer.eu
git pull
docker-compose up -d --build nodejs
```

### Full rebuild
```bash
cd /mnt/docker-data/bbqweer.eu
git pull
docker-compose up -d --build
```

---

## Useful commands

```bash
# View live logs
docker-compose logs -f

# View logs for one service
docker logs bbqweer-mysql
docker logs bbqweer-nodejs
docker logs bbqweer-nginx

# Restart a single container
docker restart bbqweer-nginx

# Stop everything
docker-compose down

# Stop and wipe database (destructive!)
docker-compose down -v
```

## Notes
- MySQL data persists in Docker volume `bbqweer_mysql_data` — survives restarts
- `config.ini` and `.env` are never in git — must be created manually on each new host
- Angular dist is not in git — must be built on Windows and scp'd after each frontend change
- Port 3307 exposed on host for direct MySQL access (e.g. MySQL Workbench)
- KNMI data sync cron runs automatically (hourly) — no manual trigger needed
