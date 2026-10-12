-- KNMI UpdateHistory without TRUNCATE: UpdatePeriodeGegevens and UpdateNormen only write what changed.
--
-- Why: both procedures used to TRUNCATE nine tables and re-insert every row, every hour (UpdateHistory is called
-- by each KNMI sync run), plus an UPDATE of every dagnormen_raw row to fill DOY. In the ROW binlog that is roughly
-- 300,000 row images per run, about 40% of everything the wo-ict MySQL writes to its binlog, although the result is
-- the same as an hour before. It also left the tables empty for the seconds a run lasts.
--
-- How: per table the full result is built in a TEMPORARY table (temporary tables are not binlogged in ROW format),
-- then in one transaction (a reader sees the old or the new table, never a half one):
--   INSERT ... SELECT ... ON DUPLICATE KEY UPDATE   rows that are unchanged are skipped by MySQL: 0 affected rows,
--                                                   nothing in the binlog (verified in the dev test)
--   DELETE ... LEFT JOIN                            rows that are no longer in the result (source data removed)
-- No `active` column / mark-and-sweep: flipping a flag on every row twice per run would have written about four
-- row images per row, more than the TRUNCATE it replaces. DOY is computed inside the insert.
-- dagnormen_raw (the 30-year average per calendar day, only an intermediate of UpdateNormen) is not a
-- permanent table any more: it lives as two temporary copies inside the call (MySQL cannot join one temporary
-- table with itself). When this file has run, the table can be dropped: DROP TABLE dagnormen_raw;
--
-- Needs: the composite unique keys the tables already have; key columns of etmgeg are NOT NULL (a NULL in a key
-- would make an upsert insert a duplicate every run). UpdateHistory is unchanged. UpdateVorstperiodes,
-- UpdateKoudegolven, UpdateHittegolven and UpdateSuperHittegolven keep their cursor logic and their VOLGNR
-- numbering exactly, but write into a temporary table first and then upsert + delete, so their tables are never
-- empty during a run either (they need the unique key added below).
-- Run on: the knmi schema (wo-ict.nl) / the bbqweer schema (bbqweer.eu), same table structure in both.

-- The four wave / frost tables had no index at all. The upsert needs a unique key: VOLGNR is the running number
-- of a run per station, so (STATION, VOLGNR) is unique by construction (checked: no duplicates on dev, Hetzner
-- prod and bbqweer prod).
ALTER TABLE vorstperiodes ADD UNIQUE KEY I_VORSTPERIODES (STATION, VOLGNR);
ALTER TABLE koudegolven ADD UNIQUE KEY I_KOUDEGOLVEN (STATION, VOLGNR);
ALTER TABLE hittegolven ADD UNIQUE KEY I_HITTEGOLVEN (STATION, VOLGNR);
ALTER TABLE superhittegolven ADD UNIQUE KEY I_SUPERHITTEGOLVEN (STATION, VOLGNR);

