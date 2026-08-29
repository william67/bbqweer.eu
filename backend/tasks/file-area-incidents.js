'use strict';

const pool = require('../helpers/mysqlpool-knmi.helper').promise();
const booleanIntersects = require('@turf/boolean-intersects').default;
const { polygon: turfPolygon } = require('@turf/helpers');
const tomtom = require('../helpers/tomtom.helper');
const ntfy = require('../helpers/ntfy.helper');
const { taskStart, taskFinish, taskError, taskProgress } = require('../helpers/server-tasks');

const TASK_CODE = 'file-area-incidents';

const NTFY_DEDUPE_MS = 10 * 1000;

// areaId -> incident count, recomputed on every run. Read via getIncidentCounts()
// by backend/routes/file-areas.route.js.
let counts = new Map();

// When `counts` was last recomputed. Read via getLastCalculatedAt() by
// backend/routes/file-areas.route.js.
let lastCalculatedAt = null;

// areaId -> isOngoing — alert state machine, separate from `counts`. No repeat-cadence
// throttle needed: the task itself only recalculates every ~10 min, so every tick where
// an area is still active is already sparse enough to notify on directly.
const alertState = new Map();

async function loadAreas() {
    const [areaRows] = await pool.query(`SELECT id, name, notifyEnabled FROM file_areas WHERE active = 1`);
    if (areaRows.length === 0) return [];

    const areaIds = areaRows.map(a => a.id);
    const [pointRows] = await pool.query(`
        SELECT areaId, latitude, longitude, orderIndex
        FROM file_area_points
        WHERE areaId IN (?)
        ORDER BY areaId, orderIndex
    `, [areaIds]);

    const pointsByArea = new Map();
    pointRows.forEach(p => {
        if (!pointsByArea.has(p.areaId)) pointsByArea.set(p.areaId, []);
        pointsByArea.get(p.areaId).push([p.longitude, p.latitude]);
    });

    return areaRows.map(a => ({
        id: a.id, name: a.name, notifyEnabled: !!a.notifyEnabled, ring: pointsByArea.get(a.id) ?? []
    }));
}

async function loadAreaRing(areaId) {
    const [pointRows] = await pool.query(`
        SELECT longitude, latitude
        FROM file_area_points
        WHERE areaId = ?
        ORDER BY orderIndex
    `, [areaId]);
    return pointRows.map(p => [p.longitude, p.latitude]);
}

function buildPolygon(ring) {
    if (ring.length < 3) return null;
    const closedRing = [...ring, ring[0]];
    return turfPolygon([closedRing]);
}

function matchIncidents(polygon, incidents) {
    if (!polygon) return [];
    return incidents.filter(incident => {
        try {
            return booleanIntersects(polygon, incident);
        } catch {
            // malformed/unexpected geometry on this incident — skip it
            return false;
        }
    });
}

function sendAreaAlert(area, phase, count) {
    const titles = {
        start:  '🚗 Filemelding gestart',
        repeat: '🚗 Filemelding actief',
        end:    '🚗 Filemelding voorbij'
    };
    const messages = {
        start:  `${count} filemeldingen in ${area.name}`,
        repeat: `Nog steeds actief: ${count} filemeldingen in ${area.name}`,
        end:    `Geen filemeldingen meer in ${area.name}`
    };
    ntfy.sendAlert({
        topic: 'filealerts',
        key: `file-area-${area.id}-${phase}`,
        dedupeMs: NTFY_DEDUPE_MS,
        title: titles[phase],
        message: messages[phase],
        priority: phase === 'end' ? 'default' : 'high',
        tags: 'warning'
    });
}

async function computeCounts(areas) {
    const incidentsResponse = await tomtom.getIncidents();
    const incidents = incidentsResponse?.incidents ?? [];

    const next = new Map();
    let processed = 0;

    for (const area of areas) {
        const polygon = buildPolygon(area.ring);
        const count = matchIncidents(polygon, incidents).length;
        next.set(area.id, count);

        const wasOngoing = alertState.get(area.id) ?? false;

        if (area.notifyEnabled) {
            if (count > 0 && !wasOngoing) {
                sendAreaAlert(area, 'start', count);
            } else if (count > 0 && wasOngoing) {
                sendAreaAlert(area, 'repeat', count);
            } else if (count === 0 && wasOngoing) {
                sendAreaAlert(area, 'end', count);
            }
        }
        alertState.set(area.id, count > 0);

        processed++;
        await taskProgress(TASK_CODE, processed);
    }

    // Drop state for areas that no longer exist/are inactive
    const activeIds = new Set(areas.map(a => a.id));
    for (const id of alertState.keys()) if (!activeIds.has(id)) alertState.delete(id);

    counts = next;
    lastCalculatedAt = new Date();
}

function getIncidentCounts() {
    return counts;
}

function getLastCalculatedAt() {
    return lastCalculatedAt;
}

// On-demand — computed fresh per call, not cached, since this is a rarely-clicked
// detail view (unlike getIncidentCounts(), which backs the always-visible list column).
async function getMatchingIncidents(areaId) {
    const ring = await loadAreaRing(areaId);
    const polygon = buildPolygon(ring);
    const incidentsResponse = await tomtom.getIncidents();
    const incidents = incidentsResponse?.incidents ?? [];
    return matchIncidents(polygon, incidents);
}

async function run() {
    const t0 = Date.now();
    try {
        const areas = await loadAreas();
        await taskStart(TASK_CODE, areas.length);
        await computeCounts(areas);
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`${new Date().toISOString()} - file-area-incidents: ${areas.length} areas processed in ${secs}s`);
        await taskFinish(TASK_CODE, 'success', `${areas.length} areas processed`);
    } catch (e) {
        console.error('file-area-incidents error:', e.message);
        await taskError(TASK_CODE);
        await taskFinish(TASK_CODE, 'error', e.message);
    }
}

module.exports = run;
module.exports.getIncidentCounts = getIncidentCounts;
module.exports.getMatchingIncidents = getMatchingIncidents;
module.exports.getLastCalculatedAt = getLastCalculatedAt;
