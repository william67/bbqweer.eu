'use strict';

const WebSocket = require('ws');
const Redis     = require('ioredis');
const fs        = require('fs');
const ini       = require('ini');
const { taskStart, taskError } = require('../helpers/server-tasks');
const ntfy      = require('../helpers/ntfy.helper');

const TASK_CODE = 'lightning-service';

const BOUNDS = { latMin: 40.0, latMax: 59.0, lonMin: -12.0, lonMax: 30.0 };
const TTL_MS = 10 * 60 * 1000;

const WSS_SERVER  = 'live2.lightningmaps.org'; // live sends each bolt twice; live2 dedupes server-side
let   wssNextPort = 443;

// Initial subscription message — tells server which geographic area we want
const WSS_INIT_MSG = JSON.stringify({
    v: 24, i: {}, s: false, x: 0, w: 0, tx: 0, tw: 1, a: 4,
    z: 6, b: true, h: '', l: 1, t: 1,
    from_lightningmaps_org: true,
    p: [90, 180, -90, -180],
    r: 'A',
});

// Dedup by time+lat+lon — guards against reconnect replays resending recent strikes
const dedupeCache = new Map();
const DEDUPE_TTL  = 150_000;

async function getDelayStats() {
    const ids = await redis.zrangebyscore('strikes:time', Date.now() - 60_000, '+inf');
    if (!ids.length) return null;
    const raw  = await redis.hmget('strikes:data', ...ids);
    const vals = raw
        .filter(Boolean)
        .map(JSON.parse)
        .filter(s => s.receivedAt)
        .map(s => s.receivedAt - s.timeMs);
    if (!vals.length) return null;
    return {
        avg:     Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
        min:     Math.min(...vals),
        max:     Math.max(...vals),
        samples: vals.length,
    };
}

setInterval(() => {
    const cutoff = Date.now() - DEDUPE_TTL;
    for (const [k, v] of dedupeCache) if (v < cutoff) dedupeCache.delete(k);
}, 30_000);

// Auto-detect local vs Docker — same pattern as mysqlpool helper
const configFile = fs.existsSync('./config.local.ini') ? './config.local.ini' : './config.ini';
const appConfig  = ini.parse(fs.readFileSync(configFile, 'utf-8'));

const redisHost = fs.existsSync('./config.local.ini') ? '127.0.0.1' : 'redis';
const redis     = new Redis({ host: redisHost, port: 6379, lazyConnect: true });

// ntfy push notifications — optional; skipped silently if [ntfy] section absent.
// Sending itself (auth header, queue, retry, dedup) is handled by ntfy.helper.js —
// this only decides *whether* a strike is close enough to home to be worth an alert.
const ntfyCfg     = appConfig.ntfy || null;
const ntfyEnabled = !!(ntfyCfg && ntfyCfg.url && ntfyCfg.home_lat && ntfyCfg.home_lon);
const HOME_LAT    = ntfyEnabled ? parseFloat(ntfyCfg.home_lat)      : 0;
const HOME_LON    = ntfyEnabled ? parseFloat(ntfyCfg.home_lon)      : 0;
const RADIUS_KM   = ntfyEnabled ? parseFloat(ntfyCfg.radius_km)  || 30 : 0;
const COOLDOWN_MS = ntfyEnabled ? (parseFloat(ntfyCfg.cooldown_min) || 5) * 60_000 : 0;
let   lastStrikeMs   = 0;
let   firstStrikeMs  = 0;

if (ntfyEnabled) console.log(`[blitzortung] ntfy alerts enabled — home ${HOME_LAT},${HOME_LON} radius ${RADIUS_KM}km cooldown ${COOLDOWN_MS / 60_000}min`);

redis.on('error', (err) => {
    console.error('[blitzortung] Redis error:', err.message);
    taskError(TASK_CODE).catch(() => {});
});

let io = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function inBounds(lat, lon) {
    return lat >= BOUNDS.latMin && lat <= BOUNDS.latMax &&
           lon >= BOUNDS.lonMin && lon <= BOUNDS.lonMax;
}