DROP PROCEDURE IF EXISTS UpdatePeriodeGegevens;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `UpdatePeriodeGegevens`()
BEGIN

   -- maandgegevens
   DROP TEMPORARY TABLE IF EXISTS tmp_maandgegevens;
   CREATE TEMPORARY TABLE tmp_maandgegevens LIKE maandgegevens;
   INSERT INTO tmp_maandgegevens(STATION, JAAR, MAAND, TG, TN, TN_AVG, TX, TX_AVG, PG, SQ, RH, Q)
        SELECT EG.STATION,
               EG.JAAR,
               EG.MAAND,
               ROUND(AVG(EG.TG), 1),
               ROUND(MIN(EG.TN), 1),
               ROUND(AVG(EG.TN), 1),
               ROUND(MAX(EG.TX), 1),
               ROUND(AVG(EG.TX), 1),
               ROUND(AVG(EG.PG), 1),
               ROUND(SUM(EG.SQ), 1),
               ROUND(SUM(EG.RH), 1),
               ROUND(SUM(EG.Q), 1)
          FROM etmgeg EG
      GROUP BY EG.STATION, EG.JAAR, EG.MAAND;

   START TRANSACTION;
   INSERT INTO maandgegevens(STATION, JAAR, MAAND, TG, TN, TN_AVG, TX, TX_AVG, PG, SQ, RH, Q)
        SELECT s.STATION, s.JAAR, s.MAAND, s.TG, s.TN, s.TN_AVG, s.TX, s.TX_AVG, s.PG, s.SQ, s.RH, s.Q
          FROM tmp_maandgegevens s
   ON DUPLICATE KEY UPDATE
      TG = s.TG,
      TN = s.TN,
      TN_AVG = s.TN_AVG,
      TX = s.TX,
      TX_AVG = s.TX_AVG,
      PG = s.PG,
      SQ = s.SQ,
      RH = s.RH,
      Q = s.Q;
   DELETE x FROM maandgegevens x LEFT JOIN tmp_maandgegevens s ON x.STATION = s.STATION AND x.JAAR = s.JAAR AND x.MAAND = s.MAAND WHERE s.STATION IS NULL;
   COMMIT;
   DROP TEMPORARY TABLE tmp_maandgegevens;

   -- jaargegevens
   DROP TEMPORARY TABLE IF EXISTS tmp_jaargegevens;
   CREATE TEMPORARY TABLE tmp_jaargegevens LIKE jaargegevens;
   INSERT INTO tmp_jaargegevens(STATION, JAAR, TG, TN, TN_AVG, TX, TX_AVG, PG, SQ, RH, Q)
        SELECT EG.STATION,
               EG.JAAR,
               ROUND(AVG(EG.TG), 1),
               ROUND(MIN(EG.TN), 1),
               ROUND(AVG(EG.TN), 1),
               ROUND(MAX(EG.TX), 1),
               ROUND(AVG(EG.TX), 1),
               ROUND(AVG(EG.PG), 1),
               ROUND(SUM(EG.SQ), 1),
               ROUND(SUM(EG.RH), 1),
               ROUND(SUM(EG.Q), 1)
          FROM etmgeg EG
      GROUP BY EG.STATION, EG.JAAR;

   START TRANSACTION;
   INSERT INTO jaargegevens(STATION, JAAR, TG, TN, TN_AVG, TX, TX_AVG, PG, SQ, RH, Q)
        SELECT s.STATION, s.JAAR, s.TG, s.TN, s.TN_AVG, s.TX, s.TX_AVG, s.PG, s.SQ, s.RH, s.Q
          FROM tmp_jaargegevens s
   ON DUPLICATE KEY UPDATE
      TG = s.TG,
      TN = s.TN,
      TN_AVG = s.TN_AVG,
      TX = s.TX,
      TX_AVG = s.TX_AVG,
      PG = s.PG,
      SQ = s.SQ,
      RH = s.RH,
      Q = s.Q;
   DELETE x FROM jaargegevens x LEFT JOIN tmp_jaargegevens s ON x.STATION = s.STATION AND x.JAAR = s.JAAR WHERE s.STATION IS NULL;
   COMMIT;
   DROP TEMPORARY TABLE tmp_jaargegevens;

   -- decadegegevens
   DROP TEMPORARY TABLE IF EXISTS tmp_decadegegevens;
   CREATE TEMPORARY TABLE tmp_decadegegevens LIKE decadegegevens;
   INSERT INTO tmp_decadegegevens(STATION, JAAR, MAAND, DECADE, TG, TN, TN_AVG, TX, TX_AVG, PG, SQ, RH, Q)
        SELECT EG.STATION,
               EG.JAAR,
               EG.MAAND,
               EG.DECADE,
               ROUND(AVG(EG.TG), 1),
               ROUND(MIN(EG.TN), 1),
               ROUND(AVG(EG.TN), 1),
               ROUND(MAX(EG.TX), 1),
               ROUND(AVG(EG.TX), 1),
               ROUND(AVG(EG.PG), 1),
               ROUND(SUM(EG.SQ), 1),
               ROUND(SUM(EG.RH), 1),
               ROUND(SUM(EG.Q), 1)
          FROM etmgeg EG
      GROUP BY EG.STATION, EG.JAAR, EG.MAAND, EG.DECADE;

   START TRANSACTION;
   INSERT INTO decadegegevens(STATION, JAAR, MAAND, DECADE, TG, TN, TN_AVG, TX, TX_AVG, PG, SQ, RH, Q)
        SELECT s.STATION, s.JAAR, s.MAAND, s.DECADE, s.TG, s.TN, s.TN_AVG, s.TX, s.TX_AVG, s.PG, s.SQ, s.RH, s.Q
          FROM tmp_decadegegevens s
   ON DUPLICATE KEY UPDATE
      TG = s.TG,
      TN = s.TN,
      TN_AVG = s.TN_AVG,
      TX = s.TX,
      TX_AVG = s.TX_AVG,
      PG = s.PG,
      SQ = s.SQ,
      RH = s.RH,
      Q = s.Q;
   DELETE x FROM decadegegevens x LEFT JOIN tmp_decadegegevens s ON x.STATION = s.STATION AND x.JAAR = s.JAAR AND x.MAAND = s.MAAND AND x.DECADE = s.DECADE WHERE s.STATION IS NULL;
   COMMIT;
   DROP TEMPORARY TABLE tmp_decadegegevens;

   -- seizoensgegevens
   DROP TEMPORARY TABLE IF EXISTS tmp_seizoensgegevens;
   CREATE TEMPORARY TABLE tmp_seizoensgegevens LIKE seizoensgegevens;
   INSERT INTO tmp_seizoensgegevens(STATION, JAAR, SEIZOEN, TG, TN, TN_AVG, TX, TX_AVG, PG, SQ, RH, Q)
        SELECT EG.STATION,
               EG.JAAR_SEIZOEN,
               EG.SEIZOEN,
               ROUND(AVG(EG.TG), 1),
               ROUND(MIN(EG.TN), 1),
               ROUND(AVG(EG.TN), 1),
               ROUND(MAX(EG.TX), 1),
               ROUND(AVG(EG.TX), 1),
               ROUND(AVG(EG.PG), 1),
               ROUND(SUM(EG.SQ), 1),
               ROUND(SUM(EG.RH), 1),
               ROUND(SUM(EG.Q), 1)
          FROM etmgeg EG
      GROUP BY EG.STATION, EG.JAAR_SEIZOEN, EG.SEIZOEN;

   START TRANSACTION;
   INSERT INTO seizoensgegevens(STATION, JAAR, SEIZOEN, TG, TN, TN_AVG, TX, TX_AVG, PG, SQ, RH, Q)
        SELECT s.STATION, s.JAAR, s.SEIZOEN, s.TG, s.TN, s.TN_AVG, s.TX, s.TX_AVG, s.PG, s.SQ, s.RH, s.Q
          FROM tmp_seizoensgegevens s
   ON DUPLICATE KEY UPDATE
      TG = s.TG,
      TN = s.TN,
      TN_AVG = s.TN_AVG,
      TX = s.TX,
      TX_AVG = s.TX_AVG,
      PG = s.PG,
      SQ = s.SQ,
      RH = s.RH,
      Q = s.Q;
   DELETE x FROM seizoensgegevens x LEFT JOIN tmp_seizoensgegevens s ON x.STATION = s.STATION AND x.JAAR = s.JAAR AND x.SEIZOEN = s.SEIZOEN WHERE s.STATION IS NULL;
   COMMIT;
   DROP TEMPORARY TABLE tmp_seizoensgegevens;
