-- radar-maps-sync (weather-maps/maps/radar.py): status row of the radar thread. Apply BEFORE 'radar' is added to [maps] sources:
-- the service only UPDATEs the row.
INSERT IGNORE INTO `server-tasks` (taskCode, isRunning, lastStatus) VALUES ('radar-maps-sync', 0, 'idle');
