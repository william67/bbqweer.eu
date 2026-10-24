import logging
from contextlib import closing

import pymysql

log = logging.getLogger('maps.db')

TASK_CODE = 'weather-maps-sync'


class TaskStatus:
    """The server-tasks status row of this service (same columns the Node bridges use, seeded by
    database/updates/weather-maps-sync-task-20261024.sql). One short-lived connection per call: it is
    written a few times per round, so no pool. A MySQL problem must never stop the sync, so every call swallows errors."""

    def __init__(self, cfg):
        if not cfg.has_section('mysql'):
            self.params = None
            return
        self.params = dict(
            host=cfg.get('mysql', 'host'),
            port=int(cfg.get('mysql', 'port', fallback='3306')),
            user=cfg.get('mysql', 'user'),
            password=cfg.get('mysql', 'password'),
            database=cfg.get('mysql', 'database'),
            charset='utf8mb4', connect_timeout=5, read_timeout=10, write_timeout=10, autocommit=True,
        )

    def _run(self, sql, args=()):
        if not self.params:
            return
        try:
            with closing(pymysql.connect(**self.params)) as conn:
                with conn.cursor() as cur:
                    cur.execute(sql, args)
        except Exception as e:
            log.warning('task status not written: %s', e)

    def start(self, total):
        self._run('UPDATE `server-tasks` SET isRunning=1, startedAt=UTC_TIMESTAMP(), finishedAt=NULL, currentProgress=0, '
                  'progressTotal=%s, errorCount=0, lastStatus=NULL, lastMessage=NULL, updatedAt=UTC_TIMESTAMP() '
                  'WHERE taskCode=%s', (total, TASK_CODE))

    def progress(self, current, total, message):
        self._run('UPDATE `server-tasks` SET currentProgress=%s, progressTotal=%s, lastMessage=%s, updatedAt=UTC_TIMESTAMP() '
                  'WHERE taskCode=%s', (current, total, message[:500], TASK_CODE))

    def error(self):
        self._run('UPDATE `server-tasks` SET errorCount=errorCount+1, updatedAt=UTC_TIMESTAMP() WHERE taskCode=%s',
                  (TASK_CODE,))

    def finish(self, status, message):
        """End of a round: same columns as taskFinish() in the backend helper."""
        self._run('UPDATE `server-tasks` SET isRunning=0, finishedAt=UTC_TIMESTAMP(), '
                  'lastDurationSec=TIMESTAMPDIFF(SECOND, startedAt, UTC_TIMESTAMP()), currentProgress=progressTotal, '
                  'lastStatus=%s, lastMessage=%s, updatedAt=UTC_TIMESTAMP() WHERE taskCode=%s',
                  (status, message[:500], TASK_CODE))

    def stopped(self):
        """The service was stopped in the middle of a round (container restart): do not leave the row on running."""
        self._run('UPDATE `server-tasks` SET isRunning=0, finishedAt=UTC_TIMESTAMP(), lastMessage=%s, '
                  'updatedAt=UTC_TIMESTAMP() WHERE taskCode=%s', ('stopped (container restart)', TASK_CODE))
