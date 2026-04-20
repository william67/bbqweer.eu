# KNMI Data Sync — v3 (Two-Pointer Merge)

**File**: `backend/tasks/knmidata-v3.js`  
**Trigger**: `backend/callSyncKnmi.js` (manual) or cron in `backend/app.js` (hourly)

---

## Overview

Downloads KNMI weather data ZIP files from the KNMI open data portal, parses the CSV content, and syncs the records into three MySQL tables using a two-pointer merge algorithm. Runs every hour at :00 via cron; full re-sync at 00:00.

---

## Data Sources

KNMI provides three types of data files, each registered in the `datafiles` table:

| FILETYPE | Table | Description |
|----------|-------|-------------|
| `E` | `etmgeg` | Daily weather observations (39 measured fields) |
| `U` | `uurgeg` | Hourly weather observations (22 measured fields) |
| `N` | `neerslaggeg` | Daily precipitation (2 fields) |

Each file covers one weather station. The `datafiles` table stores the URL, filename, filetype, last known file date, and last import stats.

---

## Two-Pointer Merge Algorithm

**Complexity**: O(n+m) — no full table scans, no ON DUPLICATE KEY UPDATE.

Both sides are sorted by `SYNC_KEY` before the merge:

- **Array A** (CSV): parsed rows from the downloaded file, sorted by key computed in JS
- **Array B** (DB view): rows read from `v_etmgeg` / `v_uurgeg` / `v_neerslaggeg`, sorted by `SYNC_KEY`

**SYNC_KEY format**:
- ETMGEG / NEERSLAGGEG: `LPAD(STATION,3,'0') + LPAD(JAAR,4,'0') + LPAD(MAAND,2,'0') + LPAD(DAG,2,'0')`
- UURGEG: same + `LPAD(UUR,2,'0')`

**Decision per step**:

| Condition | Action |
|-----------|--------|
| `A.key < B.SYNC_KEY` | Row is new → collect for batch INSERT |
| `A.key === B.SYNC_KEY` | Row exists → compare values field-by-field; UPDATE only if changed |
| `A.key > B.SYNC_KEY` | B has an orphan (deleted from CSV) → skip, advance B |

After the loop, any remaining A rows are also inserted. INSERTs are batched in groups of 500.

**Result per file**: `{ inserted, updated, unchanged }` — logged to `logfile` table and console.

---

## File Date Check (skip logic)

Before processing, the ZIP entry date is compared to `datafiles.FILEDATE`:
- If **unchanged** and not a full sync → file is skipped entirely
- If **changed** or **full sync** → proceed with merge

Full sync is triggered when `hour === 0` (midnight run) or manually via `--full` flag.

---

## Value Parsers

KNMI CSV values are raw integers; conversion happens during parsing:

| Parser | Logic |
|--------|-------|
| `parseNum(s)` | Empty string → `null`, else `parseInt` |
| `parseDiv10(s)` | Empty → `null`, else `parseInt / 10` (e.g. temperature in 0.1°C) |
| `parseSQ(s)` | Empty → `null`; `-1` → `0` (trace sunshine); else `/ 10` |
| `parseRH(s)` | Empty → `null`; `-1` → `0` (trace precipitation); else `/ 10` |

---

## Derived / Recalculated Fields

These fields are **not in the KNMI CSV** — they are computed from JAAR, MAAND, DAG during every insert:

| Field | Computed as |
|-------|-------------|
| `DATUM` | `YYYY-MM-DD` formatted date string |
| `DATUM_TIJD` | `YYYY-MM-DD HH:00:00` (UURGEG only; UUR-1 because KNMI uses end-of-hour) |
| `DECENNIUM` | `CEIL(JAAR / 10) * 10` (ETMGEG only) |
| `WEEK` | ISO week number |
| `JAAR_WEEK` | Year that owns the ISO week |
| `SEIZOEN` | Season code: `W` (winter), `L` (spring), `Z` (summer), `H` (autumn) |
| `JAAR_SEIZOEN` | Year associated with the season (December counts as next year's winter) |
| `WINTER` | Winter year: `JAAR+1` for Nov/Dec, `JAAR` for Jan–Mar, `0` otherwise |
| `DECADE` | Decade of month: 1 (days 1–10), 2 (11–20), 3 (21–31) |

These are **only set on INSERT** — UPDATE only touches the measured data fields.

---

## ETMGEG — Daily Fields (39)

| Field | Unit | Description |
|-------|------|-------------|
| DDVEC | degrees | Vector mean wind direction |
| FHVEC | 0.1 m/s | Vector mean wind speed |
| FG | 0.1 m/s | Daily mean wind speed |
| FHX | 0.1 m/s | Maximum hourly wind speed |
| FHXH | hour | Hour of FHX |
| FHN | 0.1 m/s | Minimum hourly wind speed |
| FHNH | hour | Hour of FHN |
| FXX | 0.1 m/s | Maximum wind gust |
| FXXH | hour | Hour of FXX |
| TG | 0.1°C | Daily mean temperature |
| TN | 0.1°C | Minimum temperature |
| TNH | hour | Hour of TN |
| TX | 0.1°C | Maximum temperature |
| TXH | hour | Hour of TX |
| T10N | 0.1°C | Minimum temperature at 10cm |
| T10NH | 6-hour period | Period of T10N |
| SQ | 0.1 hour | Sunshine duration (-1 = trace → stored as 0) |
| SP | % | Percentage of max possible sunshine |
| Q | J/cm² | Global radiation |
| DR | 0.1 hour | Precipitation duration |
| RH | 0.1 mm | Precipitation (-1 = trace → stored as 0) |
| RHX | 0.1 mm | Max hourly precipitation |
| RHXH | hour | Hour of RHX |
| PG | 0.1 hPa | Mean sea level pressure |
| PX | 0.1 hPa | Max sea level pressure |
| PXH | hour | Hour of PX |
| PN | 0.1 hPa | Min sea level pressure |
| PNH | hour | Hour of PN |
| VVN | class | Min visibility |
| VVNH | hour | Hour of VVN |
| VVX | class | Max visibility |
| VVXH | hour | Hour of VVX |
| NG | oktas | Mean cloud cover |
| UG | % | Mean relative humidity |
| UX | % | Max relative humidity |
| UXH | hour | Hour of UX |
| UN | % | Min relative humidity |
| UNH | hour | Hour of UN |
| EV24 | 0.1 mm | Potential evapotranspiration |

---

## UURGEG — Hourly Fields (22)

| Field | Unit | Description |
|-------|------|-------------|
| DD | degrees | Wind direction |
| FH | 0.1 m/s | Hourly mean wind speed |
| FF | 0.1 m/s | Mean wind speed last 10 min |
| FX | 0.1 m/s | Max wind gust last 6 hours |
| T | 0.1°C | Temperature |
| T10 | 0.1°C | Temperature at 10cm |
| TD | 0.1°C | Dew point temperature |
| SQ | 0.1 hour | Sunshine duration (-1 → 0) |
| Q | J/cm² | Global radiation |
| DR | 0.1 hour | Precipitation duration |
| RH | 0.1 mm | Precipitation (-1 → 0) |
| P | 0.1 hPa | Sea level pressure |
| VV | class | Visibility |
| N | oktas | Cloud cover |
| U | % | Relative humidity |
| WW | code | Present weather code |
| IX | code | Weather indicator code |
| M | 0/1 | Fog |
| R | 0/1 | Rain |
| S | 0/1 | Snow |
| O | 0/1 | Thunder |
| Y | 0/1 | Ice |

---

## NEERSLAGGEG — Precipitation Fields (2)

| Field | Unit | Description |
|-------|------|-------------|
| RD | 0.1 mm | Daily precipitation (-1 → 0) |
| SX | code | Snow depth code |

---

## Error Handling & Monitoring

- Download error, ZIP parse error, unknown filetype → `taskError('knmidata-sync')` increments `errorCount`
- `processFile` returns `true` on error, `false` on success/skip
- After all files: status = `'partial'` if any errors, `'success'` if none
- Fatal exception (DB down etc.) → status = `'error'`
- All events logged to `logfile` table and console

The `server-tasks` row (`knmidata-sync`) tracks: `isRunning`, `currentProgress/progressTotal`, `errorCount`, `lastStatus`, `lastDurationSec`, `lastMessage`.

---

## Post-Sync

After all files are processed, `CALL UpdateHistory()` recalculates aggregate tables:
- `UpdatePeriodeGegevens` — period statistics
- `UpdateNormen` — climate normals
- `UpdateVorstperiodes` — frost periods
- `UpdateKoudegolven` — cold waves
- `UpdateHittegolven` — heat waves
- `UpdateSuperHittegolven` — extreme heat waves

---

## Manual Trigger

```powershell
cd C:\Apps\bbqweer.eu\backend
node callSyncKnmi.js           # incremental (skips unchanged files)
node callSyncKnmi.js --full    # full re-sync (re-processes all files)
```

Inside the Docker container:
```bash
docker exec -it bbqweer-nodejs node callSyncKnmi.js
docker exec -it bbqweer-nodejs node callSyncKnmi.js --full
```

---

## Known Quirks

- **NULL vs 0**: KNMI CSV `-1` means "trace amount" — stored as `0` (via `parseSQ`/`parseRH`).
- **Case sensitivity**: MySQL on Linux is case-sensitive for table names. All SQL in the task uses lowercase table names (`etmgeg`, `datafiles`, `logfile`, etc.).
- **MaxListeners warning**: rapid parallel HTTPS downloads trigger a Node EventEmitter warning. Mitigated with `httpsAgent: maxSockets: 5` on the axios instance.
- **InnoDB**: All KNMI tables use InnoDB — required for the concurrent writes during sync.
