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
- [x] Lightning index badge in topbar — strikes/30s via Socket.IO, yellow pill, 500ms refresh
- [x] ntfy.sh push alerts — geo-distance check per strike, optional `[ntfy]` config section
- [x] `live2.lightningmaps.org` — deduplicates server-side (switched from `live` which sends each bolt twice)
- [x] `receivedAt` stored in Redis — clock-skew-proof delay calculation (`receivedAt - timeMs`, both from backend clock)
- [x] `lightning-delay` Socket.IO event — backend queries Redis every 1s, emits `{ avg, min, max, samples }` for last 60s
- [x] Delay chip with tooltip — shows avg/min/max/samples on hover; `TooltipModule` in `LightningModule`
- [x] `viewportTotalCount` — all strikes (not just active) visible in current map viewport
- [x] Satellite layer toggle — Esri World Imagery (`/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`), no API key
- [x] SVG renderer for detection bounds rectangle — prevents flash/repaint on pan
- [x] Triple flash on new strike — white→yellow×3 over 550ms (5 chained `setTimeout` calls)
- [x] Navigate-back fix — `Router` + `NavigationEnd` (skip first) → `map.invalidateSize()` + `requestInitialList()` after 50ms
- [x] Reconnect fix — `socketReconnect$ Subject<void>` in service, fired by `socket.io.on('reconnect')`, component calls `requestInitialList()` on each reconnect

---

## Data Flow

```
lightningmaps.org (WSS)
        │
        ▼
  Node.js backend ──► Redis (time + geo + data, includes receivedAt)
        │                     │
        │  pruneOld() 30s     │ ZRANGEBYSCORE / GEOSEARCH / HMGET
        ▼                     ▼
  Socket.IO ──────────► Frontend (Angular)
     'new-strike'         'get-initial-list' → 'initial-list' (client-driven, after map init)
     'lightning-index'    'new-strike'        live updates
     'lightning-delay'    'get-window'        on-demand viewport query
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
Frontend draws this as a dashed rectangle on the map using an SVG renderer (`L.svg({ padding: 5 })`) — the SVG renderer keeps the rectangle crisp without repainting on every pan.

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
| `strikes:data` | Hash (id → JSON) | Full strike payload including `receivedAt` |

TTL: 10 minutes. `pruneOld()` runs every 30s via `setInterval`.

### New file: `backend/socket/blitzortung.js`

Responsibilities:
- Open WSS to `wss://live2.lightningmaps.org/` — `live2` deduplicates server-side; `live` sends each bolt twice with different IDs; both have identical geographic coverage
- Handle auth challenge-response: server sends `k` → client sends `(k*3604)%7081 * Date.now()/100`; requires `Origin: https://www.lightningmaps.org` header
- On first message: read `port` field; use it for subsequent reconnects (currently `8086`)
- `wssNextPort` resets to 443 on every disconnect — prevents getting stuck on a stale port if the server changes (lightningmaps.org changed 8085 → 8086)
- Dedup incoming strikes by `${time}:${lat.toFixed(4)}:${lon.toFixed(4)}` (Map, 150s TTL, cleaned every 30s) — same key as frontend; guards against reconnect replays
- Server `reload` message: `ws.removeAllListeners('close')` before `ws.close()` — prevents race where both the reload handler and the close event schedule a reconnect simultaneously
- Filter to BOUNDS; capture `receivedAt = Date.now()` at WSS message time
- Store in Redis via `addStrike({ lat, lon, timeMs, pol, receivedAt })`, emit `new-strike` to all Socket.IO clients
- Auto-reconnect after 5s on close; `isNew: true` only on live strikes, not reconnect replay
- Every 500ms: `redis.zcount('strikes:time', now-30s, '+inf')` → emit `lightning-index` to all clients
- Every 1s: `getDelayStats()` → emit `lightning-delay: { avg, min, max, samples }` to all clients
- ntfy.sh optional alerts: Haversine distance check per strike; POST to topic when within `radius_km` of home and cooldown elapsed

### Delay stats — `getDelayStats()`

Queries Redis for strikes in the last 60s (by `timeMs` score), loads their JSON, computes `receivedAt - timeMs` for each. Both timestamps come from the backend clock, so there is no NTP dependency on blitzortung.org servers.

