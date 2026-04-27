# Deploy to Hetzner VPS

End-to-end guide: from a fresh Hetzner VPS to bbqweer.eu running in production with HTTPS.
Last completed: 2026-04-27. All steps reflect what was actually done.

---

## 1. Create the VPS on Hetzner

1. Log in to [console.hetzner.cloud](https://console.hetzner.cloud)
2. New project → **bbqweer**
3. Add server:
   - **Location**: Nuremberg or Helsinki (EU)
   - **Image**: Ubuntu 24.04
   - **Type**: CX23 (2 vCPU, 4 GB RAM, 40 GB disk)
   - **SSH key**: add your public key (`~/.ssh/id_ed25519.pub`)
   - **Hostname**: `bbqweer`
   - **Volume / Backups / Firewall**: skip
4. Note the public IPv4 address (referred to as `<VPS_IP>` below)

> SSH from Windows PowerShell uses `~/.ssh/id_ed25519` automatically — no PuTTY needed.

---

## 2. Point the domain to the VPS

In your DNS provider:

| Type | Name | Value |
|------|------|-------|
| A | `bbqweer.eu` | `<VPS_IP>` |
| A | `www.bbqweer.eu` | `<VPS_IP>` |

DNS propagation takes a few minutes to a few hours. Continue with the rest while it propagates.

Verify from VPS:
```bash
nslookup bbqweer.eu
nslookup www.bbqweer.eu
```

---

## 3. Initial server setup

```powershell
# Connect from Windows PowerShell
ssh root@<VPS_IP>
```

```bash
# On VPS
apt update && apt upgrade -y
```

---

## 4. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker root
docker --version
```

---

## 5. Copy the project to the VPS

From Windows PowerShell (excludes secrets, build artifacts, local dev files):

```powershell
scp -r C:/Apps/bbqweer.eu/database root@<VPS_IP>:/opt/bbqweer/
scp -r C:/Apps/bbqweer.eu/backend root@<VPS_IP>:/opt/bbqweer/
scp -r C:/Apps/bbqweer.eu/nginx root@<VPS_IP>:/opt/bbqweer/
scp C:/Apps/bbqweer.eu/docker-compose.yml root@<VPS_IP>:/opt/bbqweer/
```

> Do NOT copy `node_modules`, `dist`, `.env`, `config.ini`, or `config.local.ini`.

---

## 6. Create secrets on the VPS

### Generate passwords (run in Windows PowerShell — alphanumeric only, no special chars)

**IMPORTANT: passwords must be alphanumeric only.** Special characters (`'`, `"`, `!`, `$`, etc.) break MySQL shell quoting and make it impossible to run admin commands.

```powershell
$pass1 = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
$pass2 = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
Write-Host "MYSQL_ROOT_PASSWORD: $pass1"
Write-Host "MYSQL_PASSWORD:      $pass2"
```

```powershell
# Generate JWT secret
[Convert]::ToBase64String((1..48 | ForEach-Object { [byte](Get-Random -Maximum 256) }))
```

### Create `.env` on the VPS

```bash
nano /opt/bbqweer/.env
```

```ini
MYSQL_ROOT_PASSWORD=<generated-root-password>
MYSQL_USER=bbqweer_user
MYSQL_PASSWORD=<generated-app-password>
```

### Create `backend/config.ini` on the VPS

```bash
nano /opt/bbqweer/backend/config.ini
```

```ini
[mysql_knmi]
host     = mysql
port     = 3306
user     = bbqweer_user
password = <generated-app-password>
database = bbqweer

[jwt]
secret_key = <generated-jwt-secret>
```

---

## 7. Build Angular locally and upload the dist

Build on Windows (VPS does not need Node.js):

```powershell
node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts',ts=new Date().toISOString().replace('T',' ').substring(0,19);fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('BUILD_TIME_PLACEHOLDER',ts));console.log('Stamped:',ts);"
cd c:/Apps/bbqweer.eu/frontend
ng build --configuration=production
node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/,'BUILD_TIME_PLACEHOLDER'));console.log('Restored');"
```

Create the dist folder on VPS first, then upload:

```powershell
ssh root@<VPS_IP> "mkdir -p /opt/bbqweer/frontend/dist"
scp -r C:/Apps/bbqweer.eu/frontend/dist/* root@<VPS_IP>:/opt/bbqweer/frontend/dist/
```

---

## 8. Start the Docker stack

```bash
cd /opt/bbqweer
docker compose up -d --build

# Watch MySQL init (takes ~15 seconds)
docker compose logs -f mysql
```

Wait for `ready for connections`, then verify:

```bash
docker compose ps
```

All three containers (`bbqweer-mysql`, `bbqweer-nodejs`, `bbqweer-nginx`) should be `Up`.

---

## 9. Grant MySQL access to the app user

On first start, MySQL may refuse connections from the nodejs container. Fix by granting access:

```bash
# SSH into VPS, then:
docker exec bbqweer-mysql mysql -u root -p<MYSQL_ROOT_PASSWORD> -e "GRANT ALL PRIVILEGES ON bbqweer.* TO 'bbqweer_user'@'%'; FLUSH PRIVILEGES;"
```

If the command doesn't return cleanly due to quoting, write the SQL to a file first:

```bash
echo "GRANT ALL PRIVILEGES ON bbqweer.* TO 'bbqweer_user'@'%'; FLUSH PRIVILEGES;" > /tmp/grant.sql
docker exec -i bbqweer-mysql mysql -u root -p<MYSQL_ROOT_PASSWORD> < /tmp/grant.sql
```

Then restart nodejs:

```bash
docker compose restart nodejs
```

---

## 10. Seed initial data

**IMPORTANT: run node commands inside the container, not on the host — Node.js is not installed on the VPS.**

```bash
# Create the first admin user
docker compose exec nodejs node createUser.js

# Run full KNMI data sync (takes 30–60 minutes, runs in background)
docker compose exec nodejs node callSyncKnmi.js --full
```

After creating the admin user: log in via the UI → Beheer → Load Config → import JSON files from `database/knmi reports/`.

---

## 11. Verify HTTP works

Open `http://bbqweer.eu` (or `http://<VPS_IP>` if DNS hasn't propagated).

---

## 12. Enable HTTPS with Let's Encrypt

### Step 1 — Stop nginx to free port 80

```bash
cd /opt/bbqweer && docker compose stop nginx
```

### Step 2 — Obtain the certificate

Both `bbqweer.eu` and `www.bbqweer.eu` DNS must point to the VPS before running this.

```bash
docker run --rm -p 80:80 \
  -v /opt/bbqweer/certbot_certs:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d bbqweer.eu -d www.bbqweer.eu \
  --email woorschot67@gmail.com --agree-tos --no-eff-email
```

Certs are saved to `/opt/bbqweer/certbot_certs/` on the host.

### Step 3 — Update nginx.conf and docker-compose.yml locally

`nginx/nginx.conf` — already updated in the repo:

```nginx
server {
    listen 80;
    server_name bbqweer.eu www.bbqweer.eu;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name bbqweer.eu www.bbqweer.eu;

    ssl_certificate     /etc/letsencrypt/live/bbqweer.eu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bbqweer.eu/privkey.pem;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location ~* \.(js|css|woff2?|ttf|eot|svg|png|ico)$ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /api/ {
        proxy_pass         http://nodejs:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

`docker-compose.yml` nginx section — already updated in the repo (uses bind mount, not named volume):

```yaml
  nginx:
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./frontend/dist/frontend/browser:/usr/share/nginx/html:ro
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /opt/bbqweer/certbot_certs:/etc/letsencrypt:ro   # bind mount — certs are on host

  certbot:
    image: certbot/certbot
    volumes:
      - /opt/bbqweer/certbot_certs:/etc/letsencrypt
    entrypoint: >
      sh -c "trap exit TERM;
             while :; do certbot renew --quiet; sleep 12h & wait $${!}; done"
```

> **Important**: use a bind mount (`/opt/bbqweer/certbot_certs:/etc/letsencrypt`) not a named volume. The cert was obtained outside Docker into the host path — a named volume would be empty and nginx would crash.

### Step 4 — Upload updated configs and restart

```powershell
scp C:/Apps/bbqweer.eu/nginx/nginx.conf root@<VPS_IP>:/opt/bbqweer/nginx/nginx.conf
scp C:/Apps/bbqweer.eu/docker-compose.yml root@<VPS_IP>:/opt/bbqweer/docker-compose.yml
```

```powershell
ssh root@<VPS_IP> "cd /opt/bbqweer && docker compose up -d --build"
```

Open `https://bbqweer.eu` — should load with valid certificate.

---

## 13. Deploying updates

### Backend change

```powershell
scp -r C:/Apps/bbqweer.eu/backend root@<VPS_IP>:/opt/bbqweer/
ssh root@<VPS_IP> "cd /opt/bbqweer && docker compose up -d --build nodejs"
```

### Frontend change

```powershell
# Build with timestamp
node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts',ts=new Date().toISOString().replace('T',' ').substring(0,19);fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('BUILD_TIME_PLACEHOLDER',ts));console.log('Stamped:',ts);"
cd c:/Apps/bbqweer.eu/frontend
ng build --configuration=production
node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/,'BUILD_TIME_PLACEHOLDER'));console.log('Restored');"

# Upload and restart nginx
scp -r C:/Apps/bbqweer.eu/frontend/dist/* root@<VPS_IP>:/opt/bbqweer/frontend/dist/
ssh root@<VPS_IP> "cd /opt/bbqweer && docker compose restart nginx"
```

### Both changed

```powershell
scp -r C:/Apps/bbqweer.eu/backend root@<VPS_IP>:/opt/bbqweer/
scp -r C:/Apps/bbqweer.eu/frontend/dist/* root@<VPS_IP>:/opt/bbqweer/frontend/dist/
ssh root@<VPS_IP> "cd /opt/bbqweer && docker compose up -d --build"
```

---

## Firewall (ufw)

```bash
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
ufw status
```

Port 3307 (MySQL) is intentionally blocked — access via SSH tunnel instead (see below).

---

## MySQL access from Windows (SSH tunnel)

MySQL is not exposed to the internet. Use an SSH tunnel:

```powershell
# In a PowerShell window — keep it open while you work
ssh -L 3307:127.0.0.1:3307 root@<VPS_IP>
```

Then connect your MySQL client (Workbench, DBeaver, etc.) to:
- **Host**: `127.0.0.1`
- **Port**: `3307`
- **User**: `bbqweer_user`
- **Password**: app password from `.env`
- **Database**: `bbqweer`

---

## Useful VPS commands

```bash
# View running containers
docker compose ps

# Tail logs
docker compose logs -f nodejs
docker compose logs -f nginx
docker compose logs -f mysql

# Restart a single service
docker compose restart nginx

# Connect to MySQL (password prompt)
docker exec -it bbqweer-mysql mysql -u bbqweer_user -p bbqweer

# Run a node script inside the container
docker compose exec nodejs node callSyncKnmi.js --full
docker compose exec nodejs node createUser.js

# Check disk usage
df -h

# Check memory
free -h
```

---

## Summary

| Step | Done |
|------|------|
| Create Hetzner VPS (Ubuntu 24.04, CX23) | [x] |
| Point DNS A records to VPS IP | [x] |
| Install Docker | [x] |
| Copy project files via scp | [x] |
| Create `.env` and `backend/config.ini` | [x] |
| Build Angular locally, scp dist | [x] |
| `docker compose up -d --build` | [x] |
| Grant MySQL privileges to app user | [x] |
| Seed admin user + run full KNMI sync | [x] |
| Verify `http://bbqweer.eu` works | [x] |
| Configure HTTPS with Let's Encrypt | [x] |
| Load report configs via Beheer UI | [ ] |
