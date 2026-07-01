# Self-hosted ntfy (bbqweer.eu)

Self-hosted [ntfy](https://ntfy.sh) push notification server at
`ntfy.bbqweer.eu`. Intended as a generic push channel for the project — the
first consumer is the file-alert system (see `plans/ndw-data.md`), but the
server itself is set up and tested independently of that.

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
    volumes:
      - ntfy_cache:/var/cache/ntfy
      - ntfy_data:/var/lib/ntfy
```

**Both env vars are required for iOS push to work at all** — see
"iOS push requires an upstream relay" below. `NTFY_UPSTREAM_BASE_URL` alone
makes the container refuse to start with `if upstream-base-url is set,
base-url must also be set`; `NTFY_BASE_URL` must be set to the server's own
public URL.

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

## Privacy / security

- A topic name (e.g. `filealerts`) is sufficient protection for now since the
  server is self-hosted (no public `ntfy.sh` with guessable topic names).
- Optionally later: set up ntfy auth (users/passwords) and per-topic ACLs if
  more sensitive content is added — see the
  [ntfy documentation](https://docs.ntfy.sh/config/#access-control) for
  configuration options.

## Cost

Negligible on top of existing infrastructure: open-source image, runs on the
existing VPS, uses the already-present Let's Encrypt cert mechanism and
domain. No cost for Apple APNs (no per-message charges).
