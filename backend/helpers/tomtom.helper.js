'use strict';

const fs = require('fs');
const ini = require('ini');
const axios = require('axios');

const configFile = fs.existsSync('config.local.ini') ? 'config.local.ini' : 'config.ini';
const config = ini.parse(fs.readFileSync(configFile, 'utf-8'));
const TOMTOM_API_KEY = config.tomtom?.api_key;

// Fixed query area — Rotterdam-Den Haag-Delft plus the Maasvlakte (~2400km²), same
// area the file-alerts frontend map centers/highlights on. TomTom's bbox is capped
// at 10,000km², well above this.
const BBOX = { minLat: 51.80, maxLat: 52.15, minLng: 3.90, maxLng: 4.80 };

const REFRESH_MS = 2 * 60 * 1000;

// TomTom requires an explicit field selection for Incident Details. `id` is a stable
// per-incident identifier that persists across polls — needed for upsert on the frontend.
const FIELDS = '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers,timeValidity}}}';

// Background-refreshed in-memory state — no request ever triggers a fetch itself.
let incidents = null; // raw TomTom response body ({ incidents: [...] })

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
        incidents = response.data;
        markReady();
    } catch (err) {
        console.error('[TOMTOM] incidents refresh error:', err.response?.data || err.message);
    }
}

// Kick off the loop immediately; keeps itself fresh every REFRESH_MS.
refreshIncidents();
setInterval(refreshIncidents, REFRESH_MS);

// Resolves once the background loop has populated data at least once (cold start only).
async function getIncidents() {
    await whenReady();
    return incidents;
}

module.exports = { getIncidents };
