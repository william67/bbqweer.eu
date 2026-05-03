-- Rename DATUM_TIJD to DATUM_TIJD_VAN and add DATUM_TIJD_TOT
-- Run once on live DB after deploying new backend code

-- Step 1: rename existing column and add new one nullable
ALTER TABLE uurgeg
    CHANGE COLUMN `DATUM_TIJD` `DATUM_TIJD_VAN` datetime NOT NULL,
    ADD COLUMN `DATUM_TIJD_TOT` datetime NULL AFTER `DATUM_TIJD_VAN`;

-- Step 2: backfill (disable safe update mode for full-table update)
SET SQL_SAFE_UPDATES = 0;
UPDATE uurgeg SET DATUM_TIJD_TOT = DATE_ADD(DATUM_TIJD_VAN, INTERVAL 1 HOUR);
SET SQL_SAFE_UPDATES = 1;

-- Step 3: tighten to NOT NULL now that all rows have a value
ALTER TABLE uurgeg MODIFY COLUMN `DATUM_TIJD_TOT` datetime NOT NULL;

-- Step 4: recreate views that referenced DATUM_TIJD
-- Keep datum_tijd as alias for datum_tijd_van for backward compat with existing report queries

CREATE OR REPLACE VIEW `v_knmidata_main_hourly` AS
SELECT ug.STATION AS stationsCode, st.OMSCHRIJVING AS station,
       ug.JAAR AS jaar, ug.MAAND AS maand, ug.DECADE AS decade, ug.DAG AS dag, ug.UUR AS uur,
       ug.DATUM_TIJD_VAN AS datum_tijd, ug.DATUM_TIJD_VAN AS datum_tijd_van, ug.DATUM_TIJD_TOT AS datum_tijd_tot,
       ug.T AS t, ug.TD AS td, ug.FH AS fh, ug.P AS p, ug.SQ AS sq, ug.RH AS rh, ug.U AS u
FROM uurgeg ug JOIN stations st ON st.CODE = ug.STATION;

CREATE OR REPLACE VIEW `v_knmidata_pres_hourly` AS
SELECT ug.STATION AS stationsCode, st.OMSCHRIJVING AS station,
       ug.JAAR AS jaar, ug.MAAND AS maand, ug.DECADE AS decade, ug.DAG AS dag, ug.UUR AS uur,
       ug.DATUM_TIJD_VAN AS datum_tijd, ug.DATUM_TIJD_VAN AS datum_tijd_van, ug.DATUM_TIJD_TOT AS datum_tijd_tot,
       ug.P AS p
FROM uurgeg ug JOIN stations st ON st.CODE = ug.STATION;

CREATE OR REPLACE VIEW `v_knmidata_rain_hourly` AS
SELECT ug.STATION AS stationsCode, st.OMSCHRIJVING AS station,
       ug.JAAR AS jaar, ug.MAAND AS maand, ug.DECADE AS decade, ug.DAG AS dag, ug.UUR AS uur,
       ug.DATUM_TIJD_VAN AS datum_tijd, ug.DATUM_TIJD_VAN AS datum_tijd_van, ug.DATUM_TIJD_TOT AS datum_tijd_tot,
       ug.RH AS rh, ug.DR AS dr
FROM uurgeg ug JOIN stations st ON st.CODE = ug.STATION;

CREATE OR REPLACE VIEW `v_knmidata_sun_hourly` AS
SELECT ug.STATION AS stationsCode, st.OMSCHRIJVING AS station,
       ug.JAAR AS jaar, ug.MAAND AS maand, ug.DECADE AS decade, ug.DAG AS dag, ug.UUR AS uur,
       ug.DATUM_TIJD_VAN AS datum_tijd, ug.DATUM_TIJD_VAN AS datum_tijd_van, ug.DATUM_TIJD_TOT AS datum_tijd_tot,
       ug.SQ AS sq, ug.Q AS q
FROM uurgeg ug JOIN stations st ON st.CODE = ug.STATION;

CREATE OR REPLACE VIEW `v_knmidata_temp_hourly` AS
SELECT ug.STATION AS stationsCode, st.OMSCHRIJVING AS station,
       ug.JAAR AS jaar, ug.MAAND AS maand, ug.DECADE AS decade, ug.DAG AS dag, ug.UUR AS uur,
       ug.DATUM_TIJD_VAN AS datum_tijd, ug.DATUM_TIJD_VAN AS datum_tijd_van, ug.DATUM_TIJD_TOT AS datum_tijd_tot,
       ug.T AS t, ug.T10 AS t10, ug.TD AS td, ug.U AS u
FROM uurgeg ug JOIN stations st ON st.CODE = ug.STATION;

CREATE OR REPLACE VIEW `v_knmidata_wind_hourly` AS
SELECT ug.STATION AS stationsCode, st.OMSCHRIJVING AS station,
       ug.JAAR AS jaar, ug.MAAND AS maand, ug.DECADE AS decade, ug.DAG AS dag, ug.UUR AS uur,
       ug.DATUM_TIJD_VAN AS datum_tijd, ug.DATUM_TIJD_VAN AS datum_tijd_van, ug.DATUM_TIJD_TOT AS datum_tijd_tot,
       ug.FH AS fh, ug.FF AS ff, ug.FX AS fx
FROM uurgeg ug JOIN stations st ON st.CODE = ug.STATION;
