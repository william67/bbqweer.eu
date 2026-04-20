# Deploy to Hetzner VPS

End-to-end guide: from a fresh Hetzner VPS to bbqweer.eu running in production with HTTPS.

---

## 1. Create the VPS on Hetzner

1. Log in to [console.hetzner.cloud](https://console.hetzner.cloud)
2. New project → **bbqweer**
3. Add server:
   - **Location**: Nuremberg or Helsinki (EU)
   - **Image**: Ubuntu 24.04
   - **Type**: CX22 (2 vCPU, 4 GB RAM) — sufficient for this stack
   - **SSH key**: add your public key (`~/.ssh/id_rsa.pub` or generate one)
   - **Hostname**: `bbqweer`
4. Note the public IPv4 address (referred to as `<VPS_IP>` below)

---

## 2. Point the domain to the VPS

In your DNS provider (Hetzner DNS, Cloudflare, etc.):

| Type | Name | Value |
|------|------|-------|
| A | `bbqweer.eu` | `<VPS_IP>` |
| A | `www.bbqweer.eu` | `<VPS_IP>` |

DNS propagation takes a few minutes to a few hours. You can continue with the rest of the setup while it propagates.

---

## 3. Initial server setup

```bash
# Connect
ssh root@<VPS_IP>

# Update packages
apt update && apt upgrade -y

# Create a non-root user (optional but recommended)
adduser william
usermod -aG sudo william
# Copy your SSH key to the new user
rsync --archive --chown=william:william ~/.ssh /home/william

# Switch to your user for the rest (or stay as root for simplicity)
su - william
```

---

## 4. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker          # apply group without re-login
docker --version       # verify
```

---

## 5. Copy the project to the VPS

### Option A — git clone (recommended)

If your repo is on GitHub:

```bash
# On VPS
git clone https://github.com/youruser/bbqweer.eu.git /opt/bbqweer
```

### Option B — rsync from Windows

```powershell
# On Windows — exclude build artifacts and secrets
rsync -av `
  --exclude=node_modules `
  --exclude=dist `
  --exclude=.env `
  --exclude=backend/config.ini `
  --exclude=backend/config.local.ini `
  C:/Apps/bbqweer.eu/ william@<VPS_IP>:/opt/bbqweer/
```

---

## 6. Create secrets on the VPS

These files are never in git — create them manually on the VPS.

```bash
cd /opt/bbqweer

# MySQL passwords
nano .env
```

`.env` contents:
```ini
MYSQL_ROOT_PASSWORD=<strong-root-password>
MYSQL_USER=bbqweer_user
MYSQL_PASSWORD=<strong-app-password>
```

```bash
nano backend/config.ini
```

`backend/config.ini` contents:
```ini
[mysql_knmi]
host     = mysql
port     = 3306
user     = bbqweer_user
password = <strong-app-password>
database = bbqweer

[jwt]
secret_key = <long-random-string>
```

---

## 7. Build Angular locally and upload the dist

The VPS doesn't need Node.js installed — build on Windows, upload the dist.

```powershell
# On Windows — build with build timestamp
node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts',ts=new Date().toISOString().replace('T',' ').substring(0,19);fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('BUILD_TIME_PLACEHOLDER',ts));console.log('Stamped:',ts);" && cd c:/Apps/bbqweer.eu/frontend && ng build --configuration=production && node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/,'BUILD_TIME_PLACEHOLDER'));console.log('Restored');"

# Upload dist to VPS
rsync -av C:/Apps/bbqweer.eu/frontend/dist/ william@<VPS_IP>:/opt/bbqweer/frontend/dist/
```

---

## 8. Start the Docker stack

```bash
# On VPS
cd /opt/bbqweer
docker compose up -d --build

# Watch logs during first start (MySQL init takes ~15 seconds)
docker compose logs -f mysql
```

Wait until you see `ready for connections` in the MySQL logs, then verify all containers are up:

```bash
docker compose ps
```

---

## 9. Seed initial data

```bash
cd /opt/bbqweer

# Create the first admin user
node backend/createUser.js

# Run full KNMI data sync (takes 30–60 minutes)
node backend/callSyncKnmi.js --full
```

The full sync can run in the background — the app is already accessible on port 80 while it runs.

---

## 10. Verify HTTP works

Open `http://bbqweer.eu` in a browser (or `http://<VPS_IP>` if DNS hasn't propagated yet).  
The app should load and show KNMI data.

---

## 11. Enable HTTPS with Let's Encrypt (Certbot)

### Update nginx.conf for HTTPS

Replace `nginx/nginx.conf` with a version that handles both HTTP→HTTPS redirect and SSL termination. Example:

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

    location /api/ {
        proxy_pass http://nodejs:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Add certbot to docker-compose.yml

Add a certbot service and expose port 443 on nginx:

```yaml
  nginx:
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./frontend/dist/frontend/browser:/usr/share/nginx/html:ro
      - certbot_certs:/etc/letsencrypt:ro

  certbot:
    image: certbot/certbot
    volumes:
      - certbot_certs:/etc/letsencrypt
      - certbot_www:/var/www/certbot
    entrypoint: >
      sh -c "trap exit TERM;
             while :; do certbot renew --quiet; sleep 12h & wait $${!}; done"

volumes:
  mysql_data:
  certbot_certs:
  certbot_www:
```

### Obtain the certificate

```bash
# On VPS — obtain cert (HTTP must be reachable first)
docker run --rm -p 80:80 \
  -v /opt/bbqweer/certbot_certs:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d bbqweer.eu -d www.bbqweer.eu \
  --email woorschot67@gmail.com --agree-tos --no-eff-email

# Restart stack with HTTPS nginx config
cd /opt/bbqweer
docker compose up -d --build
```

---

## 12. Deploying updates

### Backend change

```powershell
# Sync backend to VPS
rsync -av --exclude=node_modules --exclude=config.ini --exclude=config.local.ini `
  C:/Apps/bbqweer.eu/backend/ william@<VPS_IP>:/opt/bbqweer/backend/

# On VPS — rebuild nodejs image
ssh william@<VPS_IP> "cd /opt/bbqweer && docker compose up -d --build nodejs"
```

### Frontend change

```powershell
# Build with timestamp and upload dist
node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts',ts=new Date().toISOString().replace('T',' ').substring(0,19);fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('BUILD_TIME_PLACEHOLDER',ts));console.log('Stamped:',ts);" && cd c:/Apps/bbqweer.eu/frontend && ng build --configuration=production && node -e "const fs=require('fs'),f='c:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/,'BUILD_TIME_PLACEHOLDER'));console.log('Restored');"

