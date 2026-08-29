'use strict';

const fs = require('fs');
const ini = require('ini');
const axios = require('axios');

const configFile = fs.existsSync('config.local.ini') ? 'config.local.ini' : 'config.ini';
const config = ini.parse(fs.readFileSync(configFile, 'utf-8'));
const ntfyCfg = config.ntfy || {};

const NTFY_BASE_URL     = ntfyCfg.base_url || null;
const NTFY_TOKEN        = ntfyCfg.token || null;
const NTFY_TOPIC_SUFFIX = ntfyCfg.topic_suffix || '';

const DRAIN_INTERVAL_MS  = 1000;
const DEFAULT_DEDUPE_MS  = 5 * 60 * 1000;
const MAX_ATTEMPTS       = 3;

// Central queue — every alert producer (lightning proximity, strike-area-alerts,
// file-area-incidents, manual test menu) calls sendAlert() and returns immediately;
// the actual HTTP POST to ntfy happens on the drain loop below, decoupled from the caller.
const queue = [];
const lastSentByKey = new Map();

// Fire-and-forget: pushes onto the queue and returns immediately. `topic` selects the
// ntfy stream (e.g. 'filealerts', 'strikealerts'). `key` is optional — when given, alerts
// with the same key are deduped within `dedupeMs` (default 5 min); omit it (e.g. manual
// test messages) to always send.
function sendAlert({ topic, key, title, message, priority = 'default', tags = '', dedupeMs = DEFAULT_DEDUPE_MS }) {
    if (!NTFY_BASE_URL) {
        console.error('[ntfy] not configured — set [ntfy] base_url (and token) in config.local.ini / config.ini');
        return;
    }
    if (key) {
        const last = lastSentByKey.get(key);
        if (last && Date.now() - last.time < dedupeMs) {
            console.log(`[ntfy] skipped (deduped): ${key}`);
            return;
        }
    }
    queue.push({ topic: topic + NTFY_TOPIC_SUFFIX, key, title, message, priority, tags, dedupeMs, attempts: 0 });
}

async function drainOnce() {
    const item = queue.shift();
    if (!item) return;

    try {
        const headers = { Title: item.title, Priority: item.priority, Tags: item.tags };
        if (NTFY_TOKEN) headers['Authorization'] = `Bearer ${NTFY_TOKEN}`;
        await axios.post(`${NTFY_BASE_URL}/${item.topic}`, item.message, { headers });
        if (item.key) lastSentByKey.set(item.key, { time: Date.now(), dedupeMs: item.dedupeMs });
        console.log(`[ntfy] sent: ${item.title}`);
    } catch (err) {
        item.attempts++;
        console.error(`[ntfy] send failed (attempt ${item.attempts}/${MAX_ATTEMPTS}):`, err.message);
        if (item.attempts < MAX_ATTEMPTS) {
            queue.push(item);
        } else {
            console.error(`[ntfy] giving up: ${item.title}`);
        }
    }
}

setInterval(drainOnce, DRAIN_INTERVAL_MS);

// Periodic cleanup of stale dedupe entries — bounded by each entry's own dedupeMs
setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of lastSentByKey) {
        if (now - entry.time > entry.dedupeMs) lastSentByKey.delete(k);
    }
}, 60_000);

module.exports = { sendAlert };
