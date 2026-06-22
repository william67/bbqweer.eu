'use strict';

const WebSocket = require('ws');
const Redis     = require('ioredis');
const fs        = require('fs');

const BOUNDS = { latMin: 40.0, latMax: 59.0, lonMin: -12.0, lonMax: 30.0 };
const TTL_MS = 10 * 60 * 1000;

const WSS_SERVERS = ['live.lightningmaps.org', 'live2.lightningmaps.org'];
let   wssNextPort = 443;

// Initial subscription message — tells server which geographic area we want
const WSS_INIT_MSG = JSON.stringify({
    v: 24, i: {}, s: false, x: 0, w: 0, tx: 0, tw: 1, a: 4,
    z: 6, b: true, h: '', l: 1, t: 1,
    from_lightningmaps_org: true,
    p: [BOUNDS.latMax, BOUNDS.lonMax, BOUNDS.latMin, BOUNDS.lonMin],
    r: 'A',
});

// Dedup by stroke.id — prevents double-processing reconnect replays
const dedupeCache = new Map();
const DEDUPE_TTL  = 150_000;

setInterval(() => {
    const cutoff = Date.now() - DEDUPE_TTL;
    for (const [k, v] of dedupeCache) if (v < cutoff) dedupeCache.delete(k);
}, 30_000);

// Auto-detect local vs Docker — same pattern as mysqlpool helper
const redisHost = fs.existsSync('./config.local.ini') ? '127.0.0.1' : 'redis';
const redis     = new Redis({ host: redisHost, port: 6379, lazyConnect: true });

redis.on('error', (err) => console.error('[blitzortung] Redis error:', err.message));

let io = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function inBounds(lat, lon) {
    return lat >= BOUNDS.latMin && lat <= BOUNDS.latMax &&
           lon >= BOUNDS.lonMin && lon <= BOUNDS.lonMax;
}

function isDupe(key) {
    if (dedupeCache.has(key)) return true;
    dedupeCache.set(key, Date.now());
    return false;
}

// ── Redis ops ─────────────────────────────────────────────────────────────────

async function addStrike(strike) {
    const id = `${strike.timeMs}:${Math.random().toString(36).slice(2, 7)}`;
    await redis.multi()
        .zadd('strikes:time', strike.timeMs, id)
        .geoadd('strikes:geo', strike.lon, strike.lat, id)
        .hset('strikes:data', id, JSON.stringify(strike))
        .exec();
    if (io) io.emit('new-strike', { ...strike, isNew: true });
}

async function pruneOld() {
    const expired = await redis.zrangebyscore('strikes:time', '-inf', Date.now() - TTL_MS);
    if (!expired.length) return;
    await redis.multi()
        .zrem('strikes:time', ...expired)
        .zrem('strikes:geo', ...expired)
        .hdel('strikes:data', ...expired)
        .exec();
}
setInterval(pruneOld, 30_000);

async function getAllCurrent() {
    const ids = await redis.zrangebyscore('strikes:time', Date.now() - TTL_MS, '+inf');
    if (!ids.length) return [];
    const raw = await redis.hmget('strikes:data', ...ids);
    return raw.filter(Boolean).map(JSON.parse);
}

async function getInWindow(lon, lat, widthKm, heightKm) {
    const ids = await redis.call('GEOSEARCH', 'strikes:geo', 'FROMLONLAT', lon, lat, 'BYBOX', widthKm, heightKm, 'km');
    if (!ids.length) return [];
    const raw = await redis.hmget('strikes:data', ...ids);
    return raw.filter(Boolean).map(JSON.parse);
}

// ── WebSocket (lightningmaps.org) ─────────────────────────────────────────────

function startWss() {
    const server = WSS_SERVERS[Math.floor(Math.random() * WSS_SERVERS.length)];
    const url    = `wss://${server}:${wssNextPort}/`;

    const ws = new WebSocket(url, {
        rejectUnauthorized: false,
        headers: {
            'Origin':     'https://www.lightningmaps.org',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        },
    });

    ws.on('open', () => {
        console.log(`[blitzortung] WSS connected: ${url}`);
        ws.send(WSS_INIT_MSG);
    });

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());

            // Challenge-response auth
            if ('k' in msg) {
                ws.send(`{"k": ${(msg.k * 3604) % 7081 * Date.now() / 100}}`);
            }

            // Server tells us which port to reconnect to
            if ('port' in msg) {
                const p = parseInt(msg.port, 10);
                if (p > 0) wssNextPort = p;
            }

            // Server requests a reconnect after a delay
            if ('reload' in msg) {
                ws.close();
                setTimeout(startWss, parseInt(msg.reload, 10) || 30_000);
                return;
            }

            // Strike batch
            if (msg.strokes && Array.isArray(msg.strokes)) {
                for (const stroke of msg.strokes) {
                    if (!inBounds(stroke.lat, stroke.lon)) continue;
                    if (isDupe(`wss:${stroke.id}`)) continue;
                    addStrike({ lat: stroke.lat, lon: stroke.lon, timeMs: stroke.time, pol: 0 })
                        .catch(() => {});
                }
            }
        } catch { /* ignore parse errors */ }
    });

    ws.on('close', () => {
        console.log('[blitzortung] WSS disconnected, reconnecting in 5s...');
        setTimeout(startWss, 5000);
    });

    ws.on('error', () => {});
}

// ── Public API ────────────────────────────────────────────────────────────────

function initBlitzortung(socketIo) {
    io = socketIo;
    redis.connect().then(() => {
        console.log(`[blitzortung] Redis connected (${redisHost}:6379)`);
        startWss();
        setInterval(async () => {
            try {
                const count = await redis.zcount('strikes:time', Date.now() - 30_000, '+inf');
                if (io) io.emit('lightning-index', count);
            } catch {}
        }, 5_000);
    }).catch(err => {
        console.error('[blitzortung] Redis connect failed:', err.message);
    });
}

function initSocketBlitzortung(socket) {
    const sendInitialList = () =>
        getAllCurrent()
            .then(strikes => socket.emit('initial-list', strikes))
            .catch(() => socket.emit('initial-list', []));

    socket.on('get-initial-list', sendInitialList);

    socket.on('get-window', ({ lon, lat, widthKm, heightKm }) => {
        getInWindow(lon, lat, widthKm, heightKm)
            .then(strikes => socket.emit('window-result', strikes))
            .catch(() => socket.emit('window-result', []));
    });
}

module.exports = { initBlitzortung, initSocketBlitzortung };
