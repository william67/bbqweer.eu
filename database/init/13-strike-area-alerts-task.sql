USE bbqweer;

INSERT IGNORE INTO `server-tasks` (taskCode, isRunning, lastStatus)
VALUES
  ('strike-area-alerts', 0, 'idle');
