# Deployment Overview

Four deployment targets — same codebase, same Docker stack, different environments.

---

## What always stays the same

- Docker stack: **mysql** + **nodejs** + **nginx** (defined in `docker-compose.yml`)
- Angular is built on Windows, dist is copied to the target
- `config.ini` and `.env` are created manually on each target — never in git
- nginx always serves the Angular app and proxies `/api/*` to the Node backend

---

## At a glance

| | Local Dev | Local Docker | NUC Docker | Hetzner |
|---|---|---|---|---|
| **Purpose** | Daily coding | Pre-deploy test | LAN server | Public internet |
| **Accessible by** | You only | You only | LAN only | Everyone |
| **URL** | localhost:4200 | localhost | 192.168.0.217 | bbqweer.eu |
| **Angular** | `ng serve` (live) | Built dist | Built dist | Built dist |
| **Backend** | `node app.js` | Docker | Docker | Docker |
| **MySQL** | Docker :3307 | Docker | Docker | Docker |
| **Cron tasks** | Disabled | Running | Running | Running |
| **HTTPS** | No | No | No | Yes (Let's Encrypt) |
| **Deploy dist** | — | `docker compose restart nginx` | `scp` + `docker restart` | `rsync` + `docker compose restart` |

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
- Identical to NUC/Hetzner setup
- Angular must be built (`ng build`) before changes are visible
- nginx serves the static dist, backend runs in a container
- Quick to test: one build command + `docker compose restart nginx`

---

## Intel NUC — docker-prod (LAN server)

**What it is:** always-on Linux server in your home network running the full Docker stack.

**When to use:** persistent LAN deployment — data syncs run 24/7, accessible from any device on your network.

**Key points:**
- Accessible on `192.168.0.217` — not reachable from outside your network
- Older Docker: uses `docker-compose` (not `docker compose`)
- Angular dist deployed via `scp` from Windows
- MySQL data persists in a Docker volume across restarts
- KNMI sync and satellites sync run automatically on cron schedule

---

## Hetzner VPS (public internet)

**What it is:** cloud VPS running the full Docker stack, publicly reachable at bbqweer.eu.

**When to use:** production — the real website for public visitors.

**Key points:**
- Accessible from anywhere on the internet
- HTTPS via Let's Encrypt (certbot in Docker)
- Angular dist deployed via `rsync` from Windows
- Requires domain DNS pointing to the VPS IP
- Not yet live — setup documented in `deploy-to-hetzner.md`

---

## Deploy flow comparison

```
Windows (ng build)
       │
       ├─── Local Docker ──► docker compose restart nginx          (localhost)
       │
       ├─── NUC ───────────► scp dist → docker restart nginx       (192.168.0.217)
       │
       └─── Hetzner ────────► rsync dist → docker compose restart  (bbqweer.eu)
```

**Detailed guides:**
- Local dev + local Docker → `docs/dev-workflow.md`
- NUC → `docs/deploy-to-nuc.md`
- Hetzner → `docs/deploy-to-hetzner.md`