END ;;
DELIMITER ;

DROP PROCEDURE IF EXISTS UpdateNormen;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `UpdateNormen`()
BEGIN

   DECLARE vJAAR_VAN INT;
   DECLARE vJAAR_TM  INT;
   DECLARE I         INT;

   -- dagnormen_raw: 30-year average per calendar day, temporary only (DOY is computed in the insert)
   DROP TEMPORARY TABLE IF EXISTS tmp_dagnormen_raw;
   DROP TEMPORARY TABLE IF EXISTS tmp_dagnormen_raw2;
   CREATE TEMPORARY TABLE tmp_dagnormen_raw (
      STATION   smallint NOT NULL,
      DECENNIUM smallint NOT NULL,
      MAAND     tinyint  NOT NULL,
      DAG       tinyint  NOT NULL,
      DOY       smallint NOT NULL,
      TG decimal(12,2) DEFAULT NULL,
      TN decimal(12,2) DEFAULT NULL,
      TX decimal(12,2) DEFAULT NULL,
      PG decimal(12,2) DEFAULT NULL,
      SQ decimal(12,2) DEFAULT NULL,
      RH decimal(12,2) DEFAULT NULL,
      Q  decimal(12,2) DEFAULT NULL,
      PRIMARY KEY (STATION, DECENNIUM, DOY)
   );
   SET I = 0;
   WHILE I <= 2 DO
      SET vJAAR_TM  = 2000 + I * 10;
      SET vJAAR_VAN = vJAAR_TM - 29;
      INSERT INTO tmp_dagnormen_raw(STATION, DECENNIUM, DOY, MAAND, DAG, TG, TN, TX, PG, SQ, RH, Q)
           SELECT EG.STATION,
                  vJAAR_TM,
                  CASE EG.MAAND WHEN 1 THEN EG.DAG WHEN 2 THEN 31 + EG.DAG WHEN 3 THEN 60 + EG.DAG WHEN 4 THEN 91 + EG.DAG
                        WHEN 5 THEN 121 + EG.DAG WHEN 6 THEN 152 + EG.DAG WHEN 7 THEN 182 + EG.DAG WHEN 8 THEN 213 + EG.DAG
                        WHEN 9 THEN 244 + EG.DAG WHEN 10 THEN 274 + EG.DAG WHEN 11 THEN 305 + EG.DAG WHEN 12 THEN 335 + EG.DAG END,
                  EG.MAAND,
                  EG.DAG,
                  ROUND(AVG(EG.TG), 1),
                  ROUND(AVG(EG.TN), 1),
                  ROUND(AVG(EG.TX), 1),
                  ROUND(AVG(EG.PG), 1),
                  ROUND(AVG(EG.SQ), 1),
                  ROUND(AVG(EG.RH), 1),
                  ROUND(AVG(EG.Q), 1)
             FROM etmgeg EG
            WHERE EG.JAAR >= vJAAR_VAN AND EG.JAAR <= vJAAR_TM
         GROUP BY EG.STATION, EG.MAAND, EG.DAG;
      SET I = I + 1;
   END WHILE;

   -- the second copy, for the self-join in dagnormen below
   CREATE TEMPORARY TABLE tmp_dagnormen_raw2 (
      STATION   smallint NOT NULL,
      DECENNIUM smallint NOT NULL,
      MAAND     tinyint  NOT NULL,
      DAG       tinyint  NOT NULL,
      DOY       smallint NOT NULL,
      TG decimal(12,2) DEFAULT NULL,
      TN decimal(12,2) DEFAULT NULL,
      TX decimal(12,2) DEFAULT NULL,
      PG decimal(12,2) DEFAULT NULL,
      SQ decimal(12,2) DEFAULT NULL,
      RH decimal(12,2) DEFAULT NULL,
      Q  decimal(12,2) DEFAULT NULL,
      PRIMARY KEY (STATION, DECENNIUM, DOY)
   );
   INSERT INTO tmp_dagnormen_raw2 SELECT * FROM tmp_dagnormen_raw;

   -- dagnormen
   DROP TEMPORARY TABLE IF EXISTS tmp_dagnormen;
   CREATE TEMPORARY TABLE tmp_dagnormen LIKE dagnormen;
   INSERT INTO tmp_dagnormen(STATION, DECENNIUM, MAAND, DAG, TG, TN, TX, PG, SQ, RH, Q)
        SELECT dn1.STATION,
               dn1.DECENNIUM,
               dn1.MAAND,
               dn1.DAG,
               ROUND(AVG(dn2.TG), 1),
               ROUND(AVG(dn2.TN), 1),
               ROUND(AVG(dn2.TX), 1),
               ROUND(AVG(dn2.PG), 1),
               ROUND(AVG(dn2.SQ), 1),
               ROUND(AVG(dn2.RH), 1),
               ROUND(AVG(dn2.Q), 1)
          FROM tmp_dagnormen_raw dn1
                       JOIN tmp_dagnormen_raw2 dn2 ON dn2.STATION = dn1.STATION AND dn2.DECENNIUM = dn1.DECENNIUM
                                             AND (
                                                   dn2.DOY BETWEEN dn1.DOY - 3 AND dn1.DOY + 3
                                                OR dn2.DOY BETWEEN (dn1.DOY - 3 + 366) AND 366
                                                OR dn2.DOY BETWEEN 1 AND (dn1.DOY + 3 - 366)
                                                )
      GROUP BY dn1.STATION, dn1.DECENNIUM, dn1.MAAND, dn1.DAG;

   START TRANSACTION;
   INSERT INTO dagnormen(STATION, DECENNIUM, MAAND, DAG, TG, TN, TX, PG, SQ, RH, Q)
        SELECT s.STATION, s.DECENNIUM, s.MAAND, s.DAG, s.TG, s.TN, s.TX, s.PG, s.SQ, s.RH, s.Q
          FROM tmp_dagnormen s
   ON DUPLICATE KEY UPDATE
      TG = s.TG,
      TN = s.TN,
      TX = s.TX,
      PG = s.PG,
      SQ = s.SQ,
      RH = s.RH,
      Q = s.Q;
   DELETE x FROM dagnormen x LEFT JOIN tmp_dagnormen s ON x.STATION = s.STATION AND x.DECENNIUM = s.DECENNIUM AND x.MAAND = s.MAAND AND x.DAG = s.DAG WHERE s.STATION IS NULL;
   COMMIT;
   DROP TEMPORARY TABLE tmp_dagnormen;

   DROP TEMPORARY TABLE tmp_dagnormen_raw;
   DROP TEMPORARY TABLE tmp_dagnormen_raw2;

   -- maandnormen
   DROP TEMPORARY TABLE IF EXISTS tmp_maandnormen;
   CREATE TEMPORARY TABLE tmp_maandnormen LIKE maandnormen;
   SET I = 0;
   WHILE I <= 2 DO
      SET vJAAR_TM  = 2000 + I * 10;
      SET vJAAR_VAN = vJAAR_TM - 29;
      INSERT INTO tmp_maandnormen(STATION, DECENNIUM, MAAND, TG, TN, TX, PG, SQ, RH, Q)
           SELECT MG.STATION,
                  vJAAR_TM,
                  MG.MAAND,
                  ROUND(AVG(MG.TG), 1),
                  ROUND(AVG(MG.TN_AVG), 1),
                  ROUND(AVG(MG.TX_AVG), 1),
                  ROUND(AVG(MG.PG), 1),
                  ROUND(AVG(MG.SQ), 1),
                  ROUND(AVG(MG.RH), 1),
                  ROUND(AVG(MG.Q), 1)
             FROM maandgegevens MG
            WHERE MG.JAAR >= vJAAR_VAN AND MG.JAAR <= vJAAR_TM
         GROUP BY MG.STATION, MG.MAAND;
      SET I = I + 1;
   END WHILE;

   START TRANSACTION;
   INSERT INTO maandnormen(STATION, DECENNIUM, MAAND, TG, TN, TX, PG, SQ, RH, Q)
        SELECT s.STATION, s.DECENNIUM, s.MAAND, s.TG, s.TN, s.TX, s.PG, s.SQ, s.RH, s.Q
          FROM tmp_maandnormen s
   ON DUPLICATE KEY UPDATE
      TG = s.TG,
      TN = s.TN,
      TX = s.TX,
      PG = s.PG,
      SQ = s.SQ,
      RH = s.RH,
      Q = s.Q;
   DELETE x FROM maandnormen x LEFT JOIN tmp_maandnormen s ON x.STATION = s.STATION AND x.DECENNIUM = s.DECENNIUM AND x.MAAND = s.MAAND WHERE s.STATION IS NULL;
   COMMIT;
   DROP TEMPORARY TABLE tmp_maandnormen;

   -- jaarnormen
   DROP TEMPORARY TABLE IF EXISTS tmp_jaarnormen;
   CREATE TEMPORARY TABLE tmp_jaarnormen LIKE jaarnormen;
   SET I = 0;
   WHILE I <= 2 DO
      SET vJAAR_TM  = 2000 + I * 10;
      SET vJAAR_VAN = vJAAR_TM - 29;
      INSERT INTO tmp_jaarnormen(STATION, DECENNIUM, TG, TN, TX, PG, SQ, RH, Q)
           SELECT JG.STATION,
                  vJAAR_TM,
                  ROUND(AVG(JG.TG), 1),
                  ROUND(AVG(JG.TN_AVG), 1),
                  ROUND(AVG(JG.TX_AVG), 1),
                  ROUND(AVG(JG.PG), 1),
                  ROUND(AVG(JG.SQ), 1),
                  ROUND(AVG(JG.RH), 1),
                  ROUND(AVG(JG.Q), 1)
             FROM jaargegevens JG
            WHERE JG.JAAR >= vJAAR_VAN AND JG.JAAR <= vJAAR_TM
         GROUP BY JG.STATION;
      SET I = I + 1;
   END WHILE;

   START TRANSACTION;
   INSERT INTO jaarnormen(STATION, DECENNIUM, TG, TN, TX, PG, SQ, RH, Q)
        SELECT s.STATION, s.DECENNIUM, s.TG, s.TN, s.TX, s.PG, s.SQ, s.RH, s.Q
          FROM tmp_jaarnormen s
   ON DUPLICATE KEY UPDATE
      TG = s.TG,
      TN = s.TN,
      TX = s.TX,
      PG = s.PG,
      SQ = s.SQ,
      RH = s.RH,
      Q = s.Q;
   DELETE x FROM jaarnormen x LEFT JOIN tmp_jaarnormen s ON x.STATION = s.STATION AND x.DECENNIUM = s.DECENNIUM WHERE s.STATION IS NULL;
   COMMIT;
   DROP TEMPORARY TABLE tmp_jaarnormen;

   -- decadenormen
   DROP TEMPORARY TABLE IF EXISTS tmp_decadenormen;
   CREATE TEMPORARY TABLE tmp_decadenormen LIKE decadenormen;
   SET I = 0;
   WHILE I <= 2 DO
      SET vJAAR_TM  = 2000 + I * 10;
      SET vJAAR_VAN = vJAAR_TM - 29;
      INSERT INTO tmp_decadenormen(STATION, DECENNIUM, MAAND, DECADE, TG, TN, TX, PG, SQ, RH, Q)
           SELECT DG.STATION,
                  vJAAR_TM,
                  DG.MAAND,
                  DG.DECADE,
                  ROUND(AVG(DG.TG), 1),
                  ROUND(AVG(DG.TN_AVG), 1),
                  ROUND(AVG(DG.TX_AVG), 1),
                  ROUND(AVG(DG.PG), 1),
                  ROUND(AVG(DG.SQ), 1),
                  ROUND(AVG(DG.RH), 1),
                  ROUND(AVG(DG.Q), 1)
             FROM decadegegevens DG
            WHERE DG.JAAR >= vJAAR_VAN AND DG.JAAR <= vJAAR_TM
         GROUP BY DG.STATION, DG.MAAND, DG.DECADE;
      SET I = I + 1;
   END WHILE;

   START TRANSACTION;
   INSERT INTO decadenormen(STATION, DECENNIUM, MAAND, DECADE, TG, TN, TX, PG, SQ, RH, Q)
        SELECT s.STATION, s.DECENNIUM, s.MAAND, s.DECADE, s.TG, s.TN, s.TX, s.PG, s.SQ, s.RH, s.Q
          FROM tmp_decadenormen s
   ON DUPLICATE KEY UPDATE
      TG = s.TG,
      TN = s.TN,
      TX = s.TX,
      PG = s.PG,
      SQ = s.SQ,
      RH = s.RH,
      Q = s.Q;
   DELETE x FROM decadenormen x LEFT JOIN tmp_decadenormen s ON x.STATION = s.STATION AND x.DECENNIUM = s.DECENNIUM AND x.MAAND = s.MAAND AND x.DECADE = s.DECADE WHERE s.STATION IS NULL;
   COMMIT;
   DROP TEMPORARY TABLE tmp_decadenormen;

   -- seizoensnormen
   DROP TEMPORARY TABLE IF EXISTS tmp_seizoensnormen;
   CREATE TEMPORARY TABLE tmp_seizoensnormen LIKE seizoensnormen;
   SET I = 0;
   WHILE I <= 2 DO
      SET vJAAR_TM  = 2000 + I * 10;
      SET vJAAR_VAN = vJAAR_TM - 29;
      INSERT INTO tmp_seizoensnormen(STATION, DECENNIUM, SEIZOEN, TG, TN, TX, PG, SQ, RH, Q)
           SELECT SG.STATION,
                  vJAAR_TM,
                  SG.SEIZOEN,
                  ROUND(AVG(SG.TG), 1),
                  ROUND(AVG(SG.TN_AVG), 1),
                  ROUND(AVG(SG.TX_AVG), 1),
                  ROUND(AVG(SG.PG), 1),
                  ROUND(AVG(SG.SQ), 1),
                  ROUND(AVG(SG.RH), 1),
                  ROUND(AVG(SG.Q), 1)
             FROM seizoensgegevens SG
            WHERE SG.JAAR >= vJAAR_VAN AND SG.JAAR <= vJAAR_TM
         GROUP BY SG.STATION, SG.SEIZOEN;
      SET I = I + 1;
   END WHILE;

   START TRANSACTION;
   INSERT INTO seizoensnormen(STATION, DECENNIUM, SEIZOEN, TG, TN, TX, PG, SQ, RH, Q)
        SELECT s.STATION, s.DECENNIUM, s.SEIZOEN, s.TG, s.TN, s.TX, s.PG, s.SQ, s.RH, s.Q
          FROM tmp_seizoensnormen s
   ON DUPLICATE KEY UPDATE
      TG = s.TG,
      TN = s.TN,
      TX = s.TX,
      PG = s.PG,
      SQ = s.SQ,
      RH = s.RH,
      Q = s.Q;
   DELETE x FROM seizoensnormen x LEFT JOIN tmp_seizoensnormen s ON x.STATION = s.STATION AND x.DECENNIUM = s.DECENNIUM AND x.SEIZOEN = s.SEIZOEN WHERE s.STATION IS NULL;
   COMMIT;
   DROP TEMPORARY TABLE tmp_seizoensnormen;
