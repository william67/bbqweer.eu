# Weather charts (Weerkaarten): gridded model data on a map

Public page `/#/weathercharts`: isobars (MSLP every 4 hPa, H/L marks), colour layers for wind, temperature and precipitation, a time slider and a tooltip with all values at the pointer. The data are **rasters** (a value per grid point over Europe) from four numerical models, kept in bbqweer.eu's **own MongoDB** by a Python sync service. The point forecasts of the Forecast page (Open-Meteo) are a different thing.

## Status

| Part | State |
|---|---|
| `mongodb` + `weather-maps` containers | **in production** (2026-10-24), first full sync of all four models done |
| Backend route `/api/weather-maps` | **in production** (public) |
| Page `/weathercharts`, menu item, nginx rate limit | **in production**; rate limit tested 2026-10-24 |

## Architecture

```
KNMI / ECMWF / DWD / NOAA  -->  weather-maps (Python, eccodes)  -->  MongoDB `weathermaps`  -->  /api/weather-maps  -->  Leaflet page
                                       |
                                       +--> status row `weather-maps-sync` in MySQL `server-tasks`, ntfy on repeated failures
```

- The sync is its own container (`weather-maps/`, `build: ./weather-maps`), the database a second container (`mongodb`, image `mongo:7.0.16`). **Mongo has no `ports:`** and no password: it is only reachable on the compose network. Locally `docker-compose.local.yml` publishes it on `127.0.0.1:27018` only (27017 is taken by another project's Mongo on the dev PC).
- The backend serves the grids, the browser does the rest: **the isobars, wind arrows and colour images are computed in the browser** from the stored grid, so intervals and layers need no server work.
- Limits (compose): sync `cpus: 1.0`, `cpu_shares: 128`, `mem_limit: 1g`, `workers = 2`; Mongo `mem_limit: 768m` and `--wiredTigerCacheSizeGB 0.25`. Reason: the VPS has 3.8 GB RAM, MySQL already uses about 1.45 GB. **Memory is the bottleneck**, see "Operations".

## The light set

Kept small to fit the VPS (about 0.6 GB of grids; all grids and 4 runs would be about 1.3 GB):

| Model | Grid kept | Dropped (`skip_grids`) |
|---|---|---|
| ECMWF | 0.25° | |
| GFS | 0.25° | |
| ICON-EU | 0.25° (every 4th native point) | 0.125° |
| HARMONIE | 0.058° x 0.036° (every 2nd native point) | 0.029° |

- `keep_runs = 2` complete runs per model and grid (4 would double the size).
- `harmonie_run_every_hours = 6`: HARMONIE is only fetched for every 6th hourly run (each tar is about 900 MB).
- The page lists whatever `/models` returns, so a dropped grid simply does not appear in the dropdown.

## The sync service `weather-maps/`

- **Layout:** `app.py` (loop), `maps/config.py`, `maps/db.py` (status row), `maps/ntfy.py`, `maps/store.py` (MongoDB), `maps/grid.py` (decode, crop, pack), `maps/sources/{ecmwf,icon_eu,gfs,harmonie}.py`, `Dockerfile` (python 3.12-slim, pinned requirements incl. `eccodes`/`eccodeslib`), `config.ini.example`. Not for Windows: `eccodeslib` has no Windows wheel, run it in Docker.
- **Per round and source** (every `check_seconds`, 600): ask the source for its newest complete run; if it is newer than `weather_grid_runs` says, download only the fields we need, decode with eccodes, convert units, cut to the Europe box (35-70°N, -25-45°E; HARMONIE is kept whole), keep every n-th point, pack and upsert one document per model, grid, run, step and parameter. Only after the whole run is written it is added to `runs` of `weather_grid_runs`; the newest `keep_runs` are kept and the documents of older runs deleted. A failed run changes nothing (the next round retries; documents are upserts), so the page never shows half a run.
- **Status row, one entry per round:** every round calls `start()`, then `progress()` after each source and `finish()` at the end (`maps/db.py`, same columns as `taskFinish()` in the backend helper), so the Taakstatus dialog shows `success` (or `error` when a source failed) with start, end and duration of the last round, like the other tasks; it only shows `running` while a round is busy (most rounds are 1-2 s: "run is stored"). If the container is stopped in the middle of a round the row is set to not running with the message "stopped (container restart)". A MySQL problem never stops the sync. The failure alert is separate (below), no extra ntfy push from `finish()`.
- **Alerts:** `alert_after_failures` (3) consecutive failed rounds for one source send an ntfy push to the shared `servererrors` topic (deduped 1/hour per source).
- **Completeness check:** ECMWF the `.index` of the last step (360 h for 00z/12z, 144 h for 06z/18z), GFS the `.idx` of step 384, ICON-EU the `_120_` file, HARMONIE the tar being listed at all.
- **Gap filling:** a stored run that lacks a parameter the source delivers now (a parameter added to the code) is filled up by the sync itself (`fill_gaps()`); a run that cannot be filled (gone from the source) is retried after 6 hours and is not an error.
- **Manual runs** (inside the container, or locally in Docker):

```powershell
# one round of one source, then exit
docker compose -f docker-compose.yml -f docker-compose.local.yml --profile donotstart run --rm --no-deps weather-maps python app.py --once --sources ecmwf --config config.ini
# exactly these runs (tests, back-filling): --runs 2026102306,2026102309
# add only one parameter to stored runs: --runs 2026102306 --params gust
```

### Config `weather-maps/config.ini` (never in git; mounted read-only)

```ini
[mongodb]
host = mongodb
port = 27017
database = weathermaps

[mysql]                       ; only for the server-tasks status row
host = mysql
port = 3306
user = <db user>
password = <password>
database = bbqweer

[ntfy]
base_url = <the own ntfy, as in backend/config.ini>
token = <token>
topic_suffix =

[knmi]
open_data_key = <KNMI Open Data API key>

[maps]
check_seconds = 600
sources = ecmwf,icon-eu,gfs,harmonie
workers = 2
keep_runs = 2
lat_min = 35
lat_max = 70
lon_min = -25
lon_max = 45
harmonie_run_every_hours = 6
skip_grids = 0.125,0.029
alert_after_failures = 3
```

- The KNMI key is the **Open Data API key** (developer.dataplatform.knmi.nl, API Catalog, Open Data API), not a WMS key. It is only needed for HARMONIE; without it use `sources = ecmwf,icon-eu,gfs`. It is one key shared with another project of the same owner (about 144 requests a day per sync); if they must be separated later, request a second key and replace that one line.
- Locally the file points at `mongodb`/`mysql` on the compose network and has no `[ntfy]`/`[knmi]` section. **Never put the key in git or in a document.**
- **Editing it on the VPS from PowerShell:** do not use `Set-Content -Encoding utf8` (Windows PowerShell 5.1 writes a BOM, which earlier broke a backend's config; `maps/config.py` reads with `utf-8-sig` as a safety net, but the backend's `config.ini` is parsed by the Node `ini` package, which has no such net). Use `[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding $false))`, or write it from a shell on the VPS.

### Database seed

`weather-maps-sync` row in `server-tasks`: `database/init/05-server-tasks.sql` for new installs, `database/updates/weather-maps-sync-task-20261024.sql` for existing databases (applied on local dev and on production on 2026-10-24, **before** the first start).

## MongoDB collections (database `weathermaps`)

- `weather_grids`: {model, grid, run, step, param, units, nx, ny, lat0 (north edge), lon0 (west edge), dlat, dlon (positive spacing, row 0 is north), min, max, packed}, unique on model, grid, run, step, param. `packed` is zlib of the high bytes of the uint16 values followed by the low bytes; value = `min + q * (max - min) / 65535` (`maps/grid.py` `pack()`/`unpack()`). 36-70 KB per field at 0.25°.
- `weather_grid_runs`: _id `"<model>/<grid>"`: `runs` (the complete runs, newest first, each with run, steps, params, meta), `timeline` ([{valid, run, step}]) and run/steps/params/meta of the newest run at the top level. The page reads this document first.
- **Merged timeline** (`build_timeline()` in `maps/store.py`): for every valid time the run to use. The newest run is used for its whole range, an older run only adds the valid times after the end of the newer ones (a short ICON-EU run covers the first two days, an older long run the rest). There is a visible seam where the run changes; the page says where in a line under the controls.

Parameters: `msl` (hPa), `t2m` (°C), `u10`, `v10` (m/s), `precip` (mm, accumulated since the run start, rain per hour is the difference of two steps of the same run), `gust` (m/s) and `prate` (mm/h, **GFS and ECMWF only**, the precipitation rate at the step; the totals of those two are packed too coarsely for an hourly difference). The gust means something slightly different per model (ECMWF the maximum since the previous output step, ICON-EU and HARMONIE the maximum of the last hour, GFS the gust at that step).

## Backend route

`backend/routes/weathermaps.route.js`, mounted in `app.js` as `/api/weather-maps`. **Public: no `auth`** (it is weather data).

- `GET /models` per model and grid: the complete runs and the merged `timeline`.
- `GET /field?model=&grid=&run=<ISO>&step=&param=` one grid as JSON (header + `packed` as base64). The run is part of the URL, so the answer never changes: `Cache-Control: public, max-age=31536000, immutable`. (`app.js` only sets `no-store` on the static files, not on `/api`.) A replaced run answers 404 and the page reloads the model list. Parameters are whitelisted, model and grid must match `^[a-z0-9.\-]+$`.
- Connection from the `[weathermaps]` section of `config.ini` / `config.local.ini` (the same file the pool helper picks): `host` (default `mongodb`), `port` (27017), `database` (`weathermaps`). Local dev: `host = localhost`, `port = 27018`. The file is read at startup, restart the backend after changing it. Dependency: `mongodb` in `backend/package.json`.
- **nginx** (`nginx/nginx.conf`): `limit_req_zone ... zone=weathermaps rate=20r/s` and a `location /api/weather-maps/` with `burst=60 nodelay`, because the route is public. Only the production config has it (`nginx.local.conf` is not used for dev).

## The page

`frontend/src/app/pages/weathercharts/` (own lazy module `WeatherChartsModule`, route `/weathercharts` without a guard, menu item "Weerkaarten" right after Verwachting). Service `services/weather-maps.service.ts` (no token), types `api/weather-maps.ts`, pure functions in `utils/isobars.util.ts`, `wind.util.ts`, `layers.util.ts`.

- **Controls:** model/grid dropdown, run dropdown ("Samengesteld" = the merged timeline, or one run alone), layer dropdown (none, wind with *gemiddeld*/*windstoten*, temperature 2 m, precipitation), labels checkbox, slider and play button over the valid times, step buttons.
- **In the browser:** the base64 is inflated with `DecompressionStream('deflate')`, the isobars come from an own marching squares routine (line segments, no polygons), highs and lows are strict extremes in a window of about 4 degrees. The colour layers are built in Web Mercator and put in the tile pane. The next two frames are prefetched, decoded grids are cached (at most 240), the model list is refreshed every 5 minutes.
- **Layout:** like the Planetarium and Lightning pages the component sets the padding of `.layout-content` to 0 so the map fills the content area, and puts it back in `ngOnDestroy`.
- **Position and zoom** are remembered in `localStorage` key `weathercharts_view` (through `LocalStorageService`).
- **Attribution (required, the page is public):** part of the Leaflet attribution control next to OpenStreetMap: "Modeldata: ECMWF Open Data (CC BY 4.0), DWD ICON-EU, NOAA GFS, KNMI HARMONIE (CC BY 4.0)". Keep it when touching the tile layer.
- The map uses OpenStreetMap tiles with `maxZoom: 10`. Leaflet is imported like on the Lightning page.

## The sources (measured 2026-10-23)

| | ECMWF Open Data | DWD ICON-EU | NOAA GFS | KNMI HARMONIE-AROME |
|---|---|---|---|---|
| Key | none | none | none | **Open Data API key** |
| Fetch | `.index` (JSON lines) + HTTP Range per field | one file per field (bz2) | `.idx` + HTTP Range per field | one **tar per hourly run** (900-980 MB), streamed |
| Run available after | about 7.5 h | about 2.75 h | about 3.7 h | about 2.5 h |
| Runs | 00, 06, 12, 18 UTC | every 3 h | 00, 06, 12, 18 UTC | hourly (we take every 6th) |
| Steps used | 3-hourly to +144 h, 6-hourly to +360 h (06z/18z only to +144 h) | hourly to +78 h then 3-hourly to +120 h (03/09/15/21z: to +48 h) | hourly to +120 h then 3-hourly to +384 h | hourly, 0-60 h |
| Retention at source | 3-4 days | newest run per hour only | 90+ days | archive since 2026-01-07 |
| Native grid | 0.25° | 0.0625° | 0.25° | 0.029° x 0.018°, NL and surroundings |

HARMONIE details: the tar holds 61 GRIB1 files (one per forecast hour), 49 fields each, on one regular lat-lon grid of 390 x 390 points (49.0-56.0°N, 0-11.28°E). Fields use KNMI local parameters (eccodes `shortName` is `unknown`), so they are identified by `indicatorOfParameter` + level: MSLP 1 at `heightAboveSea:0`, 2 m temperature 11 at level 2, 10 m wind 33/34 at level 10, gust components 162/163, precipitation 61 at level 0 (accumulated since the run start). The public anonymous KNMI key is shared and rate-limited (HTTP 429), so the sync needs its own key.

Parameter names: ECMWF `msl` Pa, `10u`/`10v` m/s, `2t` K, `tp` **m**; ICON-EU `PMSL` Pa, `U_10M`/`V_10M`, `T_2M` K, `TOT_PREC` kg/m²; GFS `PRMSL` Pa, `UGRD`/`VGRD` 10 m, `TMP` 2 m, `APCP` kg/m² (several records per step, the `0-N hour acc` one is taken).

## Gotchas found while building it

1. ECMWF files start at longitude 180 and wrap to 179.75: longitudes are computed from the step (`lon1 + i * di`), not interpolated between first and last point. GFS is 0-359.75 and is sorted west to east.
2. Accumulated precipitation does not exist at step 0 (a legitimately missing field is skipped; any other missing field fails the run).
3. The HARMONIE grid is not square: the document carries `dlat` and `dlon` separately.
4. The HARMONIE tar is streamed (`tarfile` mode `r|`), each member through a temporary file, so 900 MB never lands on disk.
5. ICON-EU starts at -23.5°E, so its grid is slightly narrower than the box.
6. A 06z or 18z ECMWF run only goes to 144 h, so the ECMWF forecast gets shorter after such a run.
7. OpenStreetMap blocks tiles for a page opened from disk (`file://`); inside the app it works.

## Operations

- **Memory:** watch `free -m` and the server monitoring. If used memory goes above about 3.3 GB: first lower `keep_runs` or drop HARMONIE from `sources` (edit `config.ini`, then `docker compose up -d weather-maps`), and tell the owner. Beyond that: a smaller MySQL buffer (their decision) or a bigger VPS.
- **Memory per container:** `scripts/container-mem-log.sh` writes one line per minute to `/var/log/container-mem.log` on the VPS (host used/available in MB plus the memory of every container; `/etc/cron.d/container-mem`, rotated daily for 14 days by `/etc/logrotate.d/container-mem`). Read it with `tail` or `grep 'T21:3' /var/log/container-mem.log` (times are UTC). The host history at a coarser 10 minutes is in `sar -r -f /var/log/sysstat/saDD`. An OOM kill of a container shows in `journalctl -k | grep -i "out of memory"`.
- **When the runs arrive** (UTC, about): GFS 4 times a day, 3.7 h after the run hour (18Z at about 21:40); ICON-EU about 2.75 h after the run; ECMWF about 7.5 h after (00Z/12Z full runs, 06Z/18Z short ones); HARMONIE about 2.5 h after, every 6th hourly run.
- **First full sync is slow** (2 workers, small VPS): count on 30-40 minutes for GFS. HARMONIE downloads a 900 MB tar per fetched run.
- **Logs:** `docker compose logs -f weather-maps` on the VPS. Status also shows in the Taakstatus dialog (`weather-maps-sync`).
- **Rollout order** (VPS, in `/opt/bbqweer`): `git pull --ff-only`, SQL seed, `weather-maps/config.ini` (no BOM), `docker compose up -d --build mongodb weather-maps`. The page needs `.\deploy-hetzner.ps1 -Service nodejs` and `-Service frontend`; `nginx.conf` is only picked up by the frontend deploy's nginx restart. The script does not cover `mongodb`/`weather-maps`.
- **Never run the sync from the dev PC against the production Mongo** (which has no published port anyway).
- **Never publish Mongo's port.** It has no password.

## Implementation notes

- **Memory in `iter_tasks()`** (`weather-maps/maps/sources/base.py`): at most `workers * 3` downloads are in flight and a result is released as soon as it is handed on. Submitting every task at once and keeping all futures would keep all downloaded GRIB bytes of a run in memory until the run ends: a GFS run (~1450 fields) then needs over 1 GB and the container was OOM-killed at its 1 GiB limit on the VPS (2026-10-24). With the window the GFS peak is about 140 MiB (measured locally), and about 75-90 MiB on the VPS. More parallel downloads only need a larger `workers`; the memory follows `workers * 3`, not the size of the run.
- **Light set:** `skip_grids` is a `[maps]` key read in `build_sources()` in `app.py`; it removes the named grids from each source.
- The route and page are public (no login), with a rate limit in nginx and a visible data attribution.
- The page lives in its own lazy module `pages/weathercharts/`.

## Open points

- **Memory margin:** with the bounded download window the sync stays around 100-140 MiB (GFS 12Z, measured on the VPS 2026-10-24), the host around 2.2 GB used of 3.7 GB. Keep an eye on it while the second run per model (`keep_runs = 2`) fills up; the per-container log shows it.
- Rate limit (nginx, 20 r/s per IP, burst 60), tested on production 2026-10-24: 200 requests with 40 in parallel gave 147 x 200 and 53 x 503, the next request and other APIs answered 200 straight away. A normal page view (the model list plus a few fields) stays far below it.
- More layers (cloud cover, humidity, ...) exist in the sources but are not stored.
- The temperature and rain colour scales are our own choice.

## Sneeuw en neerslagtype (toegevoegd 2026-10-26, overgenomen van wo-ict.nl)
De totale neerslag is het waterequivalent van alles (regen, sneeuw, ijsregen, hagel). Elke bron levert nu een type; de laag kleurt per type.
Klassen (alle bronnen gelijk): 0 geen, 1 regen, 2 natte sneeuw/mix, 3 sneeuw (incl. ice pellets, graupel, hagel), 4 ijzel.
- **ECMWF, GFS**: parameter `ptype` (klasse per stap), gemaakt in de sync. GFS: vlaggen CSNOW/CRAIN/CFRZR/CICEP, dus klasse 2 komt daar niet voor.
- **ICON-EU, HARMONIE**: parameter `snow` (mm water, opgeteld sinds de start van de run). De pagina leidt het type af uit het sneeuwaandeel
  van het interval (>= 80 % sneeuw, > 20 % mix) en de 2 m-temperatuur (regen bij <= 0 graden is ijzel); "(afgeleid)" in legenda en tooltip.
- **GFS-belasting**: een run is nu ca. 1.700 velden (was ca. 1.000). Verwacht 10-15 min per run met 2 workers. De container heeft `mem_limit: 1g`:
  meet met `docker stats` tijdens de eerste GFS-ronde en zet `workers` omlaag als het krap wordt.
- **Eerste ronde na uitrol**: `fill_gaps()` vult de nieuwe parameter aan bij elke bewaarde run. HARMONIE leest daarvoor de hele tar van elke
  bewaarde run opnieuw (ca. 0,9 GB per run). Opslag: minder dan 1 MB extra per run.
- Uitrolvolgorde: backend (`PARAMS` in `weathermaps.route.js`) -> sync -> frontend. Zonder het veld toont de pagina gewone regen (in radarkleuren).