```js
async function getDelayStats() {
    const ids = await redis.zrangebyscore('strikes:time', Date.now() - 60_000, '+inf');
    if (!ids.length) return null;
    const raw  = await redis.hmget('strikes:data', ...ids);
    const vals = raw.filter(Boolean).map(JSON.parse).filter(s => s.receivedAt)
                    .map(s => s.receivedAt - s.timeMs);
    if (!vals.length) return null;
    return {
        avg:     Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
        min:     Math.min(...vals),
        max:     Math.max(...vals),
        samples: vals.length,
    };
}
```

Typical values: avg ~2000ms (lightningmaps.org consolidation delay + network).

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
├── lightning.module.ts         — imports CommonModule, TooltipModule
├── lightning-routing.module.ts
└── lightning.component.ts / .html / .css
```

Route: `/#/lightning`, topbar label: **Bliksem**, icon: `pi-bolt` (or `⚡`).

### New service: `LightningService`

Service owns the socket lifecycle. All listeners are set up once in the constructor. On every `connect` (first connect + reconnects) it auto-requests the initial list. Exposes plain Subjects / BehaviorSubjects for the component to subscribe to.

```typescript
@Injectable({ providedIn: 'root' })
export class LightningService implements OnDestroy {
    private socket: Socket;
    readonly initialList$     = new Subject<Strike[]>();
    readonly newStrike$       = new Subject<Strike>();
    readonly lightningIndex$  = new BehaviorSubject<number>(0);
    readonly lightningDelay$  = new BehaviorSubject<{ avg: number; min: number; max: number; samples: number } | null>(null);
    readonly socketReconnect$ = new Subject<void>();

    constructor() {
        this.socket = io(environment.wsUrl, { transports: ['websocket'] });
        this.socket.on('connect',         () => this.requestInitialList());
        this.socket.on('initial-list',    (list: Strike[]) => this.initialList$.next(list));
        this.socket.on('new-strike',      (s: Strike)      => this.newStrike$.next(s));
        this.socket.on('lightning-index', (n: number)      => this.lightningIndex$.next(n));
        this.socket.on('lightning-delay', (s: any)         => this.lightningDelay$.next(s));
        this.socket.io.on('reconnect',    ()               => this.socketReconnect$.next());
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
- Tile layers: OSM street map + Esri World Imagery satellite (toggled via "Satelliet" button in the zoom pill)
- Detection bounds: `L.rectangle([[40.0, -12.0], [59.0, 30.0]])` — dashed blue, 4% fill; rendered via `L.svg({ padding: 5 })` to prevent flash on pan
- Canvas renderer (`L.canvas({ padding: 0.5 })`) for bolt markers — all bolts share a single canvas element

**Satellite toggle**:
- `toggleSatellite()` removes the active tile layer and adds the other; `showSatellite: boolean` drives the button active state
- Esri World Imagery URL: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` — free, no API key

