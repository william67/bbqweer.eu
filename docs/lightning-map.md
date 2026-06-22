# Lightning Map

Real-time lightning strike map for bbqweer.eu, based on the proof-of-concept in wo-ict.nl.
Data source: [lightningmaps.org](https://lightningmaps.org) WebSocket (Blitzortung network).

## Status

- [x] Redis service in `docker-compose.yml` (redis:8-alpine, 128MB cap, internal-only)
- [x] Redis port 6379 exposed on host via `docker-compose.local.yml` (local dev only)
- [x] `backend/socket/blitzortung.js` — WSS + Redis store + Socket.IO
- [x] `backend/app.js` wired: `http.createServer` + `socket.io` Server + `initBlitzortung`
- [x] `nginx/nginx.conf` + `nginx.local.conf` — `/socket.io/` proxy with WebSocket upgrade
- [x] `socket.io-client` installed in frontend; added to `allowedCommonJsDependencies`
- [x] `environment.ts` / `environment.production.ts` — `wsUrl` added
- [x] `LightningService` — wraps Socket.IO events as RxJS Observables
- [x] `LightningModule` + `LightningComponent` — Leaflet map, bolt markers, thunder ring, counter
- [x] Route `/#/lightning` wired in `app-routing-module.ts`
- [x] **Bliksem** added to topbar nav

---

---

## Data Flow

```
lightningmaps.org (WSS)
        │
        ▼
  Node.js backend ──► Redis (time + geo + data)
        │                     │
        │  pruneOld() 30s     │ ZRANGEBYSCORE / GEOSEARCH
        ▼                     ▼
  Socket.IO ──────────► Frontend (Angular)
     'new-strike'         'get-initial-list' → 'initial-list' (client-driven, after map init)
                          'new-strike'        live updates
                          'get-window'        on-demand viewport query
```

This is the one page in bbqweer.eu that uses **Socket.IO** — lightning strikes are real-time push events, not batch data. This follows the `handle-live-data` skill. The existing HTTP REST deviation in CLAUDE.md applies only to the weather/forecast pages.

---

## Why Redis (not a JS array)

| | JS array (PoC) | Redis (production) |
|---|---|---|
| Pruning | O(n) scan every 30s | O(log n) `ZRANGEBYSCORE` |
| Viewport query | Manual bbox loop | `GEOSEARCH BYBOX` |
| Concurrency | In-process only | Multi-process safe |
| Memory | Unbounded | Hard cap via `maxmemory` |

During heavy thunderstorms the Netherlands can see hundreds of strikes per minute. Redis handles this cleanly; a JS array degrades.

---

## Detection Bounds

```js
const BOUNDS = { latMin: 40.0, latMax: 59.0, lonMin: -12.0, lonMax: 30.0 };
```

Covers Western + Central Europe: Ireland/UK in the west, Finland/Baltics in the north, Ukraine/Romania in the east, Mediterranean in the south.
Backend filters incoming WSS strikes to this bounding box before storing.
Frontend draws this as a dashed rectangle on the map.

---

## Backend

### New packages

```
npm install ioredis socket.io
```

### Redis data model

Three structures, always written/pruned in a single `MULTI` transaction:

| Key | Redis type | Purpose |
|---|---|---|
| `strikes:time` | Sorted Set (score = timestamp ms) | TTL window / pruning |
| `strikes:geo` | Geo Set (lon/lat) | Viewport queries via GEOSEARCH |
| `strikes:data` | Hash (id → JSON) | Full strike payload |

TTL: 10 minutes. `pruneOld()` runs every 30s via `setInterval`.

### New file: `backend/socket/blitzortung.js`

Responsibilities:
- Open WSS to `wss://live.lightningmaps.org/` (or `live2`, picked at random)
- Handle auth challenge-response: server sends `k` → client sends `(k*3604)%7081 * Date.now()/100`; requires `Origin: https://www.lightningmaps.org` header
- On first message: read `port` field; use it for subsequent reconnects (typically `8085`)
- Dedup incoming strikes by nanosecond `time` field (Map, 150s TTL, cleaned every 30s)
- Filter to BOUNDS
- Store in Redis via `addStrike()`, emit `new-strike` to all Socket.IO clients
- Auto-reconnect after 5s on close; `isNew: true` only on live strikes, not reconnect replay
- `MAX_BUFFER = 500` strikes, `MAX_AGE_MS = 10min` (guards against reconnect storms)

Exported functions:
```js
function initBlitzortung(io) { ... }       // call once on app start
function initSocketBlitzortung(socket) {   // called for each new socket connection
  const sendInitialList = () =>
    getAllCurrent().then(strikes => socket.emit('initial-list', strikes));
  socket.on('get-initial-list', sendInitialList); // client requests after map is ready
  socket.on('get-window', async ({ lon, lat, widthKm, heightKm }) => {
    socket.emit('window-result', await getInGpsWindow(...));
  });
}
```

### Wire into `backend/app.js`

```js
const http       = require('http');
const { Server } = require('socket.io');
const { initBlitzortung, initSocketBlitzortung } = require('./socket/blitzortung');

const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

initBlitzortung(io);

io.on('connection', socket => {
  initSocketBlitzortung(socket);
});

server.listen(3000);   // replace app.listen(3000)
```

> **Note**: switching from `app.listen` to `server.listen` is required to share the HTTP server with Socket.IO. All existing Express routes continue to work unchanged.

### New Docker service: Redis

Add to `docker-compose.yml`:

```yaml
redis:
  image: redis:8-alpine
  command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
  restart: unless-stopped
  networks:
    - bbqweer-net
```

Add `redis` to the `depends_on` list of the `nodejs` service.
Redis is internal-only — no port published to host.

---

## Frontend

### New lazy module: `LightningModule`

```
frontend/src/app/pages/lightning/
├── lightning.module.ts
├── lightning-routing.module.ts
└── lightning.component.ts / .html / .css
```

Route: `/#/lightning`, topbar label: **Bliksem**, icon: `pi-bolt` (or `⚡`).

### New service: `LightningService`

Service owns the socket lifecycle. All listeners are set up once in the constructor. On every `connect` (first connect + reconnects) it auto-requests the initial list. Exposes plain Subjects for the component to subscribe to.

```typescript
@Injectable({ providedIn: 'root' })
export class LightningService implements OnDestroy {
    private socket: Socket;
    readonly initialList$ = new Subject<Strike[]>();
    readonly newStrike$   = new Subject<Strike>();

    constructor() {
        this.socket = io(environment.wsUrl, { transports: ['websocket'] });
        this.socket.on('connect',      () => this.requestInitialList());
        this.socket.on('initial-list', (list: Strike[]) => this.initialList$.next(list));
        this.socket.on('new-strike',   (s: Strike)      => this.newStrike$.next(s));
    }

    requestInitialList(): void { this.socket.emit('get-initial-list'); }
    get connected(): boolean   { return this.socket.connected; }
    ngOnDestroy()              { this.socket.disconnect(); }
}
```

Add `wsUrl` to `environment.ts`:
- dev: `'http://localhost:3000'`
- prod: `''` (same origin — nginx proxies Socket.IO via `/socket.io/` path)

### Nginx — add Socket.IO proxy

Add to `nginx/nginx.conf` (inside the HTTPS server block):

```nginx
location /socket.io/ {
    proxy_pass         http://nodejs:3000;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection "upgrade";
    proxy_set_header   Host $host;
}
```

### LightningComponent

**Map setup** (follows bbqweer Leaflet pattern — `@ViewChild` + `setTimeout` via `ngAfterViewInit`):
- Center: `[49.5, 9.0]`, zoom 5 (geometric center of detection bounds)
- Tile layer: OSM street map
- Detection bounds: `L.rectangle([[40.0, -12.0], [59.0, 30.0]])` — dashed blue, 4% fill opacity

**Component lifecycle — `ngAfterViewInit`**:
1. `initMap()` — creates Leaflet map and canvas renderer
2. Subscribe to `svc.initialList$` — on each emission: `clearAllStrikes()`, render list, subscribe to `svc.newStrike$` (guarded by `liveSubscribed` flag so only once)
3. Subscribe to `svc.newStrike$` only happens here, inside the `initialList$` callback — prevents a burst of ring animations during the async Redis query before the first list arrives
4. If already connected: `svc.requestInitialList()` (handles second-visit case where `connect` won't fire)

**Strike lifecycle — `flashStrike(strike, updateDisplay)`**:
1. Dedup check via `strikeKeys: Set<string>` (key = `timeMs:lat(4dp):lon(4dp)`) — prevents the same strike from being rendered twice when `newStrike$` and `initialList$` race
2. Compute `remainingMs = RING_DURATION_MS - (Date.now() - strike.timeMs)`
3. `isLive = strike.isNew && remainingMs > 0` → yellow bolt + ring + `styleTimer`
4. `isLive = false` → grey bolt immediately (initial-list items, old/background strikes)
5. `styleTimer` fires at `remainingMs`: flips `entry.isLive = false`, switches to grey, calls `updateCounts()`
6. Fade interval (every 10s): opacity fade based on age, removes at 10min

**Ring lifecycle**:
- `startRing(entry)`: creates `L.circle` + `setInterval` stored on `entry.ring`; start radius = correct position for strikes already in progress
- `stopRing(entry)`: clears interval, removes circle, nulls `entry.ring`
- `refreshRings()`: called on `zoomend` — zoom ≥10 starts rings for all still-live entries; zoom <10 stops all rings
- All timers owned by `StrikeEntry` — `clearAllStrikes()` and `ngOnDestroy` cancel everything cleanly

**Counter — `updateCounts()`**:
- `activeCount` = `this.strikes.filter(s => s.isLive).length` — exactly matches yellow markers, updates immediately when `styleTimer` fires (no polling lag)
- `viewportCount` = active strikes inside current map bounds (updates on `moveend`/`zoomend`)
- `totalCount` = all strikes in the 10-minute window

**Strike markers** — canvas-rendered bolt shape (`boltMarker()` factory):

All markers share a single `L.canvas()` renderer — drawn on one `<canvas>` element instead of one DOM node per strike. The `boltMarker` factory creates an `L.circleMarker` but overrides `_updatePath` to draw the ⚡ bolt path, then delegates fill/stroke to `renderer._fillStroke` so all Leaflet style options work normally.

| Style | Fill | Stroke | Radius |
|---|---|---|---|
| `STYLE_ACTIVE` | `#facc15` yellow | `#ef4444` red | 10px |
| `STYLE_OLD` | `#e5e7eb` near-white | `#000000` black | 7px |

**Thunder ring** (only when `map.getZoom() >= 10`):
- Speed: 343 m/s, max radius: 10km, step interval: 200ms
- `L.circle`, yellow `#ffff00`, weight 3, opacity fading from 1.0 → 0
- Store timers in `rippleTimers[]`, cleared in `ngOnDestroy`

**Counter chip** in page header:
- `activeCount` — yellow (live) strikes only; `entry.isLive` is the source of truth
- `viewportCount` — yellow strikes inside current map bounds
- `totalCount` — all strikes in the 10-minute window
- Displayed as `⚡ viewportCount / activeCount`

**Cleanup in `ngOnDestroy`**:
- `clearAllStrikes()` — cancels all `styleTimer`s, stops all rings, removes all markers
- Clears fade `setInterval`
- Removes Leaflet map

---

## `environment.ts` additions

```typescript
// environment.ts (dev)
wsUrl: 'http://localhost:3000'

// environment.production.ts (prod)
wsUrl: ''   // same origin
```

---

## npm packages

| Package | Where | Purpose |
|---|---|---|
| `ioredis` | backend | Redis client |
| `socket.io` | backend | Server-side Socket.IO |
| `socket.io-client` | frontend | Client-side Socket.IO |

---

## Implementation Order

1. **Redis** — add service to `docker-compose.yml`, test locally (`docker compose up redis`)
2. **Backend** — `backend/socket/blitzortung.js` (WSS → Redis → Socket.IO); wire into `app.js`
3. **Backend test** — connect a browser WebSocket client or `wscat` to verify strike flow
4. **Nginx** — add Socket.IO proxy block; test with local Docker stack
5. **Frontend service** — `LightningService` (Socket.IO client)
6. **Frontend component** — map, markers, thunder ring, counter chip
7. **Nav** — add Bliksem entry to topbar
8. **End-to-end test** — wait for a real thunderstorm, or inject a test strike from the backend
9. **Deploy** — `.\deploy-hetzner.ps1`

---

## Known Issues / Gotchas (from PoC)

- **Auth challenge-response is mandatory** — without spoofing `Origin: https://www.lightningmaps.org`, the WSS handshake is rejected.
- **Port redirect** — server sends a `port` field on first message; subsequent reconnects must use it (typically `8085`, not `443`).
- **Reconnect replay** — on WSS reconnect, the server replays recent strikes. Set `isNew: false` on these (check the `isNew` field from the server or use the `remainingMs` guard on the frontend) to avoid spurious thunder rings.
- **Tab-background burst** — Socket.IO queues messages while the tab is hidden. On tab-focus, many strikes arrive at once. The `remainingMs` check before drawing a ring prevents all of them animating; stale ones become grey bolts directly.
- **`app.listen` → `server.listen`** — required for Socket.IO to share the HTTP server. Miss this and Socket.IO connections silently fail.
- **Redis not needed for local dev** — during development, the backend can fall back to the JS-array approach (like the PoC) if Redis is not running, or just start the Redis container (`docker compose up -d redis`).

---

## Key implementation notes

### Thunder ring start radius (tab-background fix)
When the browser tab is in the background, Socket.IO queues messages. On focus, multiple strikes arrive at once — some potentially 20s old. `remainingMs = RING_DURATION_MS - (Date.now() - strike.timeMs)` is computed before drawing; if ≤ 0, the strike becomes a grey bolt immediately. If > 0, the ring starts at the correct radius (`startRadius = elapsed_s * 343`) so it doesn't jump back to zero.

### isNew flag
The backend emits `{ ...strike, isNew: true }` for live strikes only. The Redis `initial-list` reply has no `isNew` flag — so historical strikes on connect become grey bolts without rings.

### Initial list is client-driven, not auto-pushed
The backend does NOT auto-send `initial-list` on connect. `LightningService` (root-scoped, socket survives navigation) sets up all socket listeners once in its constructor and auto-requests `get-initial-list` on every `connect` event. The component subscribes to `svc.initialList$` / `svc.newStrike$` in `ngAfterViewInit` after `initMap()`, then explicitly calls `svc.requestInitialList()` if the socket is already connected (second-visit case). The component clears all existing markers before rendering a new `initial-list` so reconnects don't double-render.

### Local dev connection
`ng serve` → `environment.wsUrl = 'http://localhost:3000'` → Socket.IO connects directly to the backend, bypassing nginx entirely. Nginx only handles Socket.IO in Docker/production via the `/socket.io/` proxy block.

### Redis auto-detection
`blitzortung.js` checks `fs.existsSync('./config.local.ini')` at startup — same pattern as `mysqlpool-knmi.helper.js`. Local dev → `127.0.0.1:6379`, Docker → `redis:6379`.

### Double backend in local dev
If Docker `bbqweer-nodejs` is running alongside local `node app.js`, both connect to Blitzortung and write to the same Redis with separate in-memory dedup caches — resulting in 2× strikes in Redis and 2× in the initial list. Always stop the Docker container when running locally:
```powershell
docker stop bbqweer-nodejs
docker exec bbqweer-redis redis-cli DEL strikes:time strikes:geo strikes:data
```
The frontend also guards against duplicates via `strikeKeys: Set<string>`, but the root cause is the double backend.

### newStrike$ / initialList$ race condition (dedup)
A strike can arrive via `newStrike$` AND appear in the next `initialList$` response if it was written to Redis before the query ran. The frontend deduplicates using a `Set<string>` keyed by `timeMs:lat(4dp):lon(4dp)`. `clearAllStrikes()` clears the set; `fade()` removes individual keys as strikes expire.

---

## Out of scope

- MQTT (disabled in PoC due to poor broker performance — WSS only, permanently)
- Historical storage beyond 10min TTL
- Phase 2: own Blitzortung detection station
- Room-based Socket.IO subscriptions per GPS window (broadcast is fine at this scale)
