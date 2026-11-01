# Regenradar (`/rainradar`): KNMI radar grids in MongoDB, drawn in the browser

Public page `/#/rainradar` (menu item "Regenradar", right after Weerkaarten). It shows the **real values** of the KNMI radar, not
colour pictures: **Precipitation** (mm/h, default), **Echo top** (km) and **Hail** (probability in %). The data are 765 x 700 grids of
1 km, kept in bbqweer.eu's own MongoDB by the radar thread of the `weather-maps` container; the browser paints them in our own colour
scales. The page is a port of `/rainradar` of wo-ict.nl **without** the KNMI WMS layer.
The data format, the fetching and the quota story are described in detail in wo-ict.nl's `docs/radar-grids.md`; this file only says what is
different here.

## Status

| Part | State |
|---|---|
| Radar thread in `weather-maps` (`radar` in `[maps] sources`), status row `radar-maps-sync` | **in production** (2026-11-01), history copied from wo-ict.nl (19 October until now, about 11,800 frames) |
| Backend route `/api/radar-grid` (public), nginx location + frame cache | written 2026-11-01, **not yet deployed** |
| Page `/rainradar`, menu item | written 2026-11-01, **not yet deployed** |

## Architecture

```
KNMI Open Data API  -->  weather-maps (radar thread, h5py)  -->  MongoDB `weathermaps`  -->  /api/radar-grid  -->  Leaflet page
                                   |                              radar_grids, radar_grid_days,           (inflate, paint on a canvas,
                                   +--> status row `radar-maps-sync` in MySQL `server-tasks`   radar_forecast     colour scale, click for the value)
```

- **Same MongoDB and database as the weather charts** (`weathermaps`, container `mongodb`), three extra collections: `radar_grids` (one
  document per set and 5-minute time, zlib-compressed codes, value = `code * scale + offset`), `radar_grid_days` (a day that was fetched
  completely, so a restart does not scan the window again) and `radar_forecast` (the 2-hour forecast of the newest run, **precipitation
  only**, 24 steps of 5 minutes). Details of the fields: wo-ict.nl `docs/radar-grids.md`.
- **Retention** `[radar] keep_days = 14` (about 7 MB a day). The Mongo cache was doubled to `--wiredTigerCacheSizeGB 0.5`
  (`mem_limit` 768m) for this; the container sits around 580 of 768 MB, **watch the memory** (`/var/log/container-mem.log`, see
  `weather-charts.md` "Operations").
- **The KNMI Open Data key is shared with wo-ict.nl** (1000 calls an hour for both). Steady state is about 135 calls an hour per process;
  the back-fill only runs while the API reports more than `reserve_requests` (700) calls left, so wo-ict.nl keeps its share. `maps/quota.py`
  adds the last value to the status message (`KNMI quota 812 left at 13:07 UTC, resets 13:48 UTC`; the reset only while it is still in the future) and sends an ntfy push (once an hour) below 100.
  **Never run a second radar process on the production key** (for instance on the dev PC).
- **Filling gaps:** `python app.py --once --sources radar --radar-from 2026-10-01 [--radar-sets echotop,hail]` (in the container) widens
  the window from that day; the history of the first weeks was copied from wo-ict.nl's Mongo instead of fetched.

## The radar thread (`weather-maps/maps/radar.py`, `radar_store.py`, `quota.py`)

- Not a model source: `radar` in `[maps] sources` starts **one thread** (`radar_loop`) next to the 10-minute model rounds. A failure in it
  never stops the model sources (it is caught and logged; if it cannot start the others go on).
- **Live pass** every `check_seconds` (120): list the files of the last 6 hours, fetch the new or changed ones. **Back-fill** in the time
  between: newest day first, echo top and hail from the daily tar archives, precipitation file by file. Everything is an upsert on
  `(set, ts)`; a frame that is stored and unchanged is not written again.
- **Status row `radar-maps-sync`** (`TaskStatus(cfg, 'radar-maps-sync')` in `maps/db.py`): one cycle = `start()`, `progress()` after the
  live pass, `finish()` with `live: ... | back-fill: ... | KNMI quota ...`; `error` when the live pass failed `alert_after_failures` rounds
  in a row (also an ntfy push, key `weather-maps-radar`). `stopped()` on a container stop. The row comes from
  `database/init/05-server-tasks.sql` (new installs) and `database/updates/radar-maps-sync-task-20261101.sql` (existing databases, **before**
  adding `radar` to `sources`).
