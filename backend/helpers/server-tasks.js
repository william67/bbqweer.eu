'use strict';

const db = require('./mysqlpool-knmi.helper').promise();

async function taskStart(taskCode, progressTotal = null) {
    await db.execute(
        `UPDATE \`server-tasks\` SET isRunning=1, startedAt=UTC_TIMESTAMP(), finishedAt=NULL,
         currentProgress=0, progressTotal=?, errorCount=0, lastStatus=NULL, lastMessage=NULL, updatedAt=UTC_TIMESTAMP()
         WHERE taskCode=?`,
        [progressTotal, taskCode]
    );
}

async function taskError(taskCode) {
    await db.execute(
        `UPDATE \`server-tasks\` SET errorCount=errorCount+1, updatedAt=UTC_TIMESTAMP() WHERE taskCode=?`,
        [taskCode]
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
}

module.exports = { taskStart, taskProgress, taskFinish, taskError };
