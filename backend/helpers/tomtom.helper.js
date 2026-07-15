'use strict';

const fs = require('fs');
const ini = require('ini');
const axios = require('axios');
const cron = require('node-cron');
const { taskStart, taskFinish, taskError } = require('./server-tasks');

const configFile = fs.existsSync('config.local.ini') ? 'config.local.ini' : 'config.ini';
const config = ini.parse(fs.readFileSync(configFile, 'utf-8'));
const TOMTOM_API_KEY = config.tomtom?.api_key;

const TASK_CODE = 'tomtom-incidents-sync';

// Fixed query area — Rotterdam-Den Haag-Delft plus the Maasvlakte (~2400km²), same
// area the file-alerts frontend map centers/highlights on. TomTom's bbox is capped
// at 10,000km², well above this.
const BBOX = { minLat: 51.80, maxLat: 52.15, minLng: 3.90, maxLng: 4.80 };

// TomTom Traffic Incident Details free tier is 2.5K requests/month (confirmed at
// docs.tomtom.com/pricing — the next tier up, 20K/month, costs €35/month). Every
// 2 minutes around the clock was ~21,600/month, ~8.6x over the free quota — that's
// what caused the InsufficientFunds errors. Refresh every 10 minutes, only during
// 07:00-19:00 Amsterdam time (when traffic jams actually happen): 12h * 6/h = 72/day
// = ~2,160/month, leaving headroom for local dev testing on the same account/key.
// `timezone: 'Europe/Amsterdam'` makes node-cron evaluate the schedule against Dutch
// local time directly (via the IANA tz database), correctly shifting with CET/CEST
// DST regardless of what timezone the VPS itself runs in (UTC).
const CRON_SCHEDULE = '*/10 7-18 * * *';
const CRON_TIMEZONE = 'Europe/Amsterdam';

// TomTom requires an explicit field selection for Incident Details. `id` is a stable
// per-incident identifier that persists across polls — needed for upsert on the frontend.
const FIELDS = '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers,timeValidity}}}';

// Background-refreshed in-memory state — no request ever triggers a fetch itself.
let incidentsData = null; // raw TomTom response body ({ incidents: [...] })
let lastRefreshMs = null;
let lastError = null; // message from the most recent failed attempt, cleared on success

let ready = false;
let readyResolvers = [];
function markReady() {
    if (ready) return;
    ready = true;
    readyResolvers.forEach(r => r());
    readyResolvers = [];
}
function whenReady() {
    return ready ? Promise.resolve() : new Promise(resolve => readyResolvers.push(resolve));
}

async function refreshIncidents() {
    if (!TOMTOM_API_KEY) {
        console.error('[TOMTOM] api_key not configured — add it under [tomtom] in config.local.ini / config.ini');
        return;
    }
    await taskStart(TASK_CODE);
    try {
        const response = await axios.get('https://api.tomtom.com/traffic/services/5/incidentDetails', {
            params: {
                bbox: `${BBOX.minLng},${BBOX.minLat},${BBOX.maxLng},${BBOX.maxLat}`,
                fields: FIELDS,
                language: 'nl-NL',
                categoryFilter: 'Accident,Jam,RoadClosed',
                timeValidityFilter: 'present',
                key: TOMTOM_API_KEY
            }
        });
        incidentsData = response.data;
        lastRefreshMs = Date.now();
        lastError = null;
        markReady();
        await taskFinish(TASK_CODE, 'success', `${incidentsData.incidents?.length ?? 0} incidents`);
    } catch (err) {
        const code = err.response?.data?.detailedError?.code;
        const msg  = err.response?.data?.detailedError?.message || err.message;
        const detail = code ? `${code}: ${msg}` : msg;
        console.error('[TOMTOM] incidents refresh error:', err.response?.data || err.message);
        lastError = detail;
        markReady(); // resolve cold-start requests even when the first attempt fails
        await taskError(TASK_CODE);
        await taskFinish(TASK_CODE, 'error', detail);
    }
}

// Kick off once immediately (so the cache isn't empty if the app restarts outside the
// scheduled window), then keep itself fresh on the cron schedule above.
refreshIncidents();
cron.schedule(CRON_SCHEDULE, refreshIncidents, { timezone: CRON_TIMEZONE });

// Resolves once the background loop has populated data at least once (cold start only).
async function getIncidents() {
    await whenReady();
    return { incidents: incidentsData?.incidents ?? [], lastRefreshMs, lastError };
}

module.exports = { getIncidents };