END ;;
DELIMITER ;

DROP PROCEDURE IF EXISTS UpdateVorstperiodes;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `UpdateVorstperiodes`()
BEGIN

   DECLARE v_finished                                          INTEGER DEFAULT 0;
   DECLARE v_firstrecord                                       INTEGER DEFAULT 0;
   DECLARE vVORIGESTATION, vSTATION, vVOLGNR, vTELLER          INTEGER;
   DECLARE vVORIGEDATUM, vVANDAAG, vGISTEREN, vBEGIN, vEINDE   DATE;
   DECLARE vHELLMANN, vTG                                      DOUBLE;

   DECLARE C1 CURSOR FOR
                SELECT EG.STATION, EG.DATUM, EG.DATUM - INTERVAL 1 DAY AS GISTEREN, EG.TG
                  FROM etmgeg EG
                 WHERE EG.TG < 0
              ORDER BY EG.STATION, EG.DATUM;
   DECLARE CONTINUE HANDLER FOR NOT FOUND
   SET v_finished = 1;

   DROP TEMPORARY TABLE IF EXISTS tmp_vorstperiodes;
   CREATE TEMPORARY TABLE tmp_vorstperiodes LIKE vorstperiodes;

   SET vVORIGESTATION = 0;
   SET vVOLGNR = 0;
   SET vVORIGEDATUM = STR_TO_DATE("1899-12-31", "%Y-%m-%d");
   SET v_firstrecord = 1;
   SET vTELLER = 0;

   OPEN C1;

  GET_VORSTPERIODES:
   LOOP
      FETCH C1 INTO vSTATION, vVANDAAG, vGISTEREN, vTG;

      IF v_finished = 1
      THEN
         LEAVE GET_VORSTPERIODES;
      END IF;

      IF (v_firstrecord = 1) OR ((vSTATION = vVORIGESTATION) AND (vGISTEREN = vVORIGEDATUM))
      THEN
         SET vTELLER = vTELLER + 1;
         SET vEINDE = vVANDAAG;
         SET vHELLMANN = vHELLMANN - vTG;
      ELSE
         IF (vTELLER >= 5) AND (vHELLMANN >= 16)
         THEN
            SET vVOLGNR = vVOLGNR + 1;

            INSERT INTO tmp_vorstperiodes(STATION, VOLGNR, BEGIN, EINDE, DAGEN, HELLMANN) VALUES (vVORIGESTATION, vVOLGNR, vBEGIN, vEINDE, vTELLER, vHELLMANN);
         END IF;

         IF (vSTATION <> vVORIGESTATION) THEN 
           SET vVOLGNR = 0;
         END IF;

         SET vTELLER = 1;
         SET vBEGIN = vVANDAAG;
         SET vHELLMANN = -vTG;
         
      END IF;

      SET v_firstrecord = 0;
      SET vVORIGEDATUM = vVANDAAG;
      SET vVORIGESTATION = vSTATION;
      
   END LOOP GET_VORSTPERIODES;

   CLOSE C1;

   IF (vTELLER >= 5) AND (vHELLMANN >= 16)
   THEN
      SET vVOLGNR = vVOLGNR + 1;

      INSERT INTO tmp_vorstperiodes(STATION, VOLGNR, BEGIN, EINDE, DAGEN, HELLMANN) VALUES (vSTATION, vVOLGNR, vBEGIN, vEINDE, vTELLER, vHELLMANN);
   END IF;

   -- write the result: upsert what is new or changed, delete what is no longer there (the table is never empty)
   START TRANSACTION;
   INSERT INTO vorstperiodes(`STATION`, `VOLGNR`, `BEGIN`, `EINDE`, `DAGEN`, `HELLMANN`)
        SELECT s.`STATION`, s.`VOLGNR`, s.`BEGIN`, s.`EINDE`, s.`DAGEN`, s.`HELLMANN`
          FROM tmp_vorstperiodes s
   ON DUPLICATE KEY UPDATE
      `BEGIN` = s.`BEGIN`,
      `EINDE` = s.`EINDE`,
      `DAGEN` = s.`DAGEN`,
      `HELLMANN` = s.`HELLMANN`;
   DELETE x FROM vorstperiodes x LEFT JOIN tmp_vorstperiodes s ON x.STATION = s.STATION AND x.VOLGNR = s.VOLGNR WHERE s.STATION IS NULL;
   COMMIT;
   DROP TEMPORARY TABLE tmp_vorstperiodes;
