'use strict';

// Usage: node ../tests/playbackWss.js <file.ndjson> [speed] [--clear]
//   speed : 1 = real-time (default), 5 = 5× faster, 0 = instant dump
//   --clear : flush all strikes from Redis before starting

// Resolve dependencies from backend/node_modules — tests/ has no node_modules
process.env.NODE_PATH = require('path').resolve(__dirname, '../backend/node_modules');
require('module').Module._initPaths();

const Redis  = require('ioredis');
const fs     = require('fs');

const args   = process.argv.slice(2).filter(a => a !== '--clear');
const doClear = process.argv.includes('--clear');
const file   = args[0];
const speed  = parseFloat(args[1] ?? '1');

if (!file) {
    console.error('Usage: node ../tests/playbackWss.js <file.ndjson> [speed] [--clear]');
    process.exit(1);
}

const BOUNDS = { latMin: 40.0, latMax: 59.0, lonMin: -12.0, lonMax: 30.0 };
const TTL_MS = 10 * 60 * 1000;

const redis  = new Redis({ host: '127.0.0.1', port: 6379 });

function inBounds(lat, lon) {
    return lat >= BOUNDS.latMin && lat <= BOUNDS.latMax &&
           lon >= BOUNDS.lonMin && lon <= BOUNDS.lonMax;
}

async function clearStrikes() {
    const ids = await redis.zrangebyscore('strikes:time', '-inf', '+inf');
    if (!ids.length) return;
    await redis.multi()
        .del('strikes:time')
        .del('strikes:geo')
        .del('strikes:data')
        .exec();
    console.log(`Cleared ${ids.length} existing strikes from Redis`);
}

async function emit(stroke, now) {
    if (!inBounds(stroke.lat, stroke.lon)) return;
    const id    = String(stroke.id);
    const strike = { lat: stroke.lat, lon: stroke.lon, timeMs: now, pol: 0, receivedAt: now, srcId: stroke.id };
    await redis.multi()
        .zadd('strikes:time', now, id)
        .geoadd('strikes:geo', stroke.lon, stroke.lat, id)
        .hset('strikes:data', id, JSON.stringify(strike))
        .exec();
    await redis.publish('strikes:live', JSON.stringify({ ...strike, isNew: true }));
}

async function run() {
    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);

    // Collect all strokes with original timestamps
    const batches = [];
    for (const line of lines) {
        try {
            const msg = JSON.parse(line);
            if (msg.strokes?.length) batches.push(msg);
        } catch {}
    }

    if (!batches.length) { console.error('No stroke batches found'); process.exit(1); }

    // Flatten all strokes and sort by individual ms-precise stroke.time
    const strokes = batches.flatMap(b => b.strokes).sort((a, b) => a.time - b.time);
    console.log(`Loaded ${strokes.length} strokes from ${file}`);
    console.log(`Speed: ${speed === 0 ? 'instant' : speed + '×'}`);

    if (doClear) await clearStrikes();

    const originStart = strokes[0].time;   // ms
    const wallStart   = Date.now();
    let   emitted     = 0;

    for (const stroke of strokes) {
        if (speed > 0) {
            const targetMs = (stroke.time - originStart) / speed;
            const elapsed  = Date.now() - wallStart;
            const wait     = targetMs - elapsed;
            if (wait > 0) await new Promise(r => setTimeout(r, wait));
        }

        await emit(stroke, Date.now());
        emitted++;

        if (emitted % 500 === 0 || emitted === strokes.length) {
            const elapsed = Math.round((Date.now() - wallStart) / 1000);
            process.stdout.write(`\r${elapsed}s — ${emitted}/${strokes.length} strokes emitted`);
        }
    }

    console.log(`\nDone — ${emitted} strokes emitted`);
    redis.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
