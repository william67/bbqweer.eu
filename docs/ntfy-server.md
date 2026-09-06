# Self-hosted ntfy (bbqweer.eu)

Self-hosted [ntfy](https://ntfy.sh) push notification server at
`ntfy.bbqweer.eu`. Intended as a generic push channel for the project — the
first consumer is the file-alert system (see `docs/tomtom.md`'s "Alerting
design" section), but the server itself is set up and tested independently
of that.

**Shared across projects** (as of 2026-09-06): this same `bbqweer-ntfy`
container/domain is also used by wo-ict.nl, which copied
`backend/helpers/ntfy.helper.js` as its own independent file rather than a
shared package — a fix or change made here does **not** automatically apply
there, and vice versa. Most topics are project-exclusive (see the table
below) so one project's traffic/outage never shows up in another's
subscription — the one exception is `servererrors`, deliberately shared:
both projects push generic task/server-health failures onto it (each
message is prefixed with the project name, e.g. "bbqweer.eu", so the source
is always clear on a combined feed). `NTFY_AUTH_DEFAULT_ACCESS: deny-all`
means a brand-new topic is invisible to everyone until explicitly granted,
so onboarding a new project/topic always means running `ntfy access` grants
like the ones below — see "Config" for the `topic_suffix` pattern used for
per-project dev/prod isolation too.

## Why self-host instead of a PWA web push or ntfy.sh

- No VAPID keys, no service worker to maintain, no iOS instability of
  standalone PWAs.
- One simple HTTP POST from the backend to send a notification.
- Topics are not private unless self-hosted with auth/ACLs, or given a long
  unguessable name — self-hosting gives control over this.
- Public `ntfy.sh` is a fine starting point with zero infra work, but the
  choice here is to self-host on the existing VPS (negligible extra cost,
  cert/DNS already in place).
- Even when self-hosted, the last hop to an iPhone still goes through Apple's
  APNs infrastructure — that's an iOS requirement for every app, transparent
  to both server and user.

## 1. Docker service

New service in `docker-compose.yml`, alongside the existing services:

```yaml
  ntfy:
    image: binwiederhier/ntfy
    container_name: bbqweer-ntfy
    restart: unless-stopped
    command: serve
    environment:
      NTFY_BASE_URL: https://ntfy.bbqweer.eu
      NTFY_UPSTREAM_BASE_URL: https://ntfy.sh
      NTFY_AUTH_FILE: /var/lib/ntfy/auth.db
      NTFY_AUTH_DEFAULT_ACCESS: deny-all
    volumes:
      - ntfy_cache:/var/cache/ntfy
      - ntfy_data:/var/lib/ntfy
```

**`NTFY_BASE_URL` + `NTFY_UPSTREAM_BASE_URL` are both required for iOS push
to work at all** — see "iOS push requires an upstream relay" below.
`NTFY_UPSTREAM_BASE_URL` alone makes the container refuse to start with
`if upstream-base-url is set, base-url must also be set`; `NTFY_BASE_URL`
must be set to the server's own public URL.

**`NTFY_AUTH_FILE` + `NTFY_AUTH_DEFAULT_ACCESS: deny-all`** enable
authentication (see "Authentication" below) — without an explicit per-topic
ACL grant, nobody (not even anonymous readers) can access any topic. The
`auth.db` file lives on the `ntfy_data` volume, so it survives container
recreation; it is not something to configure via git-tracked files.

And in the `volumes:` section at the bottom of the file:

```yaml
volumes:
  mysql_data:
  ntfy_cache:
  ntfy_data:
```

No host port exposed — same as `nodejs`, reachable internally only and
proxied through nginx.

## 2. nginx config

New server block in `nginx/nginx.conf`, analogous to the existing block for
`bbqweer.eu`. ntfy uses WebSocket/long-polling for the app connection, so the
same `Upgrade`/`Connection` headers as the existing `/socket.io/` block:

```nginx
server {
    listen 80;
    server_name ntfy.bbqweer.eu;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name ntfy.bbqweer.eu;

    ssl_certificate     /etc/letsencrypt/live/bbqweer.eu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bbqweer.eu/privkey.pem;

    location / {
        proxy_pass         http://ntfy:80;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
    }
}
```

## iOS push requires an upstream relay

**A self-hosted ntfy server cannot deliver push notifications to iOS on its
own.** Android works fine self-hosted (the app keeps a WebSocket connection
alive via a foreground service). iOS does not allow this — background apps
get suspended, so delivery must go through Apple's APNs, and only the
official `ntfy.sh` server holds the Apple push credentials tied to the
app's bundle ID. A self-hosted server has no way to talk to APNs directly.

The fix: configure `upstream-base-url` (`NTFY_UPSTREAM_BASE_URL` env var) to
`https://ntfy.sh`, so the self-hosted server relays iOS push delivery through
ntfy's official infrastructure while still serving the topic/API/web UI
itself. `base-url` (`NTFY_BASE_URL`, the server's own public URL) must also
be set — the container refuses to start otherwise. See the `docker-compose.yml`
snippet above.

**Symptom without this fix**: the app connects and subscribes fine (WebSocket
works while the app is in the foreground), but nothing arrives on the
lock/home screen once the app is backgrounded or closed — this is what
happened during the actual rollout on 2026-07-01, and adding the two env
vars fixed it immediately.

## 3. Local testing (Stage 2 Docker, HTTP-only)

Before touching production: run the `ntfy` service locally via the
`docker-compose.local.yml` flow and check the web UI is reachable at
`http://localhost:<mapped port>` (temporarily map a port for local testing,
not part of the production config).

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --no-build ntfy
```

Send a test message:

```powershell
curl -d "Test message" -H "Title: Test" https://localhost/filealerts   # or the locally mapped port
```

## 4. One-time production steps on the VPS

Same procedure as the initial HTTPS setup in `docs/deploy-to-hetzner.md` §2
and §12, with the extra subdomain added. **Note: this causes brief production
downtime** (nginx is stopped while the cert is obtained) — schedule it for a
quiet moment.

### Step 1 — Add the DNS A record

At the DNS provider (outside our tooling — done by the user):

| Type | Name | Value |
|------|------|-------|
| A | `ntfy.bbqweer.eu` | `<VPS_IP>` |

Wait for propagation, verify with `nslookup ntfy.bbqweer.eu` from the VPS.

### Step 2 — Expand the certificate with the new subdomain

```bash
cd /opt/bbqweer && docker compose stop nginx

docker run --rm -p 80:80 \
  -v /opt/bbqweer/certbot_certs:/etc/letsencrypt \
  certbot/certbot certonly --standalone --expand \
  -d bbqweer.eu -d www.bbqweer.eu -d ntfy.bbqweer.eu \
  --email woorschot67@gmail.com --agree-tos --no-eff-email
```

**Note the `--expand` flag** — without it, certbot refuses with "You have an
existing certificate that contains a portion of the domains you requested",
since a cert for `bbqweer.eu`/`www.bbqweer.eu` already exists. `--expand`
lets certbot replace the existing cert with a version that includes the extra
SAN, with no further prompts needed (confirmed during the actual rollout on
2026-07-01).

This overwrites the existing cert with a version that covers all three
domains as SANs (`ssl_certificate`/`ssl_certificate_key` paths in
`nginx.conf` stay unchanged — still `/etc/letsencrypt/live/bbqweer.eu/...`).

### Step 3 — Upload configs and restart

```powershell
scp C:/Apps/bbqweer.eu/nginx/nginx.conf root@bbqweer.eu:/opt/bbqweer/nginx/nginx.conf
scp C:/Apps/bbqweer.eu/docker-compose.yml root@bbqweer.eu:/opt/bbqweer/docker-compose.yml
```

```powershell
ssh root@bbqweer.eu "cd /opt/bbqweer && docker compose up -d --build"
```

### Step 4 — Verify

- `https://ntfy.bbqweer.eu` opens in the browser with a valid certificate
  (ntfy web UI loads).
- From the VPS (or locally): test-curl to a topic, confirm it's accepted.
- ntfy app on the phone: set the custom server to `https://ntfy.bbqweer.eu`
  instead of `ntfy.sh`, subscribe to the topic, receive a test message.

## 5. Setting up the iPhone app

1. App Store → search for **ntfy** and install the official app, published
   by **Philipp Heckel** (the creator/maintainer of the ntfy project). Double
   check the publisher when installing — there are other apps in the store
   with similar names.
2. Open the app → settings (gear icon) → change **Default Server** from
   `https://ntfy.sh` to `https://ntfy.bbqweer.eu` — must include the
   `https://` prefix, or the Subscribe button stays inactive.
3. Home screen → **Subscribe to topic** → enter the topic name (e.g.
   `filealerts`) → confirm.
4. Send a test push from a terminal with access to the server:
   ```bash
   curl -d "Test message" -H "Title: Test alert" -H "Priority: high" -H "Tags: white_check_mark" https://ntfy.bbqweer.eu/filealerts
   ```
5. Confirm the notification arrives on the device (even with the app in the
   background — that's the point of the APNs integration).

## First rollout result (2026-07-01)

- Docker service, nginx config, and cert expansion were successfully rolled
  out on the Hetzner VPS. All containers (`bbqweer-mysql`, `bbqweer-nginx`,
  `bbqweer-nodejs`, `bbqweer-ntfy`, `bbqweer-redis`, `bbqweer-certbot-1`) came
  up cleanly after `docker compose up -d --build`.
- Both `https://bbqweer.eu` and `https://ntfy.bbqweer.eu` returned `200 OK`
  immediately after the restart — no noticeable downtime beyond the few
  seconds nginx was stopped for the certbot step.
- Test-curl to `/filealerts` returned a valid ntfy JSON response (message
  accepted by the server).
- First iOS subscribe attempt failed silently (Subscribe button inactive) —
  cause was a missing `https://` prefix on the server URL in the app.
- First test pushes were accepted by the server but never arrived on the
  phone once backgrounded — cause was the missing iOS APNs upstream relay
  (see "iOS push requires an upstream relay" above). Adding
  `NTFY_BASE_URL` + `NTFY_UPSTREAM_BASE_URL` and recreating the `ntfy`
  container fixed it — confirmed with multiple test pushes arriving as
  lock-screen notifications with sound.
- End-to-end push delivery confirmed working: self-hosted server →
  ntfy.sh upstream relay → APNs → iPhone lock screen.

## Authentication

Publishing is protected with a Bearer token; subscribing (reading) stays
open to anonymous clients, so the iPhone app doesn't need to log in. Set up
once, after `NTFY_AUTH_FILE` + `NTFY_AUTH_DEFAULT_ACCESS: deny-all` are
deployed (see the `docker-compose.yml` snippet above):

```bash
# Create a publish-only user (prompts for a password twice — pipe it non-interactively via SSH)
docker exec -i bbqweer-ntfy sh -c "printf '%s\n%s\n' '<password>' '<password>' | ntfy user add alertbot"

# Anonymous readers may subscribe; only alertbot may publish — repeat per topic
docker exec bbqweer-ntfy ntfy access everyone filealerts read-only
docker exec bbqweer-ntfy ntfy access alertbot filealerts write-only
docker exec bbqweer-ntfy ntfy access everyone strikealerts read-only
docker exec bbqweer-ntfy ntfy access alertbot strikealerts write-only

# Generate a long-lived Bearer token for alertbot (this is what the backend / Postman uses)
docker exec bbqweer-ntfy ntfy token add alertbot
```

The token (`tk_...`) is the actual secret — the user's password is never
used directly for publishing once the token exists. **Never commit the
token or password to git.** Store it in a gitignored location (e.g.
`backend/config.ini` on the VPS, once the alerting task in `docs/tomtom.md`
is built) or a password manager.

**Publishing with the token:**

```bash
curl -H "Authorization: Bearer <token>" -d "message" -H "Title: ..." https://ntfy.bbqweer.eu/filealerts
```

In Postman: add header `Authorization: Bearer <token>`, same body/headers as
any other publish request.

**Verification** (confirmed during rollout on 2026-07-01):
- Anonymous publish (no `Authorization` header) → `403`
- Publish with the `alertbot` token → `200`, message delivered to the phone
- Anonymous read (`GET /filealerts/json?poll=1`) → `200`, unaffected by the
  `deny-all` default since `everyone` has an explicit `read-only` grant

See the [ntfy access control documentation](https://docs.ntfy.sh/config/#access-control)
for the full permission model (roles, tiers, more granular ACLs).

## Backend integration — centralized alert-dispatch queue

All backend code that wants to push a notification calls a single shared
helper instead of hitting ntfy's HTTP API directly. This avoids duplicating
Bearer-token handling and cooldown/dedup logic across every alert producer
(lightning proximity today; the TomTom file-alert task and any future
producer later).

**Separate topics/streams** — each alert category gets its own ntfy topic,
so a phone can subscribe to one without the other:

| Topic | Content | Producers |
|-------|---------|-----------|
| `filealerts`   | Traffic jam / file-area alerts | `backend/tasks/file-area-incidents.js` (`file-area-{id}-{start,repeat,end}`); `POST /api/ntfy/test` (`type: 'traffic'`) |
| `strikealerts` | Lightning proximity alerts + per-area strike alerts | `backend/socket/blitzortung.js` (`lightning-proximity`); `backend/tasks/strike-area-alerts.js` (`strike-area-{id}-{start,repeat,end}`); `POST /api/ntfy/test` (`type: 'lightning'`) |
| `servererrors` | Cross-project server/task error alerts (as of 2026-09-06) | `backend/helpers/server-tasks.js` (`taskFinish()` on `status: 'error'`, key `task-error-{taskCode}`) — covers every one-shot background task (`knmidata-v4`, `satellites-sync`, `energy-prices-sync`, `file-area-incidents`, `tomtom-incidents-sync`, `strike-area-alerts`); `backend/socket/blitzortung.js` (`blitzortung-service-error`, for the always-running WSS/Redis stream — see below); `POST /api/ntfy/test` (`type: 'server'`); **also shared with wo-ict.nl**'s own independent copy of `ntfy.helper.js` — see "Shared across projects" above. |

All topics need the same anonymous-read ACL grant on the server (see
"Authentication" below) — `ntfy access everyone <topic> read-only` per topic.

**`backend/helpers/ntfy.helper.js`** — `sendAlert({ topic, key, title,
message, priority, tags, dedupeMs })`:
- Fire-and-forget: pushes onto an in-memory queue and returns immediately —
  the caller (e.g. the Blitzortung WSS listener) never blocks on the actual
  HTTP POST to ntfy.
- A `setInterval` drain loop (1s) pops one item at a time and POSTs it to
  `NTFY_URL` with `Authorization: Bearer <NTFY_TOKEN>` when a token is
  configured.
- `key` + `dedupeMs` (default 5 min) provide per-alert-type dedup — a second
  `sendAlert()` call with the same `key` within the cooldown window is
  dropped before it ever reaches the queue. Omit `key` to always send (used
  for manual test messages).
- Failed sends retry up to 3 attempts (re-queued at the back), then are
  dropped with a logged error — no dead-letter storage, this is a
  low-volume personal-alert use case, not a durable queue.
- Deliberately **not** Redis Streams/BullMQ — in-memory is sufficient at this
  alert volume and keeps the dependency footprint small.

**Config** — `[ntfy]` section in `config.ini` / `config.local.ini` (both
gitignored, never auto-deployed — see CLAUDE.md's config pattern):

```ini
[ntfy]
base_url =
token =
home_lat =
home_lon =
radius_km =
cooldown_min =
topic_suffix =
```

`base_url` is the server root (e.g. `https://ntfy.bbqweer.eu`, no topic
suffix) — `sendAlert()` posts to `${base_url}/${topic}${topic_suffix}`.
`base_url`/`token`/`topic_suffix` are read directly by `ntfy.helper.js`
(`NTFY_BASE_URL`/`NTFY_TOKEN`/`NTFY_TOPIC_SUFFIX`). `home_lat`/`home_lon`/
`radius_km`/`cooldown_min` are read by `backend/socket/blitzortung.js` for
the lightning-proximity feature (distance threshold + cooldown minutes,
converted to `dedupeMs`). If `base_url` is empty, `sendAlert()` logs an error
and no-ops instead of throwing — the app runs fine with ntfy unconfigured, it
just doesn't send pushes.

`topic_suffix` is appended to every topic name before publishing — e.g.
`_dev` turns `strikealerts` into `strikealerts_dev`. Set in
`config.local.ini` only (left empty in `config.ini`/prod), so local dev
testing never lands on the real production topics a phone might be
subscribed to. Under `deny-all`, the suffixed topic doesn't inherit the base
topic's ACL grants — both are needed before it works end-to-end:

```bash
docker exec bbqweer-ntfy ntfy access alertbot strikealerts_dev write-only
docker exec bbqweer-ntfy ntfy access everyone strikealerts_dev read-only
```

Without the `write-only` grant, `sendAlert()` still queues normally but the
actual POST gets a 403 from ntfy — logged as a failed send, retried 3x, then
dropped; nothing crashes.

**Consumers today:**
- `backend/socket/blitzortung.js` — `addStrike()` calls `sendAlert({ topic:
  'strikealerts', key: 'lightning-proximity', dedupeMs: COOLDOWN_MS, ... })`
  when a strike lands within `radius_km` of the configured home coordinates.
  This replaced a bespoke `lastNotifiedAt`/`COOLDOWN_MS` tracking block that
  used to live directly in this file.
- `backend/routes/ntfy.route.js` — `POST /api/ntfy/test` (auth-protected),
  body `{ type: 'traffic' | 'lightning' }`, sends one of two canned Dutch
  test messages (`traffic` → `filealerts` topic, `lightning` →
  `strikealerts` topic) with no dedup key (always sends). Exposed in the
  frontend as a **"Test bericht" button**, visible only to logged-in users,
  on both the Bliksem page (`type: 'lightning'`) and the Filemeldingen page
  (`type: 'traffic'`) — lets an admin confirm push delivery end-to-end
  without waiting for a real strike or traffic jam.
- `backend/tasks/strike-area-alerts.js` — cron task (`*/15 * * * * *`,
  always-on, same reasoning as `file-area-incidents`), computes strikes per
  `strike_areas` polygon using `blitzortung.js`'s `getInWindow()` (Redis
  `GEOSEARCH` bbox prefilter) + `@turf/boolean-point-in-polygon` (exact
  filter), keeping only strikes within `ACTIVE_WINDOW_MS` (2 min) of now.
  Per-area state machine sends a **start** alert on 0→active, a **repeat**
  alert every `REPEAT_INTERVAL_MS` (5 min) while it stays active, and an
  **end** alert on active→0 — the 2-minute window (not the 5-minute repeat
  cadence) is what drives the end alert, so it tracks the real last-strike
  time to within one ~15s tick. Message text spells out the window ("X
  inslagen in de laatste 2 minuten in {area.name}") so it's clear the count
  isn't a running total. The same computed count is exposed via
  `getStrikeCounts()` and merged into `GET /api/strike-areas` as
  `incidentCount`, shown in the Bliksem page's areas list dialog
  (`incidentCountLabel="Inslagen (laatste 2 min)"` on `<app-area-manager>`).
- `backend/tasks/file-area-incidents.js` — cron task (`2,12,22,32,42,52 7-18
  * * *` + `2 19 * * *`, `Europe/Amsterdam`, offset 2 min after
  `tomtom-incidents-sync`), same per-area state machine pattern as
  `strike-area-alerts.js` above, added 2026-08-29. Counts TomTom incidents
  intersecting each `file_areas` polygon (`@turf/boolean-intersects`) and
  sends a **start** alert on 0→active, a **repeat** alert on every
  subsequent tick while active (no time-based throttle — the task's own
  ~10min recalculation cadence is already sparse enough, unlike strikes'
  15s ticks), an **end** alert on active→0, firing immediately on the next
  tick since the count isn't time-windowed. **Experimental**: unlike strikes,
  TomTom's counts aren't time-windowed — an incident only clears when TomTom
  itself reports it resolved, so "active" can persist for hours on a real
  jam. Count exposed via `getIncidentCounts()`, merged into `GET
  /api/file-areas` as `incidentCount`, shown in the Filemeldingen page's
  areas list dialog (`incidentCountLabel="Filemeldingen"` on
  `<app-area-manager>`).
- **Per-area notify toggle** (added 2026-08-29): both `file_areas` and
  `strike_areas` have a `notifyEnabled TINYINT(1) NOT NULL DEFAULT 0` column
  (`database/init/14-area-notify-toggle.sql`) — off by default, an admin
  opts an area in via the "Berichten versturen" checkbox in
  `AreaManagerComponent`'s edit dialog. Both tasks' `loadAreas()` select it
  and gate only the `sendAreaAlert()` call sites with it; the underlying
  count/`isOngoing` state machine keeps recalculating every tick regardless,
  so toggling on mid-active-period can surface a `repeat`/`end` push without
  a preceding `start` — accepted as a simplification rather than adding
  suppression logic for that edge case.
- **Task/server-error alerts** (added 2026-09-06): `backend/helpers/server-tasks.js`'s
  `taskFinish(taskCode, status, message)` pushes to `servererrors` whenever
  `status === 'error'` — title "🔴 bbqweer.eu — Taak fout", body
  `{taskCode}: {message}`, key `task-error-{taskCode}`, deduped 15 min per
  task (some tasks, e.g. `strike-area-alerts`, run every 15s and would
  otherwise flood the topic if stuck failing). This is a single shared hook,
  so it automatically covers every one-shot task that calls `taskFinish()`
  on failure — no per-task wiring needed. It does **not** cover
  `blitzortung-service` (the always-running WSS/Redis listener in
  `blitzortung.js`, renamed from `lightning-service` in
  `database/init/15-rename-lightning-service-task.sql` to match wo-ict.nl's
  own `-service` naming convention — see
  `c:\Apps\dev-standards\backend\server-monitoring.md`), which by design
  never calls `taskFinish()` (see "Background Tasks" → "Always-running
  tasks" in CLAUDE.md); that task gets its own targeted alert instead —
  `sendStreamProblemAlert()` in `blitzortung.js`, called from all 4 of its
  error paths (Redis error, Redis connect failure, WSS disconnect, WSS
  error) with one shared key (`blitzortung-service-error`) deduped to once
  per hour, since the WSS
  auto-reconnects every 5s and would otherwise spam on a routine hiccup.
  Manually testable via the Taakstatus dialog's **"Test bericht" button**
  (`POST /api/ntfy/test`, `{type: 'server'}`).

## Cost

Negligible on top of existing infrastructure: open-source image, runs on the
existing VPS, uses the already-present Let's Encrypt cert mechanism and
domain. No cost for Apple APNs (no per-message charges).
