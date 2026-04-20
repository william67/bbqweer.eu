'use strict';

const https = require('https');
const mySqlPoolKnmi = require('../helpers/mysqlpool-knmi.helper');
const { taskStart, taskFinish, taskError, taskProgress } = require('../helpers/server-tasks');

const GROUPS = ['visual', 'weather', 'noaa'];

const TASK_CODE = 'satellites-sync';

function fetchTles(group) {
    return new Promise((resolve, reject) => {
        const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`;
        https.get(url, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function parseTles(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const records = [];
    for (let i = 0; i + 2 < lines.length; i += 3) {
        const name          = lines[i];
        const tle1          = lines[i + 1];
        const tle2          = lines[i + 2];
        if (!tle1.startsWith('1 ') || !tle2.startsWith('2 ')) continue;
        const catalogNumber = tle1.substring(2, 7).trim();
        records.push([catalogNumber, name, tle1, tle2]);
    }
    return records;
}

async function syncSatellites() {
    const db = mySqlPoolKnmi.promise();
    let totalUpserted = 0;

    for (const group of GROUPS) {
        const text    = await fetchTles(group);
        const records = parseTles(text);
        if (records.length === 0) continue;

        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const values = records.map(r => [...r, now]);

        await db.query(`
            INSERT INTO satellites (catalogNumber, name, tle1, tle2, fetchedAt)
            VALUES ?
            ON DUPLICATE KEY UPDATE
                name      = VALUES(name),
                tle1      = VALUES(tle1),
                tle2      = VALUES(tle2),
                fetchedAt = VALUES(fetchedAt)
        `, [values]);

        const groupValues = records.map(r => [r[0], group]);
        await db.query(`
            INSERT IGNORE INTO satellite_groups (catalogNumber, groupName)
            VALUES ?
        `, [groupValues]);

        totalUpserted += records.length;
        await taskProgress(TASK_CODE, totalUpserted);
    }

    return totalUpserted;
}

module.exports = async () => {
    const t0 = Date.now();
    await taskStart(TASK_CODE);
    try {
        const count = await syncSatellites();
        const secs  = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`${new Date().toISOString()} - satellites-sync: ${count} TLEs upserted in ${secs}s`, '\r\n');
        await taskFinish(TASK_CODE, 'success', `${count} TLEs synced`);
    } catch (e) {
        console.error('satellites-sync error:', e.message);
        await taskError(TASK_CODE);
        await taskFinish(TASK_CODE, 'error', e.message);
    }
};
