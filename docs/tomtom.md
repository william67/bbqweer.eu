# TomTom Traffic Incident Details

Status: live in the `file-alerts` page. Read-only display so far — the
alerting/notification loop (push to ntfy) is designed below but not built yet.

## Why TomTom (NDW was tried and removed)

An earlier version of this feature used NDW open data (~20,500 fixed physical
sensors — induction loops, radar, cameras) to compute a live speed per drawn
area. It was removed: NDW only covers roads with physical sensors, so several
points the user actually cared about had no coverage at all, and NDW has no
concept of a discrete "incident" — every speed reading needed a threshold we
picked ourselves to decide "is this a jam". All NDW backend/frontend code
(`ndw.helper.js`, `ndw.route.js`, `ndw.service.ts`, the "Meetpunten tonen"
toggle, the turf.js point-in-polygon matching) has been deleted.

TomTom's **Incident Details** API is a different kind of data: discrete
traffic *events* (jams, accidents, closures, roadworks), probe/GPS-based (like
Waze/Google), with much broader road coverage than fixed sensors — and a
`categoryFilter` that includes `Jam` directly, i.e. TomTom already decides
"this is a jam" instead of us inferring it from a speed number.

## Product landscape (researched, for future reference)

TomTom's docs are fragmented across an old and new platform — worth knowing so
future searches don't get confused between them:

- **"TomTom Maps" (`tomtom-maps`), Traffic API v5** — the version this
  integration uses. Stable, not deprecated.
- **TomTom Orbis Maps (v1/v2)** — TomTom's newer platform, currently in
  **Public Preview**. Has a similar Incident Details endpoint but a different
  request shape (`TomTom-Api-Key` as a header instead of `key` in the URL,
  `fields` via headers instead of query params). Not used here — only relevant
  if TomTom deprecates v5 later.
- **Traffic Stats API** — a separate product for *historical* traffic analysis
  (average speeds over time, area analysis with size limits), not live data.
  Not relevant to real-time alerting.
- **Flow Segment Data** — single-point current-speed lookup. No bbox support.
  Not used here.

## The endpoint

`GET https://api.tomtom.com/traffic/services/5/incidentDetails`

Key facts confirmed from TomTom's own docs and from testing:
- **`versionNumber: 5`** in the URL path — this is the "v5" API.
- **`bbox` parameter**: `minLon,minLat,maxLon,maxLat`. **Max bbox area: 10,000 km²**
  (i.e. roughly 100km × 100km) — confirmed directly from the docs page, and by
  hitting the limit for real (a viewport-derived bbox at low zoom easily
  exceeds it — see "Fixed query area" below).
- **`fields`**: mandatory nested field-selection syntax (not a flat list) —
  see `FIELDS` in `backend/helpers/tomtom.helper.js`. Includes `id` — a
  stable per-incident identifier that persists across polls (needed for
  frontend upsert, see below).
- **`categoryFilter`**: comma-separated, e.g. `Accident,Jam,RoadClosed`.
- **`key`**: API key as a query param (this is the v5 way; Orbis uses a header
  instead, see above).