END ;;
DELIMITER ;

DROP PROCEDURE IF EXISTS UpdateKoudegolven;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `UpdateKoudegolven`()
BEGIN

   DECLARE v_finished                                          INTEGER DEFAULT 0;
   DECLARE v_firstrecord                                       INTEGER DEFAULT 0;
   DECLARE vVORIGESTATION, vSTATION, vVOLGNR, vTELLER, vSVD    INTEGER;
   DECLARE vVORIGEDATUM, vVANDAAG, vGISTEREN, vBEGIN, vEINDE   DATE;
   DECLARE vHELLMANN, vTG, vTN, vMIN                           DOUBLE;

   DECLARE C2 CURSOR FOR
                SELECT EG.STATION,
                       EG.DATUM,
                       EG.DATUM - INTERVAL 1 DAY AS GISTEREN,
                       EG.TG,
                       EG.TN
                  FROM etmgeg EG
                 WHERE EG.TX < 0
              ORDER BY EG.STATION, EG.DATUM;

   DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_finished = 1;

   DROP TEMPORARY TABLE IF EXISTS tmp_koudegolven;
   CREATE TEMPORARY TABLE tmp_koudegolven LIKE koudegolven;

   SET vVORIGESTATION = 0;
   SET vVOLGNR = 0;
   SET vVORIGEDATUM = STR_TO_DATE("1899-12-31", "%Y-%m-%d");
   SET v_firstrecord = 1;
   SET vTELLER = 0;
   SET vSVD = 0;

   OPEN C2;

  GET_KOUDEGOLVEN:
   LOOP
      FETCH C2
         INTO vSTATION, vVANDAAG, vGISTEREN, vTG, vTN;

      IF v_finished = 1
      THEN
         LEAVE GET_KOUDEGOLVEN;
      END IF;

      IF (v_firstrecord = 1) OR ((vSTATION = vVORIGESTATION) AND (vGISTEREN = vVORIGEDATUM))
      THEN
         SET vTELLER = vTELLER + 1;
         SET vEINDE = vVANDAAG;
         SET vHELLMANN = vHELLMANN - vTG;

         IF (vTN < vMIN)
         THEN
            SET vMIN = vTN;
         END IF;

         IF (vTN < -10)
         THEN
            SET vSVD = vSVD + 1;
         END IF;
      ELSE
         IF (vTELLER >= 5) AND (vSVD >= 3)
         THEN
            SET vVOLGNR = vVOLGNR + 1;

            INSERT INTO tmp_koudegolven(STATION, VOLGNR, BEGIN, EINDE, DAGEN, STRENG, TMIN, HELLMANN) VALUES (vVORIGESTATION, vVOLGNR, vBEGIN, vEINDE, vTELLER, vSVD, vMIN, vHELLMANN);
         END IF;

         IF (vSTATION <> vVORIGESTATION) THEN 
           SET vVOLGNR = 0;
         END IF;

         SET vTELLER = 1;
         SET vBEGIN = vVANDAAG;
         SET vHELLMANN = -vTG;
         SET vMIN = vTN;

         IF (vTN < -10)
         THEN
            SET vSVD = 1;
         ELSE
            SET vSVD = 0;
         END IF;
      END IF;

      SET v_firstrecord = 0;
      SET vVORIGEDATUM = vVANDAAG;
      SET vVORIGESTATION = vSTATION;
      
   END LOOP GET_KOUDEGOLVEN;

   CLOSE C2;

   IF (vTELLER >= 5) AND (vSVD >= 3)
   THEN
      SET vVOLGNR = vVOLGNR + 1;

      INSERT INTO tmp_koudegolven(STATION, VOLGNR, BEGIN, EINDE, DAGEN, STRENG, TMIN, HELLMANN) VALUES (vSTATION, vVOLGNR, vBEGIN, vEINDE, vTELLER, vSVD, vMIN, vHELLMANN);
   END IF;

   -- write the result: upsert what is new or changed, delete what is no longer there (the table is never empty)
   START TRANSACTION;
   INSERT INTO koudegolven(`STATION`, `VOLGNR`, `BEGIN`, `EINDE`, `DAGEN`, `STRENG`, `TMIN`, `HELLMANN`)
        SELECT s.`STATION`, s.`VOLGNR`, s.`BEGIN`, s.`EINDE`, s.`DAGEN`, s.`STRENG`, s.`TMIN`, s.`HELLMANN`
          FROM tmp_koudegolven s
   ON DUPLICATE KEY UPDATE
      `BEGIN` = s.`BEGIN`,
      `EINDE` = s.`EINDE`,
      `DAGEN` = s.`DAGEN`,
      `STRENG` = s.`STRENG`,
      `TMIN` = s.`TMIN`,
      `HELLMANN` = s.`HELLMANN`;
   DELETE x FROM koudegolven x LEFT JOIN tmp_koudegolven s ON x.STATION = s.STATION AND x.VOLGNR = s.VOLGNR WHERE s.STATION IS NULL;
   COMMIT;
   DROP TEMPORARY TABLE tmp_koudegolven;
