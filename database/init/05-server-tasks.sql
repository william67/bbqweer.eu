USE bbqweer;

INSERT IGNORE INTO `server-tasks` (taskCode, isRunning, lastStatus)
VALUES
  ('knmidata-sync',        0, 'idle'),
  ('satellites-sync',      0, 'idle'),
  ('file-area-incidents',  0, 'idle'),
  ('lightning-service',    0, 'idle'),
  ('tomtom-incidents-sync', 0, 'idle');
