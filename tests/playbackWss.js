'use strict';

// Usage: node ../tests/playbackWss.js <file.ndjson> [speed] [--clear] [--from <time>]
//   speed    : 1 = real-time (default), 5 = 5× faster, 0 = instant dump
//   --clear  : flush all strikes from Redis before starting
//   --from   : start from this UTC timestamp in the recording
//              HH:MM:SS            — time only, uses date of first stroke
//              YYYY-MM-DDTHH:MM:SS — full date+time (UTC)

// Resolve dependencies from backend/node_modules — tests/ has no node_modules
process.env.NODE_PATH = require('path').resolve(__dirname, '../backend/node_modules');
require('module').Module._initPaths();

const Redis  = require('ioredis');
const fs     = require('fs');

const rawArgs  = process.argv.slice(2);
const doClear  = rawArgs.includes('--clear');

// Parse --from HH:MM:SS or --from=HH:MM:SS
let fromArg = null;
const fromIdx = rawArgs.indexOf('--from');
if (fromIdx !== -1) fromArg = rawArgs[fromIdx + 1] ?? null;
const fromEq = rawArgs.find(a => a.startsWith('--from='));
if (fromEq) fromArg = fromEq.slice(7);

// Positional args after stripping flags
const positional = rawArgs.filter((a, i) =>
    a !== '--clear' && a !== '--from' && !a.startsWith('--from=') &&
    !(fromIdx !== -1 && i === fromIdx + 1)
);
const file  = positional[0];
const speed = parseFloat(positional[1] ?? '1');

if (!file) {
    console.error('Usage: node ../tests/playbackWss.js <file.ndjson> [speed] [--clear] [--from HH:MM:SS|YYYY-MM-DDTHH:MM:SS]');
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

async function prefill(prefillStrokes, fromMs) {
    if (!prefillStrokes.length) return;
    const now = Date.now();
    console.log(`Prefilling ${prefillStrokes.length} strikes (10-min window before --from)...`);
    const pipeline = redis.pipeline();
    for (const stroke of prefillStrokes) {
        if (!inBounds(stroke.lat, stroke.lon)) continue;
        const timeMs = now - (fromMs - stroke.time); // preserve age relative to fromMs
        const id     = String(stroke.id);
        const strike = { lat: stroke.lat, lon: stroke.lon, timeMs, origTimeMs: stroke.time, pol: 0, srcId: stroke.id };
        pipeline.zadd('strikes:time', timeMs, id);
        pipeline.geoadd('strikes:geo', stroke.lon, stroke.lat, id);
        pipeline.hset('strikes:data', id, JSON.stringify(strike));
    }
    await pipeline.exec();
    await redis.publish('strikes:live', JSON.stringify({ type: 'prefill-done' }));
    console.log('Prefill done — frontend will reload initial list');
}

async function emit(stroke, now) {
    if (!inBounds(stroke.lat, stroke.lon)) return;
    const id    = String(stroke.id);
    const strike = { lat: stroke.lat, lon: stroke.lon, timeMs: now, origTimeMs: stroke.time, pol: 0, receivedAt: now, srcId: stroke.id };
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
    const allStrokes = batches.flatMap(b => b.strokes).sort((a, b) => a.time - b.time);
    console.log(`Loaded ${allStrokes.length} strokes from ${file}`);
    console.log(`Speed: ${speed === 0 ? 'instant' : speed + '×'}`);

    let strokes        = allStrokes;
    let prefillStrokes = [];
    let fromMs         = 0;

    if (fromArg) {
        if (fromArg.includes('T') || fromArg.includes('-')) {
            fromMs = new Date(fromArg + 'Z').getTime();
        } else {
            const [hh, mm, ss = 0] = fromArg.split(':').map(Number);
            const d = new Date(allStrokes[0].time);
            fromMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mm, ss);
        }
        if (isNaN(fromMs)) { console.error(`Invalid --from value: ${fromArg}`); process.exit(1); }
        prefillStrokes = allStrokes.filter(s => s.time >= fromMs - TTL_MS && s.time < fromMs);
        strokes        = allStrokes.filter(s => s.time >= fromMs);
        if (!strokes.length) { console.error(`No strokes at or after ${fromArg} UTC`); process.exit(1); }
        console.log(`--from ${fromArg} UTC — prefill: ${prefillStrokes.length}, playback: ${strokes.length}`);
    }

    if (doClear) await clearStrikes();
    if (prefillStrokes.length) await prefill(prefillStrokes, fromMs);

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
