'use strict';

// Backfill energy prices from energyzero.nl for a date range.
// Usage:
//   node backfillEnergy.js 2025-01-01 2025-05-03

const https   = require('https');
const mySqlPoolKnmi = require('./helpers/mysqlpool-knmi.helper');

const CHUNK_DAYS = 30;  // fetch 30 days per API call
const SOURCE     = 'energyzero';

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

function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function backfill(fromDate, toDate) {
    const db = mySqlPoolKnmi.promise();
    let total = 0;
    let cursor = fromDate;

    while (cursor <= toDate) {
        const chunkEnd = addDays(cursor, CHUNK_DAYS) <= toDate
            ? addDays(cursor, CHUNK_DAYS)
            : addDays(toDate, 1);

        console.log(`Fetching ${cursor} → ${chunkEnd} ...`);
        const data = await fetchPrices(cursor, chunkEnd);

        if (!data?.Prices?.length) {
            console.log('  No prices returned, skipping.');
        } else {
            const updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
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

            total += rows.length;
            console.log(`  Upserted ${rows.length} prices (total so far: ${total})`);
        }

        cursor = chunkEnd;
        if (cursor <= toDate) await sleep(500); // be polite to the API
    }

    return total;
}

const [,, fromArg, toArg] = process.argv;

if (!fromArg || !toArg) {
    console.error('Usage: node backfillEnergy.js <from-date> <to-date>');
    console.error('Example: node backfillEnergy.js 2025-01-01 2025-05-03');
    process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(fromArg) || !/^\d{4}-\d{2}-\d{2}$/.test(toArg)) {
    console.error('Dates must be in YYYY-MM-DD format');
    process.exit(1);
}

console.log(`Starting energy price backfill from ${fromArg} to ${toArg}...`);

backfill(fromArg, toArg)
    .then(total => { console.log(`Done. ${total} prices upserted.`); process.exit(0); })
    .catch(err  => { console.error('Error:', err.message); process.exit(1); });