rsync -av C:/Apps/bbqweer.eu/frontend/dist/ william@<VPS_IP>:/opt/bbqweer/frontend/dist/

ssh william@<VPS_IP> "cd /opt/bbqweer && docker compose restart nginx"
```

### Both changed

```powershell
# Sync backend + dist, rebuild everything
rsync -av --exclude=node_modules --exclude=config.ini --exclude=config.local.ini `
  C:/Apps/bbqweer.eu/backend/ william@<VPS_IP>:/opt/bbqweer/backend/
rsync -av C:/Apps/bbqweer.eu/frontend/dist/ william@<VPS_IP>:/opt/bbqweer/frontend/dist/

ssh william@<VPS_IP> "cd /opt/bbqweer && docker compose up -d --build"
```

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

# Connect to MySQL
docker exec -it bbqweer-mysql mysql -u bbqweer_user -p bbqweer

# Check disk usage
df -h

# Check memory
free -h
```

---

## Summary

| Step | Done |
|------|------|
| Create Hetzner VPS (Ubuntu 24.04, CX22) | [ ] |
| Point DNS A record to VPS IP | [ ] |
| Install Docker | [ ] |
| Clone/rsync project files | [ ] |
| Create `.env` and `backend/config.ini` | [ ] |
| Build Angular locally, rsync dist | [ ] |
| `docker compose up -d --build` | [ ] |
| Seed admin user + run full KNMI sync | [ ] |
| Verify `http://bbqweer.eu` works | [ ] |
| Configure HTTPS with Let's Encrypt | [ ] |