**Component lifecycle — `ngAfterViewInit`**:
1. `initMap()` — creates Leaflet map, canvas renderer, SVG renderer, both tile layers, detection rectangle
2. Subscribe to `svc.initialList$` — on each emission: `clearAllStrikes()`, render list, subscribe to `svc.newStrike$` (guarded by `liveSubscribed` flag so only once)
3. Subscribe to `svc.lightningDelay$` — stores full `{ avg, min, max, samples }` in `delayStats`
4. Subscribe to `svc.socketReconnect$` — calls `requestInitialList()` on each Manager-level reconnect
5. Subscribe to `router.events` filtered to `NavigationEnd` on `'lightning'` URL, `skip(1)` — after 50ms calls `map.invalidateSize()` + `requestInitialList()` (navigate-back fix)
6. If already connected: `svc.requestInitialList()` (handles second-visit case where `connect` won't fire)

**Strike lifecycle — `flashStrike(strike, updateDisplay)`**:
1. Dedup check via `strikeKeys: Set<string>` (key = `timeMs:lat(4dp):lon(4dp)`)
2. Compute `remainingMs = RING_DURATION_MS - (Date.now() - strike.timeMs)`
3. `isLive = remainingMs > 0` → yellow bolt (`STYLE_ACTIVE`) + `styleTimer`; if also `strike.isNew`: triple flash — white(0ms) → yellow(150ms) → white(200ms) → yellow(350ms) → white(400ms) → yellow(550ms, stays) via 5 chained `setTimeout` calls
4. `isLive = false` → grey bolt immediately (strikes older than `RING_DURATION_MS = 30s`)
5. `styleTimer` fires at `remainingMs`: flips `entry.isLive = false`, switches to grey, calls `updateCounts()`
6. Fade interval (every 10s): opacity fade based on age, removes at 10min

**Ring lifecycle**:
- `startRing(entry)`: creates `L.circle` + `setInterval` stored on `entry.ring`; start radius = correct position for strikes already in progress
- `stopRing(entry)`: clears interval, removes circle, nulls `entry.ring`
- `refreshRings()`: called on `zoomend` — zoom ≥10 starts rings for all still-live entries; zoom <10 stops all rings

**Counter chips** (in the floating pill, top-left):
- `totalCount / viewportTotalCount` — all strikes in 10min window, total and visible in viewport
- `activeCount / viewportCount` — yellow (live, within 30s) strikes, total and in viewport
- `avgDelayMs` — getter over `delayStats?.avg`; delay chip has `pTooltip` showing `gem: Xms | min: Xms | max: Xms (N)`

**Strike markers** — canvas-rendered bolt shape (`boltMarker()` factory):

| Style | Fill | Stroke | Radius | Duration |
|---|---|---|---|---|
| `STYLE_FLASH`  | `#ffffff` white  | `#ffffff` white | 13px | triple flash on arrival (at 0/200/400ms white; 150/350/550ms yellow) |
| `STYLE_ACTIVE` | `#facc15` yellow | `#ef4444` red   | 10px | until `styleTimer` fires (30s)  |
| `STYLE_OLD`    | `#e5e7eb` grey   | `#000000` black |  7px | until fade-out at 10min |

**Thunder ring** (only when `map.getZoom() >= 10`):
- Speed: 343 m/s, max radius: 10km, step interval: 200ms
- `L.circle`, yellow `#ffff00`, weight 3, opacity fading from 1.0 → 0

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

## Known Issues / Gotchas

- **Auth challenge-response is mandatory** — without spoofing `Origin: https://www.lightningmaps.org`, the WSS handshake is rejected.
- **Port redirect** — server sends a `port` field on first message; subsequent reconnects use it (`wssNextPort`). Reset to 443 on every disconnect — lightningmaps.org changed 8085 → 8086 once already.
- **Reconnect replay** — on WSS reconnect, server replays recent strikes. `isNew: false` for these; dedup cache catches them.
- **Tab-background burst** — Socket.IO queues messages while tab is hidden. `remainingMs` check before drawing ring or setting active bolt prevents stale strikes from animating.
- **`app.listen` → `server.listen`** — required for Socket.IO to share the HTTP server.
- **Double backend in local dev** — Docker `bbqweer-nodejs` + local `node app.js` both write to Redis. Stop the Docker container when running locally.
- **NTP sync on local dev** — delay calculation uses `receivedAt - timeMs` (both from backend clock). If the host clock is unsynchronized, delay values will be wrong. Run `w32tm /resync` on Windows if seeing anomalous values.

---

## Key implementation notes

### Delay calculation — why `receivedAt - timeMs`
`receivedAt = Date.now()` is captured at WSS message time in the backend. `timeMs` is the actual strike timestamp (from blitzortung.org, in milliseconds). Both values come from our own backend clock — there is no cross-machine NTP dependency. Typical delay is ~2000ms (lightningmaps.org consolidation + network). Replay strikes on reconnect are filtered by the 60s Redis window in `getDelayStats()`.

### SVG renderer for detection bounds
The detection bounds rectangle uses `renderer: L.svg({ padding: 5 })` (not the default canvas). SVG vector layers are not re-rasterized on pan — they transform with the map's CSS transform layer, so no flash or artifact on move.

### Satellite layer toggle
Two `L.tileLayer` instances created in `initMap()`. `toggleSatellite()` removes the active one and adds the other. Both layers persist in memory; only one is added to the map at a time. The Leaflet attribution updates automatically.

### Thunder ring start radius (tab-background fix)
When the tab is in the background, Socket.IO queues messages. On focus, multiple strikes arrive at once — some potentially 20s old. `remainingMs = RING_DURATION_MS - (Date.now() - strike.timeMs)` is computed before drawing; if ≤ 0, the strike becomes a grey bolt immediately. If > 0, the ring starts at the correct radius (`startRadius = elapsed_s * 343`) so it does not jump back to zero.

### isNew flag
The backend emits `{ ...strike, isNew: true }` for live strikes only. The Redis `initial-list` reply has no `isNew` flag — historical strikes on connect become grey bolts without rings.

### Initial list is client-driven, not auto-pushed
`LightningService` (root-scoped, socket survives navigation) sets up all listeners once in its constructor and auto-requests `get-initial-list` on every `connect`. The component subscribes in `ngAfterViewInit` after `initMap()`, then calls `svc.requestInitialList()` if already connected (second-visit case). Existing markers are cleared before rendering a new `initial-list`.

### Lightning index badge ≈ activeCount
`RING_DURATION_MS = 30_000ms`. The backend uses a 30s Redis window (`zcount now-30s`). Propagation delay is ~2s, so both Redis and the frontend count the same 30s window — badge ≈ activeCount in steady state.

Historical 2× mismatch root cause: `live.lightningmaps.org` sends each physical bolt **twice** with consecutive IDs (return-stroke duplicates). `live2.lightningmaps.org` deduplicates server-side; both have identical geographic coverage. Switched to `live2` only. Backend dedup (by `time:lat:lon`, 150s TTL) remains as a safety net for reconnect replays.

### ntfy.sh push alerts — config
Add to `backend/config.ini` (and `config.local.ini` for local testing):
```ini
[ntfy]
url          = https://ntfy.sh/your-secret-topic
home_lat     = 52.0000
home_lon     = 5.0000
radius_km    = 30
cooldown_min = 5
```
Install the ntfy iOS/Android app and subscribe to the same topic. If the section is absent, alerts are silently disabled — no crash.

### Triple flash on new strike
New live strikes flash white → yellow three times over 550ms. The marker starts as `STYLE_FLASH` (white, r=13) at t=0, then 5 `setTimeout` calls alternate between `STYLE_ACTIVE` (yellow) and `STYLE_FLASH` (white) at 150/200/350/400/550ms. The last call at 550ms sets `STYLE_ACTIVE` and the marker stays yellow. The `styleTimer` that transitions to grey runs independently at `remainingMs` — these flash timers finish long before that.

### Navigate-back fix
When the user navigates away from `/lightning` and returns, `ngAfterViewInit` does not re-run (the component is reused or re-created but the `setTimeout` init runs once). However, the Leaflet map container can have incorrect size after being hidden and re-shown. The `Router` + `NavigationEnd` subscription (with `skip(1)` to ignore the initial navigation) detects each return and calls `map.invalidateSize()` + `requestInitialList()` after a 50ms delay — enough time for the container to be laid out.

### Reconnect fix — Manager vs socket `reconnect`
`socket.on('connect', ...)` fires on every successful socket-level connect (initial + reconnect). However, there can be edge cases where the socket reconnects but the `connect` event timing means the component doesn't trigger a fresh `initialList$` subscription. The `socket.io.on('reconnect', ...)` listener (Manager level, not socket level) fires after successful transport-layer reconnection — `socketReconnect$ Subject<void>` in the service propagates it to the component, which calls `requestInitialList()`. Both paths (`connect` and `reconnect`) call `requestInitialList()`, providing redundancy.

### LightningService instantiated at app startup (not just on lightning page)
`LightningService` is `providedIn: 'root'`. The topbar injects it to show the lightning index badge — the Socket.IO connection opens on app load, not just when navigating to `/lightning`.

---

## Out of scope

- MQTT (disabled in PoC due to poor broker performance — WSS only, permanently)
- Historical storage beyond 10min TTL
- Phase 2: own Blitzortung detection station
- Room-based Socket.IO subscriptions per GPS window (broadcast is fine at this scale)
