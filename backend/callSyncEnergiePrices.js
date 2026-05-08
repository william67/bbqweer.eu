'use strict';

// Sync energy prices from energyzero.nl.
// Usage:
//   node callSyncEnergiePrices.js              (yesterday → tomorrow, same as cron)
//   node callSyncEnergiePrices.js 2025-01-01   (historical from date → tomorrow, month by month)

const https         = require('https');
const mySqlPoolKnmi = require('./helpers/mysqlpool-knmi.helper');

const SOURCE = 'energyzero';

function fetchPrices(fromDate, tillDate) {
    return new Promise((resolve, reject) => {
        const params = new URLSearchParams({
            fromDate:  fromDate + 'T00:00:00.000Z',
            tillDate:  tillDate + 'T00:00:00.000Z',
            interval:  '4',
            usageType: '1',
            inclBtw:   'true'
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
    const d = new Date(dateStr);
    return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

function addMonths(dateStr, months) {
    const d = new Date(dateStr);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
}

async function upsert(db, prices) {
    const updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const rows = prices.map(p => {
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

async function run() {
    const fromArg  = process.argv[2];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const today    = new Date().toISOString().slice(0, 10);
    const db       = mySqlPoolKnmi.promise();

    if (fromArg) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fromArg)) {
            console.error('Usage: node callSyncEnergiePrices.js [YYYY-MM-DD]');
            process.exit(1);
        }

        console.log(`[callSyncEnergiePrices] Historical sync from ${fromArg} to ${tomorrow}`);
        let cursor = fromArg;
        let total  = 0;

        while (cursor <= today) {
            const chunkEnd = addMonths(cursor, 1) <= tomorrow ? addMonths(cursor, 1) : tomorrow;
            process.stdout.write(`  ${cursor} → ${chunkEnd} ... `);
            const data = await fetchPrices(cursor, chunkEnd);
            if (!data?.Prices?.length) { console.log('no data'); }
            else { total += await upsert(db, data.Prices); console.log(`${data.Prices.length} prices`); }
            cursor = chunkEnd;
        }

        console.log(`[callSyncEnergiePrices] Done. Total: ${total} prices upserted.`);

    } else {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        console.log(`[callSyncEnergiePrices] Syncing ${yesterday} → ${tomorrow}`);
        const data = await fetchPrices(yesterday, tomorrow);
        if (!data?.Prices?.length) throw new Error('No prices returned');
        const count = await upsert(db, data.Prices);
        console.log(`[callSyncEnergiePrices] Done. ${count} prices upserted.`);
    }

    process.exit(0);
}

run().catch(err => {
    console.error('[callSyncEnergiePrices] Error:', err);
    process.exit(1);
});