- **Config** `[radar]` in `weather-maps/config.ini` (see `config.ini.example`): `keep_days`, `check_seconds`, `max_requests_per_hour`,
  `reserve_requests`, `live_floor`, `live_pass`, optional `own_reserve`. Needs `[knmi] open_data_key`. `h5py` is in `requirements.txt`.
- The HARMONIE source counts its calls in the same shared quota (`maps/sources/harmonie.py`).

## Backend route `backend/routes/radargrid.route.js`

Mounted in `app.js` as `/api/radar-grid`. **Public: no `auth`.** Mongo connection like `weathermaps.route.js` (`[weathermaps]` section of
`config.ini` / `config.local.ini`, database `weathermaps`; read at startup, restart the backend after changing it).

- `GET /frames?set=precip[&from=<ISO>&to=<ISO>][&forecast=1]`: the grid description, the newest and oldest time, and the frames of the
  period (`{ts, v, size}`; at most 2 days at once). `forecast=1` adds the forecast of the newest run (precip only, only when it is not older
  than 15 minutes against the newest observation). `Cache-Control: no-cache`.
- `GET /days?set=precip`: the local days (`Europe/Amsterdam`) that have frames, for the History date picker (14 days).
- `GET /frame?set=&ts=&v=[&forecast=1]`: the zlib bytes of one grid. `ts` and `v` are in the URL, so a frame never changes under the same
  URL: `Cache-Control: public, max-age=3600` (`app.js` only sets `no-store` on the static files, not on `/api`).

## nginx (`nginx/nginx.conf`)

- `location /api/radar-grid/` with the same `limit_req zone=weathermaps burst=60 nodelay` as the weather charts (public route).
- `location = /api/radar-grid/frame` additionally has `proxy_cache radar` (1 hour, key `$request_uri`, `X-Cache-Status` header). The cache
  (`proxy_cache_path /var/cache/nginx/radar`, 200 MB, inactive 2 h) lives in the container's own filesystem: gone after a restart, which
  is fine. `/frames` and `/days` are not cached. `nginx.local.conf` has no radar location (its `/api/` proxy is enough for dev).
- Like all `nginx.conf` changes it is picked up by the frontend deploy's nginx **restart**.

## The page `frontend/src/app/pages/rainradar/`

Own lazy module `RainRadarMapModule`, route `rainradar` (no guard). Parts: `services/radar-grid.service.ts` (no token; also holds the
`RadarFrame` / `RadarFrameInfo` / `RadarDay` types), `utils/radar-grid.util.ts` (projection, lookup table, colour scales, painting; no
Angular), `utils/map-view.util.ts` (remembered position, resize watch), `components/my-map-settings/` (Settings button + dialog).

- **Layer dropdown:** Precipitation (default), Echo top, Hail. The colour scale is the legend bottom right.
- **Live:** 1 hour back to +2 hours (the forecast, precipitation only); the frame list is re-read every 30 s. **History:** a date picker with
  the days `/days` returns, a rain strip (bar height follows the stored size of the frame), playback speed.
- **The time at the top** with ‹ › and play/pause; a click on it opens the **Player** dialog (not modal, `styleClass="map-dialog"`,
  `[focusOnShow]="false"`; the date picker in its header stops `mousedown`/`touchstart`, otherwise the dialog starts a drag and jumps).
- **Click on the map** shows the real value at that spot (mm/h, km or %) and the time of the frame. Space = play/pause, arrows = step.
- **Satellite / Street map button** (Esri World Imagery or OSM) and Settings (opacity, zoom step). The layer, the satellite choice and the
  map position are remembered in `localStorage` key `rainradar_view` (settings in `rainradar_settings`), both through `LocalStorageService`.
- **Area outline:** the dashed rectangle of the radar picture (nothing is drawn outside it), on/off in Settings ("Area outline"), remembered in `rainradar_view`.
- **Left out on purpose** compared to wo-ict.nl: the KNMI WMS image layer.
- **Attribution (required):** "Radar: KNMI (CC-BY 4.0)" in the Leaflet attribution control. Keep it.
- Memory in the browser: painted frames are cached (at most 40, about 1 MB each) and revoked when evicted; `ngOnDestroy` clears all of it.
- The `.map-dialog` focus-ring rule is in `assets/styles/global-custom-styles.scss`.

## Deploy

No SQL for the page (the status row already exists). Order: `git push`, then `.\deploy-hetzner.ps1 -Service nodejs` (the route), then
`-Service frontend` (page + the nginx restart that loads the new location and cache). `weather-maps` and `mongodb` need no rebuild for it.
