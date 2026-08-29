'use strict';

const pool = require('../helpers/mysqlpool-knmi.helper').promise();
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;
const { polygon: turfPolygon, point: turfPoint } = require('@turf/helpers');
const { getInWindow } = require('../socket/blitzortung');
const ntfy = require('../helpers/ntfy.helper');
const { taskStart, taskFinish, taskError, taskProgress } = require('../helpers/server-tasks');

const TASK_CODE = 'strike-area-alerts';

// A strike counts toward an area only if it happened within this window — recomputed
// every tick, so the count (and the end-alert) tracks the actual last-strike time
// within ~15s, independent of how often repeat alerts are sent.
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;

// While an area stays active, only re-notify at this cadence — the count itself still
// updates every tick, this only throttles the "still ongoing" push.
const REPEAT_INTERVAL_MS = 5 * 60 * 1000;

const NTFY_DEDUPE_MS = 10 * 1000;

// areaId -> count, recomputed on every run. Read via getStrikeCounts() by
// backend/routes/strike-areas.route.js.
let counts = new Map();

// When `counts` was last recomputed. Read via getLastCalculatedAt() by
// backend/routes/strike-areas.route.js.
let lastCalculatedAt = null;

// areaId -> { isOngoing, lastAlertMs } — alert state machine, separate from `counts`.
const alertState = new Map();

async function loadAreas() {
    const [areaRows] = await pool.query(`
        SELECT id, name, notifyEnabled, minLat, maxLat, minLng, maxLng
        FROM strike_areas
        WHERE active = 1
    `);
    if (areaRows.length === 0) return [];

    const areaIds = areaRows.map(a => a.id);
    const [pointRows] = await pool.query(`
        SELECT areaId, latitude, longitude, orderIndex
        FROM strike_area_points
        WHERE areaId IN (?)
        ORDER BY areaId, orderIndex
    `, [areaIds]);

    const pointsByArea = new Map();
    pointRows.forEach(p => {
        if (!pointsByArea.has(p.areaId)) pointsByArea.set(p.areaId, []);
        pointsByArea.get(p.areaId).push([p.longitude, p.latitude]);
    });

    return areaRows.map(a => ({ ...a, ring: pointsByArea.get(a.id) ?? [] }));
}

function buildPolygon(ring) {
    if (ring.length < 3) return null;
    const closedRing = [...ring, ring[0]];
    return turfPolygon([closedRing]);
}

async function countStrikesInArea(area) {
    const polygon = buildPolygon(area.ring);
    if (!polygon) return 0;
    if (area.minLat == null || area.maxLat == null || area.minLng == null || area.maxLng == null) return 0;

    const centerLat = (area.minLat + area.maxLat) / 2;
    const centerLon = (area.minLng + area.maxLng) / 2;
    const widthKm  = haversineKm(centerLat, area.minLng, centerLat, area.maxLng) || 1;
    const heightKm = haversineKm(area.minLat, centerLon, area.maxLat, centerLon) || 1;

    const candidates = await getInWindow(centerLon, centerLat, widthKm, heightKm);
    const now = Date.now();

    return candidates.filter(s => {
        if (now - s.timeMs >= ACTIVE_WINDOW_MS) return false;
        try {
            return booleanPointInPolygon(turfPoint([s.lon, s.lat]), polygon);
        } catch {
            return false;
        }
    }).length;
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

function sendAreaAlert(area, phase, count) {
    const titles = {
        start:  '⚡ Bliksem gestart',
        repeat: '⚡ Bliksem actief',
        end:    '⚡ Bliksem voorbij'
    };
    const messages = {
        start:  `${count} inslagen in de laatste 2 minuten in ${area.name}`,
        repeat: `Nog steeds actief: ${count} inslagen in de laatste 2 minuten in ${area.name}`,
        end:    `Geen inslagen meer in ${area.name}`
    };
    ntfy.sendAlert({
        topic: 'strikealerts',
        key: `strike-area-${area.id}-${phase}`,
        dedupeMs: NTFY_DEDUPE_MS,
        title: titles[phase],
        message: messages[phase],
        priority: phase === 'end' ? 'default' : 'high',
        tags: 'zap'
    });
}

async function computeCounts(areas) {
    const next = new Map();
    let processed = 0;

    for (const area of areas) {
        const count = await countStrikesInArea(area);
        next.set(area.id, count);

        const state = alertState.get(area.id) ?? { isOngoing: false, lastAlertMs: 0 };
        const now = Date.now();

        if (count > 0 && !state.isOngoing) {
            if (area.notifyEnabled) sendAreaAlert(area, 'start', count);
            state.isOngoing = true;
            state.lastAlertMs = now;
        } else if (count > 0 && state.isOngoing && now - state.lastAlertMs >= REPEAT_INTERVAL_MS) {
            if (area.notifyEnabled) sendAreaAlert(area, 'repeat', count);
            state.lastAlertMs = now;
        } else if (count === 0 && state.isOngoing) {
            if (area.notifyEnabled) sendAreaAlert(area, 'end', count);
            state.isOngoing = false;
        }
        alertState.set(area.id, state);

        processed++;
        await taskProgress(TASK_CODE, processed);
    }

    // Drop state for areas that no longer exist/are inactive
    const activeIds = new Set(areas.map(a => a.id));
    for (const id of alertState.keys()) if (!activeIds.has(id)) alertState.delete(id);

    counts = next;
    lastCalculatedAt = new Date();
}

function getStrikeCounts() {
    return counts;
}

function getLastCalculatedAt() {
    return lastCalculatedAt;
}

async function run() {
    const t0 = Date.now();
    try {
        const areas = await loadAreas();
        await taskStart(TASK_CODE, areas.length);
        await computeCounts(areas);
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`${new Date().toISOString()} - strike-area-alerts: ${areas.length} areas processed in ${secs}s`);
        await taskFinish(TASK_CODE, 'success', `${areas.length} areas processed`);
    } catch (e) {
        console.error('strike-area-alerts error:', e.message);
        await taskError(TASK_CODE);
        await taskFinish(TASK_CODE, 'error', e.message);
    }
}

module.exports = run;
module.exports.getStrikeCounts = getStrikeCounts;
module.exports.getLastCalculatedAt = getLastCalculatedAt;