function haversineKm(lat1, lon1, lat2, lon2) {
    const R    = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a    = Math.sin(dLat / 2) ** 2 +
                 Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                 Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isDupe(key) {
    if (dedupeCache.has(key)) return true;
    dedupeCache.set(key, Date.now());
    return false;
}

// ── Redis ops ─────────────────────────────────────────────────────────────────

async function addStrike(strike) {
    lastStrikeMs = strike.origTimeMs ?? strike.timeMs;
    if (!firstStrikeMs) firstStrikeMs = lastStrikeMs;
    const id = String(strike.srcId);
    await redis.multi()
        .zadd('strikes:time', strike.timeMs, id)
        .geoadd('strikes:geo', strike.lon, strike.lat, id)
        .hset('strikes:data', id, JSON.stringify(strike))
        .exec();
    if (inBounds(strike.lat, strike.lon)) {
        await redis.zadd('strikes:ce:time', strike.timeMs, id);
    }
    if (io) io.emit('new-strike', { ...strike, isNew: true });

    if (ntfyEnabled) {
        const dist = haversineKm(strike.lat, strike.lon, HOME_LAT, HOME_LON);
        if (dist <= RADIUS_KM) {
            ntfy.sendAlert({
                topic: 'strikealerts',
                key: 'lightning-proximity',
                dedupeMs: COOLDOWN_MS,
                title: '⚡ Bliksemwaarschuwing',
                message: `Bliksem op ${Math.round(dist)}km van huis`,
                priority: 'high',
                tags: 'warning,zap'
            });
        }
    }
}

async function pruneOld() {
    const expired = await redis.zrangebyscore('strikes:time', '-inf', Date.now() - TTL_MS);
    if (!expired.length) return;
    await redis.multi()
        .zrem('strikes:time', ...expired)
        .zrem('strikes:geo', ...expired)
        .hdel('strikes:data', ...expired)
        .zrem('strikes:ce:time', ...expired)
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
    const url    = `wss://${WSS_SERVER}:${wssNextPort}/`;

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
                ws.removeAllListeners('close');
                ws.close();
                setTimeout(startWss, parseInt(msg.reload, 10) || 30_000);
                return;
            }

            // Strike batch
            if (msg.strokes && Array.isArray(msg.strokes)) {
                const receivedAt = Date.now();
                for (const stroke of msg.strokes) {
                    if (isDupe(String(stroke.id))) continue;
                    addStrike({ lat: stroke.lat, lon: stroke.lon, timeMs: stroke.time, pol: 0, receivedAt, srcId: stroke.id })
                        .catch(() => {});
                }
            }
        } catch { /* ignore parse errors */ }
    });

    ws.on('close', () => {
        console.log('[blitzortung] WSS disconnected, reconnecting in 5s...');
        wssNextPort = 443;
        taskError(TASK_CODE).catch(() => {});
        setTimeout(startWss, 5000);
    });

    ws.on('error', (err) => {
        console.error('[blitzortung] WSS error:', err.message);
        taskError(TASK_CODE).catch(() => {});
    });
}

// ── Public API ────────────────────────────────────────────────────────────────

function initBlitzortung(socketIo) {
    io = socketIo;
    taskStart(TASK_CODE).catch(err => console.error('[blitzortung] taskStart:', err.message));
    redis.connect().then(() => {
        console.log(`[blitzortung] Redis connected (${redisHost}:6379)`);

        // Playback bridge — replayed strikes arrive via Redis pub/sub
        const redisSub = new Redis({ host: redisHost, port: 6379 });
        redisSub.subscribe('strikes:live').catch(() => {});
        redisSub.on('message', (channel, msg) => {
            try {
                const strike = JSON.parse(msg);
                if (strike.type === 'prefill-done') {
                    if (io) io.emit('prefill-done');
                    return;
                }
                lastStrikeMs = strike.origTimeMs ?? strike.timeMs ?? lastStrikeMs;
                if (!firstStrikeMs) firstStrikeMs = lastStrikeMs;
                if (io) io.emit('new-strike', strike);
            } catch {}
        });

        const pauseWss = String(appConfig.blitzortung?.pause_wss) === 'true' || process.env.PAUSE_WSS === '1';
        if (pauseWss) {
            console.log('[blitzortung] WSS paused (pause_wss=true) — playback-only mode');
        } else {
            startWss();
        }
        setInterval(async () => {
            try {
                const now = Date.now();
                const [active, total, ceActive, ceTotal] = await Promise.all([
                    redis.zcount('strikes:time',    now - 30_000, '+inf'),
                    redis.zcount('strikes:time',    now - TTL_MS, '+inf'),
                    redis.zcount('strikes:ce:time', now - 30_000, '+inf'),
                    redis.zcount('strikes:ce:time', now - TTL_MS, '+inf'),
                ]);
                if (total === 0) { firstStrikeMs = 0; lastStrikeMs = 0; }
                if (io) io.emit('lightning-index', { active, total, ceActive, ceTotal, lastMs: lastStrikeMs || null, fromMs: firstStrikeMs || null });
            } catch {}
        }, 500);

        setInterval(async () => {
            try {
                const stats = await getDelayStats();
                if (io && stats) io.emit('lightning-delay', stats);
            } catch {}
        }, 1_000);
    }).catch(err => {
        console.error('[blitzortung] Redis connect failed:', err.message);
        taskError(TASK_CODE).catch(() => {});
    });
}

function initSocketBlitzortung(socket) {
    const sendInitialList = () =>
        getAllCurrent()
            .then(strikes => socket.emit('initial-list', strikes))
            .catch(() => socket.emit('initial-list', []));

    socket.on('get-initial-list', sendInitialList);

    socket.on('get-window', ({ minLat, maxLat, minLon, maxLon }) => {
        // Clamp to valid globe bounds before haversine — prevents near-zero width when lon hits ±180
        const lat1 = Math.max(minLat, -90);
        const lat2 = Math.min(maxLat,  90);
        const lon1 = Math.max(minLon, -180);
        const lon2 = Math.min(maxLon,  180);
        const centerLat = (lat1 + lat2) / 2;
        const centerLon = (lon1 + lon2) / 2;
        const widthKm   = haversineKm(centerLat, lon1, centerLat, lon2);
        const heightKm  = haversineKm(lat1, centerLon, lat2, centerLon);
        getInWindow(centerLon, centerLat, widthKm, heightKm)
            .then(strikes => socket.emit('window-result', strikes))
            .catch(() => socket.emit('window-result', []));
    });
}

module.exports = { initBlitzortung, initSocketBlitzortung };
