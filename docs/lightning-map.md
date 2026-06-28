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
- [x] `StrikeOverlay` — two-canvas overlay (grey + live) replaces per-strike Leaflet markers; `NgZone.runOutsideAngular` for all timers; `addToGrey()` incremental paint on live→grey transition
- [x] Age-as-pure-function — no per-strike `styleTimer` setTimeouts; phase computed from `now - entry.timeMs` each frame; `_liveKeys` set detects transitions; active count recomputed from map each frame
- [x] RAF loop — live canvas driven by `requestAnimationFrame` instead of `setInterval(100ms)`
- [x] Playback timestamp chip — `lastMs` in `lightning-index`, shown in counter pill as `HH:MM:SS` / `DD-MM HH:MM:SS` with "laatste" label
- [x] `tests/playbackWss.js --from` — seek into recording + prefill Redis with 10-min window; `prefill-done` signal triggers frontend `initial-list` reload

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

### Blitzortung WSS message format

Each WebSocket message is a JSON object. Only messages with a `strokes` array contain strike data — one message = one batch:

```json
{
  "time": 1782596346,
  "strokes": [
    { "time": 1782596335629, "lat": 49.88, "lon": 3.15, "id": 20402660, "del": 1867, "dev": 3081, "src": 2, "srv": 1 },
    { "time": 1782596335621, "lat": 52.69, "lon": 5.09, "id": 20402661, "del": 1875, "dev": 12444, ... },
    ...
  ]
}
```

- `batch.time` — seconds (Unix epoch), when the server assembled the batch. **Low resolution — multiple batches can share the same second.**
- `stroke.time` — milliseconds (Unix epoch), when the lightning actually occurred. Use this for precise relative timing.
- `stroke.del` — Blitzortung's own delivery delay in ms from strike to their server (typically ~1800ms). Not used by bbqweer — we compute our own end-to-end delay.
- `stroke.id` — globally unique numeric ID per stroke. Used as Redis key (`strikes:time`, `strikes:geo`, `strikes:data`).

### Delivery characteristics (measured from 8h recording, 233,935 strokes)

| Metric | Value |
|---|---|
| Typical batch size | 1–5 strokes |
| Max batch size | ≤20 strokes (normal), up to 100+ on initial connect |
| Delivery delay avg | ~2100ms |
| Delivery delay p99 | ~2750ms |
| Delivery delay max | ~57s (catch-up burst after reconnect) |