END ;;
DELIMITER ;

DROP PROCEDURE IF EXISTS UpdateHittegolven;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `UpdateHittegolven`()
BEGIN

   DECLARE v_finished 										   INTEGER DEFAULT 0;
   DECLARE v_firstrecord                                       INTEGER DEFAULT 0;
   DECLARE vVORIGESTATION, vSTATION, vVOLGNR, vTELLER, vTD     INTEGER;
   DECLARE vVORIGEDATUM, vVANDAAG, vGISTEREN, vBEGIN, vEINDE   DATE;
   DECLARE vTG, vTX, vMAX                                      DOUBLE;

   DECLARE C3 CURSOR FOR
                SELECT EG.STATION,
                       EG.DATUM,
                       EG.DATUM - INTERVAL 1 DAY AS GISTEREN,
                       EG.TG,
                       EG.TX
                  FROM etmgeg EG
                 WHERE EG.TX >= 25
              ORDER BY EG.STATION, EG.DATUM;
   
   DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_finished = 1;

   DROP TEMPORARY TABLE IF EXISTS tmp_hittegolven;
   CREATE TEMPORARY TABLE tmp_hittegolven LIKE hittegolven;

   SET vVORIGESTATION = 0;
   SET vVOLGNR = 0;
   SET vVORIGEDATUM = STR_TO_DATE("1899-12-31", "%Y-%m-%d");
   SET v_firstrecord = 1;
   SET vTELLER = 0;
   SET vTD = 0;

   OPEN C3;

  GET_HITTEGOLVEN: LOOP

      FETCH C3 INTO vSTATION, vVANDAAG, vGISTEREN, vTG, vTX;

      IF v_finished = 1 THEN 
        LEAVE GET_HITTEGOLVEN;
      END IF;

      IF (v_firstrecord = 1) OR ((vSTATION = vVORIGESTATION) AND (vGISTEREN = vVORIGEDATUM))
      THEN
         SET vTELLER = vTELLER + 1;
         SET vEINDE = vVANDAAG;

         IF (vTX > vMAX)
         THEN
            SET vMAX = vTX;
         END IF;

         IF (vTX >= 30)
         THEN
            SET vTD = vTD + 1;
         END IF;
      ELSE
         IF (vTELLER >= 5) AND (vTD >= 3)
         THEN
            SET vVOLGNR = vVOLGNR + 1;

            INSERT INTO tmp_hittegolven(STATION, VOLGNR, BEGIN, EINDE, DAGEN, TROPISCH, TMAX) VALUES (vVORIGESTATION, vVOLGNR, vBEGIN, vEINDE, vTELLER, vTD, vMAX);
         END IF;

         IF (vSTATION <> vVORIGESTATION) THEN 
           SET vVOLGNR = 0;
         END IF;
         
         SET vTELLER = 1;
         SET vBEGIN = vVANDAAG;
         SET vMAX = vTX;

         IF (vTX >= 30)
         THEN
            SET vTD = 1;
         ELSE
            SET vTD = 0;
         END IF;
      END IF;

      SET v_firstrecord = 0;
      SET vVORIGEDATUM = vVANDAAG;
      SET vVORIGESTATION = vSTATION;
      
   END LOOP GET_HITTEGOLVEN;

   CLOSE C3;

   IF (vTELLER >= 5) AND (vTD >= 3)
   THEN
      SET vVOLGNR = vVOLGNR + 1;

      INSERT INTO tmp_hittegolven(STATION, VOLGNR, BEGIN, EINDE, DAGEN, TROPISCH, TMAX) VALUES (vSTATION, vVOLGNR, vBEGIN, vEINDE, vTELLER, vTD, vMAX);
   END IF;

   -- write the result: upsert what is new or changed, delete what is no longer there (the table is never empty)
   START TRANSACTION;
   INSERT INTO hittegolven(`STATION`, `VOLGNR`, `BEGIN`, `EINDE`, `DAGEN`, `TROPISCH`, `TMAX`)
        SELECT s.`STATION`, s.`VOLGNR`, s.`BEGIN`, s.`EINDE`, s.`DAGEN`, s.`TROPISCH`, s.`TMAX`
          FROM tmp_hittegolven s
   ON DUPLICATE KEY UPDATE
      `BEGIN` = s.`BEGIN`,
      `EINDE` = s.`EINDE`,
      `DAGEN` = s.`DAGEN`,
      `TROPISCH` = s.`TROPISCH`,
      `TMAX` = s.`TMAX`;
   DELETE x FROM hittegolven x LEFT JOIN tmp_hittegolven s ON x.STATION = s.STATION AND x.VOLGNR = s.VOLGNR WHERE s.STATION IS NULL;
   COMMIT;
   DROP TEMPORARY TABLE tmp_hittegolven;
