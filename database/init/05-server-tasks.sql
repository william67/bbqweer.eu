USE bbqweer;

INSERT IGNORE INTO `server-tasks` (taskCode, isRunning, lastStatus)
VALUES
  ('knmidata-sync',   0, 'idle'),
  ('satellites-sync', 0, 'idle');
