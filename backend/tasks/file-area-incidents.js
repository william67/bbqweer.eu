'use strict';

const pool = require('../helpers/mysqlpool-knmi.helper').promise();
const booleanIntersects = require('@turf/boolean-intersects').default;
const { polygon: turfPolygon } = require('@turf/helpers');
const tomtom = require('../helpers/tomtom.helper');
const { taskStart, taskFinish, taskError, taskProgress } = require('../helpers/server-tasks');

const TASK_CODE = 'file-area-incidents';

// areaId -> incident count, recomputed on every run. Read via getIncidentCounts()
// by backend/routes/file-areas.route.js.
let counts = new Map();

async function loadAreas() {
    const [areaRows] = await pool.query(`SELECT id FROM file_areas WHERE active = 1`);
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

    return areaRows.map(a => ({ id: a.id, ring: pointsByArea.get(a.id) ?? [] }));
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

async function computeCounts(areas) {
    const incidentsResponse = await tomtom.getIncidents();
    const incidents = incidentsResponse?.incidents ?? [];

    const next = new Map();
    let processed = 0;

    for (const area of areas) {
        const polygon = buildPolygon(area.ring);
        next.set(area.id, matchIncidents(polygon, incidents).length);
        processed++;
        await taskProgress(TASK_CODE, processed);
    }

    counts = next;
}

function getIncidentCounts() {
    return counts;
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
