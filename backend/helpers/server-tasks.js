'use strict';

const db = require('./mysqlpool-knmi.helper').promise();
const ntfy = require('./ntfy.helper');

// Cooldown per taskCode — tasks on tight schedules (e.g. strike-area-alerts every 15s)
// would otherwise flood the shared servererrors topic if stuck failing.
const TASK_ERROR_DEDUPE_MS = 15 * 60 * 1000;

// status: persistent services (no taskFinish, always running) pass 'active'; cron tasks leave it null.
// lastErrorAt/lastErrorMessage are deliberately not touched here, so the last error survives a restart.
async function taskStart(taskCode, progressTotal = null, status = null) {
    await db.execute(
        `UPDATE \`server-tasks\` SET isRunning=1, startedAt=UTC_TIMESTAMP(), finishedAt=NULL,
         currentProgress=0, progressTotal=?, errorCount=0, lastStatus=?, lastMessage=NULL, updatedAt=UTC_TIMESTAMP()
         WHERE taskCode=?`,
        [progressTotal, status, taskCode]
    );
}

async function taskError(taskCode, detail) {
    await db.execute(
        `UPDATE \`server-tasks\` SET errorCount=errorCount+1, lastErrorAt=UTC_TIMESTAMP(), lastErrorMessage=?,
         updatedAt=UTC_TIMESTAMP() WHERE taskCode=?`,
        [String(detail || 'fout opgetreden').slice(0, 500), taskCode]
    );
}

async function taskProgress(taskCode, currentProgress) {
    await db.execute(
        `UPDATE \`server-tasks\` SET currentProgress=?, updatedAt=UTC_TIMESTAMP() WHERE taskCode=?`,
        [currentProgress, taskCode]
    );
}

async function taskFinish(taskCode, status, message = null) {
    await db.execute(
        `UPDATE \`server-tasks\` SET isRunning=0, finishedAt=UTC_TIMESTAMP(),
         lastDurationSec=TIMESTAMPDIFF(SECOND, startedAt, UTC_TIMESTAMP()),
         currentProgress=progressTotal, lastStatus=?, lastMessage=?, updatedAt=UTC_TIMESTAMP()
         WHERE taskCode=?`,
        [status, message ? message.slice(0, 500) : null, taskCode]
    );

    if (status === 'error') {
        ntfy.sendAlert({
            topic: 'servererrors',
            key: `task-error-${taskCode}`,
            dedupeMs: TASK_ERROR_DEDUPE_MS,
            title: '🔴 bbqweer.eu — Taak fout',
            message: `${taskCode}: ${message ?? 'onbekende fout'}`,
            priority: 'high',
            tags: 'warning'
        });
    }
}

module.exports = { taskStart, taskProgress, taskFinish, taskError };
