# Deployment Overview

Three deployment targets — same codebase, same Docker stack, different environments.

---

## What always stays the same

- Docker stack: **mysql** + **nodejs** + **nginx** (defined in `docker-compose.yml`)
- Angular is built on Windows, dist is copied to the target
- `config.ini` and `.env` are created manually on each target — never in git
- nginx always serves the Angular app and proxies `/api/*` to the Node backend

---

## At a glance

| | Local Dev | Local Docker | Hetzner |
|---|---|---|---|
| **Purpose** | Daily coding | Pre-deploy test | Public internet |
| **Accessible by** | You only | You only | Everyone |
| **URL** | localhost:4200 | localhost | bbqweer.eu |
| **Angular** | `ng serve` (live) | Built dist | Built dist |
| **Backend** | `node app.js` | Docker | Docker |
| **MySQL** | Docker :3306 | Docker | Docker |
| **Cron tasks** | Disabled | Running | Running |
| **HTTPS** | No | No | Yes (Let's Encrypt) |
| **Deploy dist** | — | `docker compose restart nginx` | `rsync` + `docker compose restart` |

---

## Local Dev (Stage 1)

**What it is:** backend and frontend run directly on Windows, only MySQL is in Docker.

**When to use:** daily development — instant live reload, no build step needed.

**Key points:**
- `ng serve` on port 4200, hot reload on file save
- Backend runs as `node app.js`, uses `config.local.ini`
- Cron tasks auto-disabled (no accidental data syncs during dev)
- No build needed — changes are visible immediately

---

## Local Docker (Stage 2)

**What it is:** full Docker stack running on your Windows machine, same as production.

**When to use:** verify a build before pushing to a remote server.

**Key points:**
- Identical to the Hetzner setup
- Angular must be built (`ng build`) before changes are visible
- nginx serves the static dist, backend runs in a container
- Quick to test: one build command + `docker compose restart nginx`

---

## Hetzner VPS (public internet)

**What it is:** cloud VPS running the full Docker stack, publicly reachable at bbqweer.eu.

**When to use:** production — the real website for public visitors.

**Key points:**
- Accessible from anywhere on the internet
- HTTPS via Let's Encrypt (certbot in Docker)
- Angular dist deployed via `rsync` from Windows
- Requires domain DNS pointing to the VPS IP
- Live in production — setup documented in `deploy-to-hetzner.md`

---

## Deploy flow comparison

```
Windows (ng build)
       │
       ├─── Local Docker ──► docker compose restart nginx          (localhost)
       │
       └─── Hetzner ────────► rsync dist → docker compose restart  (bbqweer.eu)
```

**Detailed guides:**
- Local dev + local Docker → `docs/dev-workflow.md`
- Hetzner → `docs/deploy-to-hetzner.md`
