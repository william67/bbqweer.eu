'use strict';

const https = require('https');
const mySqlPoolKnmi = require('../helpers/mysqlpool-knmi.helper');
const { taskStart, taskFinish, taskError } = require('../helpers/server-tasks');

const TASK_CODE = 'energy-prices-sync';
const SOURCE    = 'energyzero';

function fetchPrices(fromDate, tillDate) {
    return new Promise((resolve, reject) => {
        const params = new URLSearchParams({
            fromDate: fromDate + 'T00:00:00.000Z',
            tillDate: tillDate + 'T00:00:00.000Z',
            interval: '4',
            usageType: '1',
            inclBtw: 'true'
        });
        const url = `https://api.energyzero.nl/v1/energyprices?${params}`;
        https.get(url, { headers: { Accept: 'application/json' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Invalid JSON from energyzero')); }
            });
        }).on('error', reject);
    });
}

function toUtcDateHour(dateStr) {
    // dateStr is like "2024-04-23T22:00:00+02:00" — convert to UTC date + hour
    const d = new Date(dateStr);
    return {
        date: d.toISOString().slice(0, 10),
        hour: d.getUTCHours()
    };
}

async function syncEnergie() {
    const db  = mySqlPoolKnmi.promise();
    const now = new Date();

    // Fetch yesterday through day-after-tomorrow (UTC).
    // Amsterdam midnight = UTC 22:00 previous day, so yesterday UTC is needed for today's 00:00-01:00 local.
    const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
    const dayAfter  = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);

    const data = await fetchPrices(yesterday, dayAfter);
    if (!data?.Prices?.length) throw new Error('No prices returned');

    const updatedAt = now.toISOString().slice(0, 19).replace('T', ' ');
    const rows = data.Prices.map(p => {
        const { date, hour } = toUtcDateHour(p.readingDate);
        return [date, hour, p.price, SOURCE, updatedAt];
    });

    await db.query(`
        INSERT INTO energie_prices (priceDate, priceHour, priceKwh, source, updatedAt)
        VALUES ?
        ON DUPLICATE KEY UPDATE
            priceKwh  = VALUES(priceKwh),
            source    = VALUES(source),
            updatedAt = VALUES(updatedAt)
    `, [rows]);

    return rows.length;
}

module.exports = async () => {
    const t0 = Date.now();
    await taskStart(TASK_CODE);
    try {
        const count = await syncEnergie();
        const secs  = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`[${new Date().toISOString()}] energie-sync: ${count} prices upserted in ${secs}s`);
        await taskFinish(TASK_CODE, 'success', `${count} prijzen gesynchroniseerd`);
    } catch (e) {
        console.error('energie-sync error:', e.message);
        await taskError(TASK_CODE);
        await taskFinish(TASK_CODE, 'error', e.message);
    }
};
