# KNMI UpdateHistory: write only what changed (no more TRUNCATE)

From wo-ict.nl, built and applied there on 2026-10-12 (full story: `C:\Apps\wo-ict.nl\docs\knmi-no-op-upsert.md`). The tables and procedures here are the same as on wo-ict.nl, so the same SQL file works against the `bbqweer` database: `database/updates/knmi-updatehistory-no-op-upsert-20261012.sql`.

## Status

- **Applied to prod 2026-10-12 14:14 UTC.** One `CALL UpdateHistory()` afterwards (62 s): all 14 result-table checksums identical to before, binlog written ~9 KB (was ~15 MB). Rollback dump and checksums are on the VPS in `/root/knmi-noop-20261012/` (`routines-before.sql`, `chk-before.txt`, `chk-after.txt`).
- **Local dev tested first**: rebuilt every result table from empty with prod's `etmgeg` data; all 13 tables (excluding `dagnormen_raw`) matched prod's old-procedure output exactly.
- **`UpdateKoudegolven` bug fixed in this copy** (not in the wo-ict.nl original): the closing INSERT had `TMIN` and `HELLMANN` swapped (`vHELLMANN, vMIN`). It only fires when the last frost sequence of the highest station is itself a qualifying cold wave, which is not the case in today's data, so no checksum changed.
- `database/init/01-schema.sql` updated: new procedure definitions, the four unique keys, `dagnormen_raw` removed.
- **Still to do**: after a few more hourly syncs ran fine, `DROP TABLE dagnormen_raw` on prod (dump it first), then `CALL UpdateNormen();` once and check the `*normen` checksums are unchanged.
- Not done: only call `UpdateHistory` from `knmidata-v4.js` when the sync changed something.

The steps below are the original recipe from wo-ict.nl, kept for reference.

## Why

After every sync `UpdateHistory()` runs `TRUNCATE` + a full re-insert on about 14 tables, which is roughly 15 MB of binlog per run and ~1 minute per hour with empty tables. The new procedures build each result in a `TEMPORARY` table and then, in one transaction, upsert it into the real table and delete the rows that are gone. Rows whose values did not change are skipped by MySQL and written nowhere, and the tables are never empty.

Checked on wo-ict.nl: old and new results identical row for row on dev; on prod the checksums of all 14 result tables were identical before and after; binlog per run from ~15 MB to well under 1 MB; the hourly sync went from 197 s to 142 s.

(wo-ict.nl also had a bug here: its four wave procedures used upper-case table names and failed since the move to Linux. Yours use lower-case names and work, e.g. `vorstperiodes` holds 1,766 rows and `UpdateHistory completed.` appears every hour in `logfile`.)

## Steps

1. **The SQL**: `C:\Apps\wo-ict.nl\database\updates\updates knmi updatehistory no-op upsert 20261012.sql`. Copy it into this repo (e.g. `database/`) so it is versioned here. It uses unqualified table names, so it runs in whatever database you select: `mysql bbqweer < file`. It
   - adds `UNIQUE KEY (STATION, VOLGNR)` to `vorstperiodes`, `koudegolven`, `hittegolven`, `superhittegolven` (they have no index today; checked: no duplicate `(STATION, VOLGNR)` here),
   - recreates `UpdatePeriodeGegevens`, `UpdateNormen`, `UpdateVorstperiodes`, `UpdateKoudegolven`, `UpdateHittegolven`, `UpdateSuperHittegolven`. `UpdateHistory` is unchanged.
2. **Before**: save a rollback and checksums:
   - `mysqldump --no-create-info --no-data --routines --skip-triggers bbqweer > routines-before.sql`
   - `CHECKSUM TABLE maandgegevens, jaargegevens, decadegegevens, seizoensgegevens, dagnormen_raw, dagnormen, maandnormen, jaarnormen, decadenormen, seizoensnormen, vorstperiodes, koudegolven, hittegolven, superhittegolven;` (save the output)
3. **Apply outside the sync window.** The hourly sync runs at about :03 to :08, so apply at :10 to :55 (check `logfile` and that nothing runs in `SHOW PROCESSLIST`). Then run `CALL UpdateHistory();` once (about 1.5 minutes) and take the checksums again: **all 14 should be identical to before** (including `vorstperiodes`). If any differ, stop and compare before going on; the old procedures restore with `routines-before.sql`.
4. **After the next hourly sync has also run fine**: `DROP TABLE dagnormen_raw`, after `mysqldump bbqweer dagnormen_raw > dagnormen_raw-table.sql`. It is only the intermediate of `UpdateNormen` and now lives as a temporary table inside the procedure; nothing else references it (checked here: no views, saved reports, triggers or foreign keys). Run `CALL UpdateNormen();` once afterwards and check the `*normen` checksums are unchanged.
5. **Repo**: update `database/init/01-schema.sql` (drop `dagnormen_raw`, add the four keys, the new procedure definitions) and the `UpdateHistory` paragraph in `docs/knmi-data-sync.md` (line ~197, it still describes truncate + rebuild).
6. **Optional, later**: in `backend/tasks/knmidata-v4.js` (and v3 if still used) only call `UpdateHistory` when the sync inserted or updated something, and always on the 00:15 full sync.

## Notes

- Table names are case-sensitive here (`lower_case_table_names = 0`); the new SQL uses lower case throughout.
- Binlog retention here is 7 days (`database/mysql-binlog-expire.cnf`), wo-ict.nl uses 3 days; the binlogs are about 4.2 GB, so lowering it would also help.
- Do not use an `active` flag / mark-and-sweep instead (an older draft did): flipping a flag on every row twice per run writes more binlog than the `TRUNCATE` it replaces.