END ;;
DELIMITER ;

DROP PROCEDURE IF EXISTS UpdateSuperHittegolven;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `UpdateSuperHittegolven`()
BEGIN

   DECLARE v_finished 										   INTEGER DEFAULT 0;
   DECLARE v_firstrecord                                       INTEGER DEFAULT 0;
   DECLARE vVORIGESTATION, vSTATION, vVOLGNR, vTELLER, vSTD     INTEGER;
   DECLARE vVORIGEDATUM, vVANDAAG, vGISTEREN, vBEGIN, vEINDE   DATE;
   DECLARE vTG, vTX, vMAX                                      DOUBLE;

   DECLARE C3 CURSOR FOR
                SELECT EG.STATION,
                       EG.DATUM,
                       EG.DATUM - INTERVAL 1 DAY AS GISTEREN,
                       EG.TG,
                       EG.TX
                  FROM etmgeg EG
                 WHERE EG.TX >= 30
              ORDER BY EG.STATION, EG.DATUM;
   
   DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_finished = 1;

   DROP TEMPORARY TABLE IF EXISTS tmp_superhittegolven;
   CREATE TEMPORARY TABLE tmp_superhittegolven LIKE superhittegolven;

   SET vVORIGESTATION = 0;
   SET vVOLGNR = 0;
   SET vVORIGEDATUM = STR_TO_DATE("1899-12-31", "%Y-%m-%d");
   SET v_firstrecord = 1;
   SET vTELLER = 0;
   SET vSTD = 0;

   OPEN C3;

  GET_HITTEGOLVEN: LOOP

      FETCH C3 INTO vSTATION, vVANDAAG, vGISTEREN, vTG, vTX;

      IF v_finished = 1 THEN 
        LEAVE GET_HITTEGOLVEN;
      END IF;

      IF (v_firstrecord = 1) OR ((vSTATION = vVORIGESTATION) AND (vGISTEREN = vVORIGEDATUM))
      THEN
         SET vTELLER = vTELLER + 1;
         SET vEINDE = vVANDAAG;

         IF (vTX > vMAX)
         THEN
            SET vMAX = vTX;
         END IF;

         IF (vTX >= 35)
         THEN
            SET vSTD = vSTD + 1;
         END IF;
      ELSE
         IF (vTELLER >= 5) AND (vSTD >= 3)
         THEN
            SET vVOLGNR = vVOLGNR + 1;

            INSERT INTO tmp_superhittegolven(STATION, VOLGNR, BEGIN, EINDE, DAGEN, SUPERTROPISCH, TMAX) VALUES (vVORIGESTATION, vVOLGNR, vBEGIN, vEINDE, vTELLER, vSTD, vMAX);
         END IF;

         IF (vSTATION <> vVORIGESTATION) THEN 
           SET vVOLGNR = 0;
         END IF;

         SET vTELLER = 1;
         SET vBEGIN = vVANDAAG;
         SET vMAX = vTX;

         IF (vTX >= 35)
         THEN
            SET vSTD = 1;
         ELSE
            SET vSTD = 0;
         END IF;
      END IF;

      SET v_firstrecord = 0;
      SET vVORIGEDATUM = vVANDAAG;
      SET vVORIGESTATION = vSTATION;
      
   END LOOP GET_HITTEGOLVEN;

   CLOSE C3;

   IF (vTELLER >= 5) AND (vSTD >= 3)
   THEN
      SET vVOLGNR = vVOLGNR + 1;

      INSERT INTO tmp_superhittegolven(STATION, VOLGNR, BEGIN, EINDE, DAGEN, SUPERTROPISCH, TMAX) VALUES (vSTATION, vVOLGNR, vBEGIN, vEINDE, vTELLER, vSTD, vMAX);
   END IF;

   -- write the result: upsert what is new or changed, delete what is no longer there (the table is never empty)
   START TRANSACTION;
   INSERT INTO superhittegolven(`STATION`, `VOLGNR`, `BEGIN`, `EINDE`, `DAGEN`, `SUPERTROPISCH`, `TMAX`)
        SELECT s.`STATION`, s.`VOLGNR`, s.`BEGIN`, s.`EINDE`, s.`DAGEN`, s.`SUPERTROPISCH`, s.`TMAX`
          FROM tmp_superhittegolven s
   ON DUPLICATE KEY UPDATE
      `BEGIN` = s.`BEGIN`,
      `EINDE` = s.`EINDE`,
      `DAGEN` = s.`DAGEN`,
      `SUPERTROPISCH` = s.`SUPERTROPISCH`,
      `TMAX` = s.`TMAX`;
   DELETE x FROM superhittegolven x LEFT JOIN tmp_superhittegolven s ON x.STATION = s.STATION AND x.VOLGNR = s.VOLGNR WHERE s.STATION IS NULL;
   COMMIT;
   DROP TEMPORARY TABLE tmp_superhittegolven;
END ;;
DELIMITER ;
