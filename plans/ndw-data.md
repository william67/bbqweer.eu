# NDW traffic jam detection + alerting (later, after `docs/ntfy-server.md`)

Status: design, not yet built. Build once the self-hosted ntfy server
(`docs/ntfy-server.md`) is running and tested.

## Goal

Backend task that monitors specific road segments for traffic jams via NDW
open data, and sends a push notification to the ntfy server when congestion
is detected.

## Important correction to the original proposal

The proposal assumed this would hook "1-to-1 into the existing
severity/dedup logic of the Node.js alert system (MQTT/Twilio/SendGrid)".
That system **does not exist anywhere** in `c:\Apps\` — not in bbqweer.eu,
not in fueltrack.eu (which does have MQTT, but only for IoT telemetry
ingestion, without Twilio/SendGrid/severity routing), not elsewhere. This is
therefore a **greenfield build**. What is reusable is the existing cron task
pattern and the `server-tasks` monitoring (see below).

## Out of scope

- SMS/e-mail/WhatsApp escalation (Twilio or otherwise) — not part of this
  design, not even mentioned as a separate future track.
- DB table + admin UI for road segment configuration — start with a
  hardcoded config array.
- Polygon/region-based monitoring — not needed as long as a fixed list of
  known measurement point IDs is used.

## Data source: NDW open data

Verified (July 2026) via `opendata.ndw.nu`:

- No API key or registration required.
- `trafficspeed.xml.gz` — DATEX II, gzip'd XML, refreshed every ~1-2 min.
  This is the right feed for congestion detection via speed-vs-threshold
  (more reliable than travel-time comparison, as the original proposal also
  noted).
- `traveltime.xml.gz` also exists (travel time per route) but is not needed
  for this approach.
- Measurement locations (coordinates/road number per measurement point ID)
  live in a separate shapefile (`ndw_avg_meetlocaties_shapefile.zip`) on the
  same portal — only needed to manually look up the right measurement point
  IDs for the desired road segments, once.

**Technical correction**: `adm-zip` (already present in
`backend/package.json`) is a ZIP archive library, not a gzip decompressor.
NDW's file is `.gz` (gzip), not `.zip`. Node's built-in `zlib.gunzipSync()`
is the right tool — no new dependency needed for this.

**New dependency**: add `fast-xml-parser` to `backend/package.json` to parse
the DATEX II XML payload.

## Configuration: road segments to monitor

`backend/config/ndw-segments.js` — hardcoded array:

```js
module.exports = [
  { id: '<NDW measurement point ID>', name: 'A15 Ridderkerk-Zuid → Barendrecht', freeFlowKmh: 100, thresholdRatio: 0.5 },
  // 2-4 segments to start with
];
```

The actual measurement point IDs need to be determined once, manually, by
inspecting `trafficspeed.xml.gz` (or the measurement locations shapefile)
and looking up the IDs for the desired road segments — that belongs to the
implementation step, not this design.

## Backend task

`backend/tasks/ndw-file-alert.js` — follows the exact pattern of
`backend/tasks/satellites-sync.js` (fetch → parse → process → task status):

1. `axios.get(url, { responseType: 'arraybuffer' })` to fetch
   `trafficspeed.xml.gz`.
2. `zlib.gunzipSync()` to decompress.
3. `fast-xml-parser` to parse.
4. Filter on the measurement point IDs from `ndw-segments.js`.
5. Per segment: `speed / freeFlowKmh < thresholdRatio` → "congested" status.

### Dedup/state via Redis

Same `ioredis` client pattern as `backend/socket/blitzortung.js:55-56` (host
resolution based on `config.local.ini` presence, same as the MySQL pool).
Key per segment: `ndw:alert:<id>`, hash `{state, since, lastNotifiedAt}`.

- **ok → congested**: send notification, save state.
- **congested → congested**, >20 min since last notification: send reminder.
- **congested → ok**: send "resolved" notification, clear state.

This prevents spam during a sustained jam (polling every 2 minutes without
dedup would send a new message on every poll).

### Sending the notification

```js
axios.post('https://ntfy.bbqweer.eu/filealerts', message, {
  headers: { Title: 'Traffic jam alert', Priority: 'high', Tags: 'warning' },
});
```

Requires the self-hosted ntfy server (`docs/ntfy-server.md`) to already be
running and reachable.

### Task status integration

Same pattern as the other background tasks:

- `taskStart` / `taskProgress` / `taskError` / `taskFinish` from
  `backend/helpers/server-tasks.js` (see the calls in
  `backend/tasks/satellites-sync.js:71-84`).
- Cron registration in `backend/app.js`, inside the existing
  `if (!fs.existsSync('config.local.ini'))` block alongside the other tasks
  (lines 63-79):
  ```js
  const ndwFileAlert = require('./tasks/ndw-file-alert');
  cron.schedule('*/2 * * * *', () => {
      ndwFileAlert().catch(err => console.error('ndw-file-alert cron error:', err));
  });
  ```
- Seed row in `database/init/05-server-tasks.sql`:
  ```sql
  ('ndw-file-alert', 0, 'idle')
  ```

## Verification

1. Standalone test script (or Node REPL) that fetches `trafficspeed.xml.gz`,
   decompresses, parses, and filters out the configured measurement point
   IDs — confirm the structure/fields are correct before the task is built.
2. Dedup behavior: run the task twice in a row with a simulated "congested"
   state — confirm the second run does not send a new notification.
3. Task status dialog: confirm `ndw-file-alert` shows up with
   running/success status after a cron run.
4. End-to-end: actually receive a test message on the ntfy app on the phone.
