-- Status row for the weather-maps sync service. Run on databases that already exist (01-05 init scripts only run on a fresh volume).
INSERT IGNORE INTO `server-tasks` (taskCode, isRunning, lastStatus) VALUES ('weather-maps-sync', 0, 'idle');
