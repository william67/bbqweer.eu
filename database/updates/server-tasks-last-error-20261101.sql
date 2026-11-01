-- server-tasks: remember the last error (time + message). taskStart() deliberately leaves these two columns alone,
-- so the last error survives a restart (errorCount does reset to 0). Apply on production BEFORE deploying the code
-- (weather-maps/maps/db.py already writes these columns). 02-extras.sql has the end state.
ALTER TABLE `server-tasks`
  ADD COLUMN `lastErrorAt` datetime DEFAULT NULL AFTER `errorCount`,
  ADD COLUMN `lastErrorMessage` varchar(500) DEFAULT NULL AFTER `lastErrorAt`;