- Free tier quota: **not confirmed**. TomTom's pricing pages gave inconsistent
  numbers across fetches (2,500/day non-tile vs 20,000/month for Flow API
  specifically) — verify directly at
  [docs.tomtom.com/pricing](https://docs.tomtom.com/pricing) before relying on
  a specific number for capacity planning. The 2-minute backend cache (below)
  keeps actual usage low regardless.

## Fixed query area

TomTom's bbox is capped at 10,000km², but the Leaflet map's viewport can
easily exceed that when zoomed out — hit this for real (`400 Bad Request`,
`"Area of 'bbox' parameter is larger than 10,000km2."`) when the map was
panned/zoomed out to a Western-Europe-sized view. Fix: both the backend cache
and the frontend map center/highlight use a **fixed** bbox instead of the
live viewport — Rotterdam, Den Haag, Delft, and the Maasvlakte
(`minLat: 51.80, maxLat: 52.15, minLng: 3.90, maxLng: 4.80`, ~2400km²),
defined in `TOMTOM_BBOX` in both `backend/helpers/tomtom.helper.js` and
`frontend/src/app/pages/file-alerts/file-alerts.component.ts` (keep these two
in sync if changed). The map opens centered on this area at zoom 11, with a
dashed rectangle outline (same style as the lightning page's detection-bounds
box) always visible showing exactly what's being queried.

Per-area querying (deriving the bbox from a specific drawn `file_areas`
polygon instead of one fixed region) is a natural next step once there's more
than one region of interest — not built yet.

## Backend implementation

**`backend/helpers/tomtom.helper.js`** — self-refreshing in-memory cache, same
shape as the old `ndw.helper.js` was: fetches the incident list for
`TOMTOM_BBOX` once on startup, then every 2 minutes via `setInterval`
(independent of `config.local.ini` — this is just an in-memory cache, not a
DB write, so it runs in local dev too). Exposes `getIncidents()` with a
cold-start readiness gate (`whenReady()`), so the very first request after
startup waits for the first fetch instead of getting an empty result.

**`backend/routes/tomtom.route.js`** — thin pass-through,
`GET /api/tomtom/incidents`, **public** (no auth). Serves straight from the
helper's cache — never calls TomTom itself, so repeated requests (multiple
tabs, anonymous visitors, the frontend's own refresh timer) cost nothing
extra, which is exactly why it's safe to leave unauthenticated.
`file-areas` GET (`/`, `/:id/incidents`) is also unauthenticated at the
backend level for the same reason — but unlike TomTom incidents, the
**frontend deliberately never calls it for anonymous visitors** (see
"Frontend implementation" below): areas are backend-public but UI-gated,
a conscious choice (see `CLAUDE.md`'s Pages/Nav entry). Only the write
endpoints (`POST`/`PUT`/`DELETE` on `file-areas`) require login at the
backend too.

Reads `api_key` from `[tomtom]` in `config.local.ini` / `config.ini` (same
`config.local.ini`-if-present-else-`config.ini` pattern as the MySQL pool
helper). **The key itself is never committed** — both config files are
gitignored; only the empty `[tomtom]\napi_key =` scaffold is tracked.

## Frontend implementation

`frontend/src/app/pages/file-alerts/file-alerts.component.ts` — always on, no
toggle button (removed; incidents load automatically with the map for
**everyone**, unlike the areas layer, which only loads for logged-in users —
see "Auth model" below):
- Fetches once on map init, then every 2 minutes (`TOMTOM_REFRESH_MS`,
  matching the backend cache's own cadence — polling faster would just
  re-fetch identical cached data).
- **Upserts** rather than clear-and-redraw: `tomtomIncidents`/`tomtomLayers`
  Maps keyed by `properties.id`. New incidents get added; incidents no longer
  returned get removed; incidents still present get their style/tooltip
  updated **in place** via `.setStyle()`/`.bindTooltip()` on the existing
  `L.geoJSON` layer — never removed and re-added, so no flash on refresh.
- Each incident's `geometry` (`LineString`) renders directly via Leaflet's
  `L.geoJSON()`, color-coded by `iconCategory` (red = Jam/Accident, orange =
  RoadWorks, grey = Closed/LaneClosed), with a sticky tooltip showing
  category, all event descriptions, delay/severity, length, road numbers,
  validity, and start/end times.

## Auth model

- **TomTom incidents**: fully public. Map, tiles, and the incidents layer
  all render for anonymous visitors.
- **Areas** (`file_areas`): backend GET is unauthenticated (see above), but
  the frontend deliberately never fetches or renders them for logged-out
  visitors — the "Gebieden" button, the areas list dialog, the incidentCount
  drill-down dialog, and the drawn polygons themselves are all hidden.
  Write endpoints (create/edit/reshape/delete) require login at the backend
  too, not just the UI.
- **Reactive, no page reload needed**: `file-alerts.component.ts` subscribes
  to `authService.authChanged$` (fires on login/logout).
  On login: `loadAreas()` runs immediately, drawing the areas layer.
  On logout: removes all area polygons from the map, closes the areas list
  and incidentCount dialogs if open, cancels an in-progress draw/reshape,
  and stops the 15s areas-list poll timer (`onAuthChanged()`).
- This was a deliberate reversal — an earlier version of this session made
  areas fully public too (matching TomTom incidents), then reverted to
  login-only after testing, while keeping TomTom incidents public.

## What the real response looks like

```json
{
  "incidents": [
    {
      "type": "Feature",
      "properties": {
        "id": "...",
        "iconCategory": 8,
        "magnitudeOfDelay": 4,
        "startTime": "2026-06-29T05:10:00Z",
        "endTime": "2026-07-10T14:00:00Z",
        "from": "Pasteursingel / Grieksestraat",
        "to": "Rotterdam",
        "length": 87.35,
        "delay": null,
        "roadNumbers": [],
        "timeValidity": "present",
        "events": [
          { "code": 401, "description": "Afgesloten", "iconCategory": 8 },
          { "code": 701, "description": "Wegwerkzaamheden", "iconCategory": 9 }
        ]
      },
      "geometry": { "type": "LineString", "coordinates": [[4.42, 51.91], "..."] }
    }
  ]
}
```

Notable fields: `from`/`to` are human-readable street names (in `nl-NL`, since
we passed `language=nl-NL`), `geometry` is a `LineString` along the affected
road (not a point), `events` is an array (a single incident can carry multiple
event codes, e.g. a closure *and* roadworks together), `delay` was `null` in
every result seen so far.

## `iconCategory` reference

Confirmed from TomTom's docs:

| Code | Category |
|---|---|
| 0 | Unknown |
| 1 | Accident |
| 2 | Fog |
| 3 | DangerousConditions |
| 4 | Rain |
| 5 | Ice |
| **6** | **Jam** |
| 7 | LaneClosed |
| 8 | RoadClosed |
| 9 | RoadWorks |
| 10 | Wind |
| 11 | Flooding |
| 14 | BrokenDownVehicle |

A **Jam** (`iconCategory: 6`) is TomTom's classification for genuine traffic
congestion — vehicles moving significantly slower than free-flow, sustained
enough to be flagged as an incident (as opposed to a momentary speed dip).
Comes with a `delay` (extra travel time) and `magnitudeOfDelay` severity:
0=Unknown, 1=Minor, 2=Moderate, 3=Major, 4=Indefinite. Every `RoadClosed`
result seen so far had `magnitudeOfDelay: 4` ("Indefinite") — makes sense for
a closure, which doesn't have a measurable delay the way a jam does. TomTom's
docs don't explicitly state the Jam detection mechanism (probe/GPS-based is
the reasonable inference given how the rest of their traffic product works,
but this isn't confirmed from their documentation).

### Finding: `RoadClosed` is mostly noise for alerting purposes

**253 of 258 incidents** in an early test bbox were `401 Afgesloten`
(`RoadClosed`), many with `endTime: null` (i.e. standing/indefinite). This is
very likely Rotterdam's many permanent car-access restrictions (bollards,
pedestrianized zones) rather than genuine incidents. Confirmed with a
follow-up test with **no** `categoryFilter` at all (every category included,
same bbox): 325 total incidents, still **zero `iconCategory: 6` (Jam) and
zero `iconCategory: 1` (Accident)** — not a filtering artifact, there was
genuinely no active jam or accident anywhere in that ~50km-wide area at test
time (evening, 2026-07-02).

**Full unfiltered breakdown** (325 incidents, same bbox, no `categoryFilter`):

| Events | Count |
|---|---|
| 401 Afgesloten (closure) only | 217 |
| 401 Afgesloten + 701 Wegwerkzaamheden | 39 |
| 701 Wegwerkzaamheden (roadworks) only | 34 |
| 701 + 810 (traffic situation changed due to roadworks) | 9 |
| 852 Invoegend werkverkeer (merging construction traffic) | 7 |
| 61/901 Obstakel op de weg (obstacle), some + lane closed | 10 |
| 24/25 Brug/Tunnel gesloten (bridge/tunnel closed) | 6 |
| 500/641 Rijstrook afgesloten (lane closed) | 3 |

**Before building the alerting task below**: re-test during a known-congested
period (weekday rush hour) to actually see `Jam`/`Accident` data — everything
tested so far happened to have none. Decide whether `RoadClosed` is worth
keeping for alerting at all, and if so, whether to filter by `endTime`
(exclude indefinite/standing closures) to cut the noise.

## Per-area incident count (built)

`backend/tasks/file-area-incidents.js` — a proper background task (not a
self-contained helper like `tomtom.helper.js`/used to be `ndw.helper.js`),
following the `satellites-sync.js` pattern: `taskStart`/`taskProgress`/
`taskError`/`taskFinish` integration, visible in the Taakstatus dialog.

- Registered in `backend/app.js` via `cron.schedule('*/15 * * * * *', ...)` —
  `node-cron` supports an optional leading seconds field (6 fields instead of
  5), confirmed with `cron.validate()`, so this stays a real cron schedule
  rather than a raw `setInterval`. Also called once immediately on boot (so
  the count isn't empty for the first 15s). Recomputing every 15s only costs
  a cheap DB read + in-memory turf checks — it does **not** make the TomTom
  cache refresh any faster (that's still every 2 minutes, see above); it just
  means a newly drawn/edited area's count shows up within 15s instead of
  waiting up to the old 2-minute cadence. **Deliberately outside** the `if
  (!fs.existsSync('config.local.ini'))` block that disables the other sync
  tasks locally — this task only reads (DB + the already-cached TomTom
  incidents), never writes or calls an external API itself, and the frontend
  needs live counts to test against locally. Same reasoning as why the
  TomTom/NDW helpers weren't gated either.
- Every run: loads all active `file_areas` (+ points) from the DB, reads
  `tomtom.getIncidents()`'s current cache, and for each area counts how many
  incidents' `geometry` (`LineString`) intersects that area's polygon —
  using `@turf/boolean-intersects` (reinstalled; `@turf/boolean-point-in-polygon`
  from the old NDW code was point-only and not reusable for this). Result
  goes into an in-memory `Map<areaId, count>`, exposed via
  `getIncidentCounts()`.
- **All categories count** (`Accident`, `Jam`, `RoadClosed` — matching
  `tomtom.helper.js`'s current `categoryFilter`), not just Jam/Accident — a
  deliberate choice, even though the `RoadClosed` noise finding above means
  this number will often be dominated by permanent closures rather than real
  jams. Revisit if/when the actual alerting task (below) needs a
  jam-specific count instead.
- `backend/routes/file-areas.route.js`'s `GET /` reads this cache and adds
  an `incidentCount` field to each area in the response — computed
  entirely in the background, not per-request. Shown as a "Filemeldingen"
  column in the Gebieden list (`file-alerts.component.html`).
- Seed row `('file-area-incidents', 0, 'idle')` in
  `database/init/05-server-tasks.sql`.
- The Gebieden list dialog polls `GET /api/file-areas` every 15s
  (`AREAS_LIST_REFRESH_MS`, matching this task's own cadence) **while open**
  — `refreshAreasList()` in `file-alerts.component.ts` only updates the
  `allAreas` array feeding the list table, deliberately not touching the
  map's polygon layers, so there's no flash on the map while the count
  updates in the background. Stops polling when the dialog closes
  (`clearInterval` in `showAreasListDialog()` and `ngOnDestroy`).

### Note: count is per-incident-entry, not per real-world event

TomTom often represents one real-world closure/incident as **two separate
incident entries**, one per direction — same `TTI-...` prefix in
`properties.id`, different `TTR...` suffix per direction, e.g.:
```
TTI-54b3e1b4-...-TTR36494838852070000  Vleerdamsedijk -> Heerzijnweg
TTI-54b3e1b4-...-TTR36494838780070000  Heerzijnweg -> Vleerdamsedijk
```
`getIncidentCounts()`/`getMatchingIncidents()` count/list these as **two**,
since the count simply reflects how many incident objects intersect the
polygon, not deduplicated real-world events. Not currently deduped — would
need grouping by the `TTI-...` prefix of `properties.id` if an exact
real-world-event count is ever needed.

## Per-area incident detail (built)

Clicking the "Filemeldingen" count in the Gebieden list opens a modal
(`areaIncidentsDialogVisible` in `file-alerts.component.ts`) showing a small
table of the actual matching incidents for that area — category, van→naar,
beschrijving, vertraging — with a "Terug" button that just closes the modal
(the Gebieden list dialog stays open underneath).

- **`getMatchingIncidents(areaId)`** in `backend/tasks/file-area-incidents.js`
  — shares the same `buildPolygon()`/`matchIncidents()` helpers as the
  background count computation, but runs **on-demand per call**, not cached.
  Deliberate: this is a rarely-clicked detail view, unlike the always-visible
  count column, so there's no value in permanently holding the full incident
  list for every area in memory.
- **`GET /api/file-areas/:id/incidents`** — public, same reasoning as the
  other `file-areas`/`tomtom` GET endpoints (reads already-cached TomTom
  data, costs no extra API quota).
- `FileAreasService.getAreaIncidents(id)` on the frontend, calling
  `showAreaIncidents(area)` on click.

## Alerting design (not built yet)

Ported from the earlier NDW-based plan (`plans/ndw-data.md`, now deleted —
its data source is gone, but this part of the design still applies, reframed
around TomTom incident IDs instead of a speed-threshold state machine).

**Goal**: notify (push to ntfy) when a `Jam`/`Accident` incident newly
appears inside a drawn area — the piece still missing after "Per-area
incident count" above, which only *counts* incidents, doesn't alert on them.

**Backend task** — `backend/tasks/tomtom-file-alert.js`, a separate task from
`file-area-incidents.js` above (that one just counts for display; this one
would decide when to notify). Could reuse the same per-area intersection
logic, filtered further to `iconCategory` 1 (Accident) or 6 (Jam) only — see
the `RoadClosed` noise finding above for why not to alert on closures/
roadworks by default.

**Dedup/state via Redis** — same `ioredis` client pattern as
`backend/socket/blitzortung.js:55-56` (host resolution based on
`config.local.ini` presence, same as the MySQL pool). Key per incident:
`tomtom:alert:<incident.properties.id>` — TomTom's own stable ID makes this
simpler than the old NDW design (no need for a manual ok/congested state
machine; presence/absence of the ID *is* the state):
- **Incident ID appears for the first time**: send notification, store the ID
  with `firstSeenAt`.
- **Incident ID still present, >20 min since last notification**: send a
  reminder, update `lastNotifiedAt`.
- **Incident ID no longer in the cached list**: send a "resolved"
  notification, clear the stored key.

**Sending the notification**:
```js
axios.post('https://ntfy.bbqweer.eu/filealerts', message, {
  headers: { Title: 'Filemelding', Priority: 'high', Tags: 'warning' },
});
```
Requires the self-hosted ntfy server to already be running and reachable.

**Task status integration** — same pattern as the other background tasks:
- `taskStart` / `taskProgress` / `taskError` / `taskFinish` from
  `backend/helpers/server-tasks.js`.
- Cron registration in `backend/app.js`, inside the existing
  `if (!fs.existsSync('config.local.ini'))` block alongside the other tasks:
  ```js
  const tomtomFileAlert = require('./tasks/tomtom-file-alert');
  cron.schedule('*/2 * * * *', () => {
      tomtomFileAlert().catch(err => console.error('tomtom-file-alert cron error:', err));
  });
  ```
- Seed row in `database/init/05-server-tasks.sql`:
  ```sql
  ('tomtom-file-alert', 0, 'idle')
  ```

**Verification**:
1. Dedup behavior: run the task twice in a row with a simulated ongoing
   incident — confirm the second run does not send a duplicate notification.
2. Task status dialog: confirm `tomtom-file-alert` shows up with
   running/success status after a cron run.
3. End-to-end: actually receive a test message on the ntfy app on the phone
   when a real (or manually injected) Jam/Accident incident appears.
