# Docker Guide — bbqweer.eu

This guide explains how the Docker setup works and how to operate it day-to-day. No prior Docker knowledge assumed.

---

## What is Docker?

Docker packages an application and everything it needs to run (Node.js, npm packages, config) into a **container** — an isolated process that behaves the same on every machine. Think of it as a lightweight virtual machine that starts in seconds.

A **Docker image** is the blueprint (like an installer). A **container** is a running instance of that image.

---

## What is Docker Compose?

Docker Compose lets you define and run multiple containers together in one file (`docker-compose.yml`). For bbqweer.eu that means MySQL, Node.js, and nginx all start with a single command and can talk to each other.

---

## The Three Containers

```
┌─────────────────────────────────────────────────────┐
│  Your machine (Windows)                             │
│                                                     │
│  Browser → localhost:80 → [nginx container]         │
│                               │  /api/* proxy       │
│                               ▼                     │
│                          [nodejs container]          │
│                               │  SQL queries        │
│                               ▼                     │
│                          [mysql container]           │
│                               │                     │
│                          mysql_data volume           │
│                         (persistent on disk)        │
└─────────────────────────────────────────────────────┘
```

### nginx
Receives all HTTP traffic on port 80. Serves the Angular app as static HTML/JS/CSS files. Any request starting with `/api/` is forwarded (proxied) to the Node.js container. nginx never touches the database directly.

### nodejs
Runs the Express backend on port 3000 — but only inside Docker's internal network. It is **not** reachable from your browser directly; only nginx can reach it. This is intentional — it keeps the API behind nginx which handles connection management.

### mysql
Stores all the data. Port 3307 is mapped to your host machine so you can connect from MySQL Workbench (`127.0.0.1:3307`). Internally the other containers reach it on port 3306 using the hostname `mysql`.

---

## How Node.js Runs Inside Docker

When you run `docker compose up --build`, Docker:

1. Reads `backend/Dockerfile`
2. Starts from a clean `node:20-alpine` Linux image (~180MB)
3. Copies `package.json` and runs `npm install` inside the image
4. Copies the rest of the backend files
5. Starts `node app.js`

The Node.js process runs inside Linux even though your host is Windows. It has no access to your C: drive — only files explicitly copied in (or bind-mounted).

### The Dockerfile explained

```dockerfile
FROM node:20-alpine          # start from official Node 20 on Alpine Linux
WORKDIR /app                 # all commands run in /app
COPY package*.json ./        # copy package files first (layer caching)
RUN npm install --omit=dev   # install dependencies (no devDependencies)
COPY . .                     # copy rest of backend source
CMD ["node", "app.js"]       # start the app
```

Why copy `package.json` before the source? Docker caches each step. If only source files changed (not dependencies), Docker reuses the cached `npm install` layer — rebuilds are much faster.

### config.ini — secrets stay outside the image

The `config.ini` file is **not copied into the image**. Instead it is bind-mounted at runtime:

```yaml
volumes:
  - ./backend/config.ini:/app/config.ini:ro
```

This means the running container reads your local `config.ini` directly. Change the file → restart the container → it picks up the new values. The image itself never contains passwords.

---

## Common Commands

### Start everything
```powershell
cd C:\Apps\bbqweer.eu
docker compose up -d
```
`-d` = detached (runs in background). Omit it to see live logs in the terminal.

### Start and rebuild (after code changes)
```powershell
docker compose up -d --build
```
Only the `nodejs` image is rebuilt (MySQL and nginx use pre-built images).

### Stop everything
```powershell
docker compose down
```
Containers stop but the `mysql_data` volume (your data) is preserved.

### Stop and delete data (nuclear option)
```powershell
docker compose down -v
```
`-v` removes named volumes — **all database data is lost**. Only use this to start completely fresh.

### View logs
```powershell
docker compose logs -f nodejs     # Node.js backend logs (live)
docker compose logs -f nginx      # nginx access/error logs
docker compose logs -f mysql      # MySQL startup + error logs
```
`-f` = follow (live stream). Ctrl+C to stop following.

### Check container status
```powershell
docker compose ps
```

### Restart a single container
```powershell
docker compose restart nodejs
```
Useful after changing `config.ini` without rebuilding.

### Run a command inside a container
```powershell
# Open a shell in the Node.js container
docker exec -it bbqweer-nodejs sh

# Run the KNMI sync manually inside the container
docker exec -it bbqweer-nodejs node callSyncKnmi.js

# Run a MySQL query
docker exec -it bbqweer-mysql mysql -ubbqweer_user -pbbqweer_pass_2024 bbqweer
```

---

## Persistent Data — the Volume

MySQL data is stored in a Docker **named volume** called `mysql_data`. Unlike bind mounts, this volume is managed by Docker and lives somewhere on your C: drive (inside Docker Desktop's storage area).

- `docker compose down` — volume survives ✓
- `docker compose down -v` — volume is deleted ✗
- Reinstalling Docker Desktop — volume may be lost (back up first)

To back up the database:
```powershell
docker exec bbqweer-mysql mysqldump -uroot -p<rootpass> bbqweer > backup.sql
```

---

## Deploying Code Changes

### Backend change (Node.js)
```powershell
cd C:\Apps\bbqweer.eu
docker compose up -d --build
```
Docker rebuilds only the nodejs image and restarts that container. MySQL and nginx are unaffected.

### Frontend change (Angular)
```powershell
# 1. Build Angular
cd frontend
ng build --configuration=production

# 2. Restart nginx (picks up new files from bind mount)
cd ..
docker compose restart nginx
```

The Angular dist folder is bind-mounted into nginx — so you only need to rebuild Angular and bounce nginx, no Docker rebuild needed.

### Database change
Run SQL directly on the container:
```powershell
docker exec -i bbqweer-mysql mysql -uroot -p<rootpass> bbqweer < your-change.sql
```
Also update the relevant `database/init/` file so the change is applied on fresh installs.

---

## Networking

Inside Docker Compose all containers share the same private network. They address each other by **service name**:

| From | To | Address |
|------|----|---------|
| nodejs | mysql | `mysql:3306` |
| nginx | nodejs | `nodejs:3000` |
| Your browser | nginx | `localhost:80` |
| MySQL Workbench | mysql | `127.0.0.1:3307` |

Port 3000 (Node.js) is **not** exposed to the host — only nginx is on port 80. This means the API is only reachable via nginx, which is the correct production setup.

---

## Troubleshooting

### Container won't start
```powershell
docker compose logs nodejs    # check for startup errors
```

### "Cannot connect to MySQL" in Node.js logs
- MySQL takes ~10–15 seconds to initialise on first start
- Node.js starts immediately and retries — normal during first boot
- Check `docker compose ps` — mysql should show `healthy` or `running`

### Port 80 already in use
Something else (IIS, another nginx) is using port 80. Either stop it or change the nginx port in `docker-compose.yml`:
```yaml
ports:
  - "8080:80"   # access via localhost:8080
```

### Changes to backend not showing
Did you rebuild? `docker compose up -d --build` — not just `up -d`.

### MySQL Workbench can't connect
Use `127.0.0.1` (not `localhost`) and port `3307`.
