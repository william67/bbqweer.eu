-- Rename to match wo-ict.nl's naming convention for always-running WSS/Redis
-- listeners (backend/server-monitoring.md dev-standard: "-service" suffix,
-- named after the data source, e.g. wo-ict.nl's own "blitzortung-service").
-- UPDATE (not INSERT IGNORE) to preserve the existing row's history
-- (errorCount, startedAt, etc.) rather than starting a fresh row.
UPDATE `server-tasks` SET taskCode = 'blitzortung-service' WHERE taskCode = 'lightning-service';