**Initial connect catch-up**: on first WSS connection the server flushes a backlog — the first 1–2 messages can contain 70–100 strokes covering the last several seconds. After that, all batches are ≤20 strokes for the duration of the session.


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
    readonly lightningIndex$  = new BehaviorSubject<{ active: number; total: number; lastMs: number | null; fromMs: number | null } | null>(null);
    readonly lightningDelay$  = new BehaviorSubject<{ avg: number; min: number; max: number; samples: number } | null>(null);
    readonly socketReconnect$ = new Subject<void>();
    readonly prefillDone$     = new Subject<void>();

    constructor() {
        this.socket = io(environment.wsUrl, { transports: ['websocket'] });
        this.socket.on('connect',         () => this.requestInitialList());
        this.socket.on('initial-list',    (list: Strike[]) => this.initialList$.next(list));
        this.socket.on('new-strike',      (s: Strike)      => this.newStrike$.next(s));
        this.socket.on('lightning-index', (d: any)         => this.lightningIndex$.next(d));
        this.socket.on('lightning-delay', (s: any)         => this.lightningDelay$.next(s));
        this.socket.on('prefill-done',    ()               => this.prefillDone$.next());
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
- `StrikeOverlay` — two `<canvas>` elements in `overlayPane` (grey bottom, live top); see StrikeOverlay section below

**Satellite toggle**:
- `toggleSatellite()` removes the active tile layer and adds the other; `showSatellite: boolean` drives the button active state
- Esri World Imagery URL: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` — free, no API key

**Component lifecycle — `ngAfterViewInit`**:
1. `initMap()` — creates Leaflet map, SVG renderer, both tile layers, detection rectangle, `StrikeOverlay`
2. Subscribe to `svc.initialList$` — on each emission: `clearAllStrikes()`, render list, `overlay.redrawGrey()`, subscribe to `svc.newStrike$` (guarded by `liveSubscribed` flag so only once)
3. Subscribe to `svc.lightningDelay$` — stores full `{ avg, min, max, samples }` in `delayStats`
4. Subscribe to `svc.socketReconnect$` — calls `requestInitialList()` on each Manager-level reconnect
5. Subscribe to `svc.prefillDone$` — calls `requestInitialList()` when playback prefill completes
6. Subscribe to `router.events` filtered to `NavigationEnd` on `'lightning'` URL, `skip(1)` — after 50ms calls `map.invalidateSize()` + `requestInitialList()` (navigate-back fix)
7. If already connected: `svc.requestInitialList()` (handles second-visit case where `connect` won't fire)
8. `requestAnimationFrame` loop and `fade` setInterval (10s) started via `ngZone.runOutsideAngular()`

**Strike lifecycle — `flashStrike(strike)`**:
1. Dedup check via `strikeMap.has(key)` (key = `timeMs:lat(4dp):lon(4dp)`)
2. Entry added to `strikeMap` with `wasNew`, `flashStartMs`; no `isLive` field — phase computed from age each frame
3. If `strike.isNew`: `startRing(entry)` — sets `entry.hasRing = true` (zoom-independent; draw loop skips rings below zoom 11)
4. No per-strike timers — the RAF loop handles all phase transitions

**Age-as-pure-function (RAF loop)**:
- Live/grey boundary: `now - entry.timeMs < RING_DURATION_MS`
- `StrikeOverlay._liveKeys` — Set of keys that were live on the previous frame. Each `drawLive(strikes, now)` call: keys in `_liveKeys` no longer live → `_addToGrey()` (additive paint on grey canvas); then `_syncLiveKeys()` updates the set for next frame
- Active count: recomputed each frame by iterating `strikeMap` — no `_activeCount` field to maintain
- `fade()` every 10s: removes entries older than 10min, calls `overlay.redrawGrey()` if any removed

**StrikeOverlay — two-canvas rendering**:
- **Grey canvas** (bottom): draws `isLive=false` strikes. Redrawn only on pan/zoom end (`_reset()`) and `fade()`. `addToGrey(key, entry)` paints a single bolt additively without clearing — called on each live→grey transition so strikes appear on grey canvas immediately.
- **Live canvas** (top): drawn every RAF frame — strikes with `age < RING_DURATION_MS` + canvas ring arcs for entries with `hasRing=true`. Cost <1ms at realistic active strike counts.
- Layer coordinates + 300px padding (`CANVAS_PAD`): pan is a CSS transform, no mid-drag redraws.
- **`zoomAnimation: false`** on the Leaflet map: disables CSS zoom animation so the overlayPane is never CSS-scaled while our canvas holds old coordinates. `zoomend` fires instantly, `_reset()` redraws the canvas at the new zoom level with no visible blank or distortion.

| Canvas | Strikes drawn | Fill | Stroke | Size | Redraw trigger |
|---|---|---|---|---|---|
| Live (top) | age < 30s | `#facc15` yellow (or white during flash) | `#ef4444` red | 10px (13px flash) | every RAF frame |
| Live (top) | `hasRing=true`, zoom ≥ 11 | — | `#ffff00` yellow arc | 2–3px, fades | every RAF frame |
| Grey (bottom) | age ≥ 30s | `#e5e7eb` grey | `#000000` black | 7px | pan/zoom end, fade, transition |

**Flash sequence** (driven by `flashStartMs` in `tick()`): white at t<150ms, yellow 150–200ms, white 200–350ms, yellow 350–400ms, white 400–550ms, yellow 550ms+ (stays yellow).

**Ring lifecycle**:
- `startRing(entry)`: sets `entry.hasRing = true` for all new live strikes — no Leaflet layers created; zoom check is in the draw loop only so zooming in always shows rings for recently arrived strikes
- Radius, opacity, line width computed each RAF frame as pure functions of age: `radiusM = (now - timeMs) / 1000 * 343`, converted to canvas pixels via Web Mercator scale (`40075016 × cos(lat) / 2^(zoom+8)`)
- Ring stops rendering when `radiusM >= RING_MAX_M` (10km) — no explicit stop needed
- Hover: `map.on('mousemove')` hit-tests mouse distance vs each ring arc (threshold 8px); shows a floating `position:absolute` div with distance in km; `pointer-events:none`
- Zoom < 11: rings simply not drawn (canvas check each frame); no `refreshRings()` needed

**Counter chips** (in the floating pill, top-left):
- `totalCount / viewportTotalCount` — all strikes in 10min window, total and visible in viewport
- `activeCount / viewportCount` — yellow (live, within 30s) strikes, total and in viewport
- `avgDelayMs` — getter over `delayStats?.avg`; delay chip has `pTooltip` showing `gem: Xms | min: Xms | max: Xms (N)`
- `lastStrikeTime` — formatted timestamp of `lightning-index.lastMs` (origTimeMs of last strike, or live timeMs); shows `HH:MM:SS` if same day, `DD-MM HH:MM:SS` otherwise; hidden when null

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

## Playback tooling

`tests/captureWss.js` — captures the raw WSS stream to an `.ndjson` file (one JSON message per line). Run from `backend/` dir.

`tests/playbackWss.js` — replays a captured `.ndjson` file through Redis + pub/sub so the full frontend stack receives it as live strikes.

```
node tests/playbackWss.js <file.ndjson> [speed] [--clear] [--from <timestamp>]

  speed    : 1 = real-time (default), 5 = 5× faster, 0 = instant dump
  --clear  : flush all strikes from Redis before starting
  --from   : seek into the recording (UTC)
             HH:MM:SS             time only — uses date of first stroke
             YYYY-MM-DDTHH:MM:SS  full date+time, safe across midnight
```

**`--from` prefill behaviour**: when `--from` is set, the script first dumps all strokes from the 10-minute window before `--from` straight into Redis (no pub/sub, correctly aged by `timeMs = now - (fromMs - stroke.time)`). After the dump it publishes a `prefill-done` message on the `strikes:live` Redis channel. The backend detects this (`type === 'prefill-done'`) and emits a `prefill-done` Socket.IO event to all clients. The frontend's `prefillDone$` subscription calls `requestInitialList()` so the prefilled strikes appear as grey bolts on the map before playback begins.

**`lastMs` / `firstStrikeMs` in backend**: `blitzortung.js` tracks the `origTimeMs` of each strike (set by playback from `stroke.time`, falls back to `timeMs` for live). `lastStrikeMs` and `firstStrikeMs` are emitted with every `lightning-index` event as `lastMs` / `fromMs`. The frontend shows `lastMs` in the counter pill as `lastStrikeTime`. Both reset to 0 when Redis empties (`total === 0`).

**`PAUSE_WSS`**: set `pause_wss = true` under `[blitzortung]` in `config.local.ini` to stop the live WSS connection, leaving Redis free for isolated playback.

---

## Out of scope

- MQTT (disabled in PoC due to poor broker performance — WSS only, permanently)
- Historical storage beyond 10min TTL
- Phase 2: own Blitzortung detection station
- Room-based Socket.IO subscriptions per GPS window (broadcast is fine at this scale)
