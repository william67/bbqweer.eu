'use strict';

const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const mySqlPoolKnmi = require('../helpers/mysqlpool-knmi.helper');

const DEFAULT_STN = 260; // De Bilt

// ─── station coordinates (lat/lon not stored in DB) ──────────────────────────
const STATION_COORDS = {
    209: { lat: 52.465, lon: 4.518 }, 210: { lat: 52.178, lon: 4.418 },
    215: { lat: 52.125, lon: 4.432 }, 225: { lat: 52.463, lon: 4.557 },
    229: { lat: 53.005, lon: 4.745 }, 235: { lat: 52.928, lon: 4.781 },
    240: { lat: 52.318, lon: 4.790 }, 242: { lat: 53.241, lon: 4.922 },
    248: { lat: 52.633, lon: 5.172 }, 249: { lat: 52.643, lon: 5.000 },
    251: { lat: 53.392, lon: 5.346 }, 257: { lat: 52.505, lon: 4.603 },
    258: { lat: 52.648, lon: 5.398 }, 260: { lat: 52.101, lon: 5.177 },
    265: { lat: 52.127, lon: 5.277 }, 267: { lat: 52.880, lon: 5.383 },
    269: { lat: 52.458, lon: 5.520 }, 270: { lat: 53.228, lon: 5.752 },
    273: { lat: 52.703, lon: 5.888 }, 275: { lat: 52.057, lon: 5.874 },
    277: { lat: 53.413, lon: 6.198 }, 278: { lat: 52.437, lon: 6.257 },
    279: { lat: 52.727, lon: 6.517 }, 280: { lat: 53.125, lon: 6.585 },
    283: { lat: 52.069, lon: 6.657 }, 285: { lat: 53.572, lon: 6.402 },
    286: { lat: 53.196, lon: 7.150 }, 290: { lat: 52.274, lon: 6.897 },
    308: { lat: 51.382, lon: 3.395 }, 310: { lat: 51.443, lon: 3.596 },
    311: { lat: 51.379, lon: 3.701 }, 312: { lat: 51.768, lon: 3.622 },
    313: { lat: 51.512, lon: 3.242 }, 315: { lat: 51.444, lon: 4.002 },
    316: { lat: 51.663, lon: 3.697 }, 319: { lat: 51.229, lon: 3.861 },
    323: { lat: 51.527, lon: 3.884 }, 324: { lat: 51.594, lon: 4.010 },
    330: { lat: 51.978, lon: 4.122 }, 331: { lat: 51.516, lon: 4.215 },
    340: { lat: 51.449, lon: 4.342 }, 343: { lat: 51.887, lon: 4.320 },
    344: { lat: 51.962, lon: 4.447 }, 348: { lat: 51.971, lon: 4.927 },
    350: { lat: 51.566, lon: 4.936 }, 356: { lat: 51.860, lon: 5.140 },
    370: { lat: 51.451, lon: 5.377 }, 375: { lat: 51.655, lon: 5.707 },
    377: { lat: 51.200, lon: 5.763 }, 380: { lat: 50.906, lon: 5.762 },
    391: { lat: 51.499, lon: 6.196 },
};

// ─── solar position + Hay-Davies GTI ─────────────────────────────────────────
// Decomposes KNMI GHI (Q in J/cm²/hour) into direct + diffuse (Erbs model),
// then calculates irradiance on a tilted surface (Hay-Davies model).
// Returns null when the sun is below the horizon.
function solarHourData(ghiW, lat, lon, year, month, day, hh) {
    if (ghiW == null || ghiW <= 0) return null;
    const toRad = d => d * Math.PI / 180;
    const doy = Math.floor((new Date(year, month - 1, day) - new Date(year, 0, 1)) / 86400000) + 1;

    // Spencer declination (radians)
    const B = 2 * Math.PI * (doy - 1) / 365;
    const decl = 0.006918 - 0.399912*Math.cos(B) + 0.070257*Math.sin(B)
               - 0.006758*Math.cos(2*B) + 0.000907*Math.sin(2*B)
               - 0.002697*Math.cos(3*B) + 0.001480*Math.sin(3*B);

    // Equation of time (minutes)
    const EoT = 229.18 * (0.000075 + 0.001868*Math.cos(B) - 0.032077*Math.sin(B)
              - 0.014615*Math.cos(2*B) - 0.04089*Math.sin(2*B));

    // KNMI HH: hour ending at HH in UTC. Midpoint = HH - 0.5. Convert to solar time.
    const solarHour = (hh - 0.5) + lon / 15 + EoT / 60;
    const omega = toRad((solarHour - 12) * 15);

    const latRad = toRad(lat);
    const sinAlt = Math.sin(latRad)*Math.sin(decl) + Math.cos(latRad)*Math.cos(decl)*Math.cos(omega);
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    if (alt <= 0.1745) return null; // < 10°: Erbs overestimates DNI at high air mass

    // Solar azimuth from South (0=South, negative=East, positive=West)
    const cosAzN = (Math.sin(decl) - Math.sin(alt)*Math.sin(latRad)) / (Math.cos(alt)*Math.cos(latRad));
    let azN = Math.acos(Math.max(-1, Math.min(1, cosAzN)));
    if (solarHour > 12) azN = 2*Math.PI - azN;
    const azS = azN - Math.PI;

    const I0n  = 1367 * (1 + 0.033 * Math.cos(2 * Math.PI * doy / 365));
    const ktRaw = ghiW / Math.max(I0n * Math.sin(alt), 1);
    // kt > 1.1: clearly invalid (midpoint angle too low for measured GHI). Skip.
    if (ktRaw > 1.1) return null;
    const kt = Math.min(ktRaw, 1.0); // cap borderline overshoot (pyranometer uncertainty)

    // Reindl diffuse fraction model — includes sin(alt), avoids Erbs spike at high kt/low sun
    let Df;
    if      (kt <= 0.30) Df = 1.02  - 0.254*kt  + 0.0123*Math.sin(alt);
    else if (kt <= 0.78) Df = 1.4   - 1.749*kt  + 0.177 *Math.sin(alt);
    else                 Df = 0.486*kt - 0.182*Math.sin(alt);
    Df = Math.max(0.1, Math.min(1, Df));

    const DNI = Math.min((ghiW*(1-Df)) / Math.max(Math.sin(alt), 0.01), I0n);
    return { alt, azS, DNI, DHI: ghiW*Df, I0n, ghiW };
}

// Hay-Davies irradiance on a tilted panel (W/m²)
function gtiHayDavies(s, tiltDeg, azimuthDeg) {
    const betaR  = tiltDeg    * Math.PI / 180;
    const gammaPR = azimuthDeg * Math.PI / 180;
    const cosTheta = Math.sin(s.alt)*Math.cos(betaR)
                   + Math.cos(s.alt)*Math.sin(betaR)*Math.cos(s.azS - gammaPR);
    const Rb  = Math.max(cosTheta, 0) / Math.max(Math.sin(s.alt), 0.01);
    const Ai  = s.DNI / Math.max(s.I0n, 1);
    const gti = s.DNI  * Math.max(cosTheta, 0)
              + s.DHI  * (Ai * Rb + (1 - Ai) * (1 + Math.cos(betaR)) / 2)
              + s.ghiW * 0.2 * (1 - Math.cos(betaR)) / 2;
    return Math.max(0, gti);
}

// ─── helpers ────────────────────────────────────────────────────────────────

const toKwhm2  = q  => q  == null ? null : Math.round(q * 10000 / 3600) / 1000;
const kasten   = ng => {
    if (ng == null || ng === 9) return null;
    const c = ng / 8.0;
    return Math.round((1 - 0.75 * Math.pow(c, 3.4)) * 1000) / 1000;
};
const pct = (arr, p) => {
    if (!arr.length) return null;
    const k = (arr.length - 1) * p / 100;
    const f = Math.floor(k), c = Math.ceil(k);
    return Math.round((arr[f] + (arr[c] - arr[f]) * (k - f)) * 10) / 10;
};
const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;

// ─── GET /api/solar/stats ────────────────────────────────────────────────────
// Historical daily statistics for a calendar day (all years)
// Query: ?month=4&day=29&stn=260
router.get('/stats', async (req, res) => {
    const month = parseInt(req.query.month);
    const day   = parseInt(req.query.day);
    const stn   = parseInt(req.query.stn) || DEFAULT_STN;
    if (!month || !day) return res.status(400).json({ error: 'month and day required' });

    try {
        const db = mySqlPoolKnmi.promise();
        const [rows] = await db.query(`
            SELECT
                YEAR(datum)                         AS year,
                datum,
                Q                                   AS q_jcm2,
                CASE WHEN SQ < 0 THEN 0
                     ELSE SQ / 10.0 END             AS sunshine_hours,
                SP                                  AS sunshine_pct,
                NG                                  AS cloud_octants,
                TG / 10.0                           AS temp_avg_c,
                TX / 10.0                           AS temp_max_c,
                UG                                  AS humidity_pct,
                CASE WHEN RH < 0 THEN 0
                     ELSE RH / 10.0 END             AS precip_mm,
                EV24 / 10.0                         AS evapotransp_mm
            FROM etmgeg
            WHERE STN = ?
              AND MONTH(datum) = ? AND DAY(datum) = ?
              AND Q IS NOT NULL AND Q > 0
            ORDER BY datum
        `, [stn, month, day]);

        if (!rows.length) return res.json({ error: 'No data found', month, day, stn });

        const qVals  = rows.map(r => r.q_jcm2).sort((a, b) => a - b);
        const sqVals = rows.map(r => r.sunshine_hours).filter(v => v != null);
        const ngVals = rows.map(r => r.cloud_octants).filter(v => v != null && v !== 9);
        const tgVals = rows.map(r => r.temp_avg_c).filter(v => v != null);

        const bestRow = rows.reduce((a, b) => (b.q_jcm2 > a.q_jcm2 ? b : a));

        res.json({
            month, day, stn,
            years_measured: rows.length,
            q: {
                max: Math.max(...qVals), p90: pct(qVals, 90), p75: pct(qVals, 75),
                avg: avg(qVals),         p25: pct(qVals, 25), p10: pct(qVals, 10),
                min: Math.min(...qVals), unit: 'J/cm2'
            },
            q_kwhm2: {
                max: toKwhm2(Math.max(...qVals)), p90: toKwhm2(pct(qVals, 90)),
                avg: toKwhm2(avg(qVals)),         min: toKwhm2(Math.min(...qVals)),
                unit: 'kWh/m2'
            },
            sunshine_hours: { max: Math.max(...sqVals), avg: avg(sqVals), min: Math.min(...sqVals) },
            cloud_octants:  { avg: avg(ngVals), kasten_factor: kasten(avg(ngVals)) },
            temperature_c:  { avg: avg(tgVals) },
            best_day: {
                date:           bestRow.datum instanceof Date ? bestRow.datum.toISOString().slice(0, 10) : bestRow.datum,
                q_jcm2:         bestRow.q_jcm2,
                q_kwhm2:        toKwhm2(bestRow.q_jcm2),
                sunshine_hours: bestRow.sunshine_hours,
                cloud_octants:  bestRow.cloud_octants,
                temp_avg_c:     bestRow.temp_avg_c,
            },
            history: rows.map(r => ({
                ...r,
                datum:   r.datum instanceof Date ? r.datum.toISOString().slice(0, 10) : r.datum,
                q_kwhm2: toKwhm2(r.q_jcm2),
            }))
        });
    } catch (err) {
        console.error('[solar/stats]', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/solar/hourly ───────────────────────────────────────────────────
// Actual hourly profile for a specific date
// Query: ?date=2024-04-29&stn=260
router.get('/hourly', async (req, res) => {
    const date = req.query.date;
    const stn  = parseInt(req.query.stn) || DEFAULT_STN;
    if (!date) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });

    const yyyymmdd = date.replace(/-/g, '');

    try {
        const db = mySqlPoolKnmi.promise();
        const [rows] = await db.query(`
            SELECT
                HH                                  AS hour,
                Q                                   AS q_jcm2,
                CASE WHEN SQ < 0 THEN 0
                     ELSE SQ / 10.0 END             AS sunshine_hours,
                N                                   AS cloud_octants,
                T  / 10.0                           AS temp_c,
                TD / 10.0                           AS dewpoint_c,
                FH / 10.0                           AS windspeed_ms,
                U                                   AS humidity_pct,
                RH                                  AS precip_01mm,
                R                                   AS rain,
                M                                   AS fog
            FROM uurgeg
            WHERE STN = ?
              AND YYYYMMDD = ?
            ORDER BY HH
        `, [stn, yyyymmdd]);

        if (!rows.length) return res.json({ error: 'No hourly data for ' + date, date, stn });

        res.json({
            date, stn,
            hours:         rows.length,
            total_q_jcm2:  rows.reduce((s, r) => s + (r.q_jcm2 || 0), 0),
            total_q_kwhm2: toKwhm2(rows.reduce((s, r) => s + (r.q_jcm2 || 0), 0)),
            hourly: rows.map(r => ({
                hour:           r.hour,
                q_jcm2:         r.q_jcm2,
                q_kwhm2:        toKwhm2(r.q_jcm2),
                kasten_factor:  kasten(r.cloud_octants),
                sunshine_hours: r.sunshine_hours,
                cloud_octants:  r.cloud_octants,
                temp_c:         r.temp_c,
                dewpoint_c:     r.dewpoint_c,
                windspeed_ms:   r.windspeed_ms,
                humidity_pct:   r.humidity_pct,
                rain:           r.rain,
                fog:            r.fog,
            }))
        });
    } catch (err) {
        console.error('[solar/hourly]', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/solar/best ─────────────────────────────────────────────────────
// Best day ever for a calendar day + its full hourly profile
// Query: ?month=4&day=29&stn=260
router.get('/best', async (req, res) => {
    const month = parseInt(req.query.month);
    const day   = parseInt(req.query.day);
    const stn   = parseInt(req.query.stn) || DEFAULT_STN;
    if (!month || !day) return res.status(400).json({ error: 'month and day required' });

    try {
        const db = mySqlPoolKnmi.promise();
        const [[best]] = await db.query(`
            SELECT datum, Q AS q_jcm2
            FROM etmgeg
            WHERE STN = ?
              AND MONTH(datum) = ? AND DAY(datum) = ?
              AND Q IS NOT NULL AND Q > 0
            ORDER BY Q DESC
            LIMIT 1
        `, [stn, month, day]);

        if (!best) return res.json({ error: 'No data found', month, day, stn });

        const yyyymmdd = best.datum instanceof Date
            ? best.datum.toISOString().slice(0, 10).replace(/-/g, '')
            : String(best.datum).replace(/-/g, '');

        const [hours] = await db.query(`
            SELECT
                HH                          AS hour,
                Q                           AS q_jcm2,
                CASE WHEN SQ < 0 THEN 0
                     ELSE SQ / 10.0 END     AS sunshine_hours,
                N                           AS cloud_octants,
                T / 10.0                    AS temp_c,
                U                           AS humidity_pct
            FROM uurgeg
            WHERE STN = ? AND YYYYMMDD = ?
            ORDER BY HH
        `, [stn, yyyymmdd]);

        res.json({
            best_date:     best.datum instanceof Date ? best.datum.toISOString().slice(0, 10) : best.datum,
            total_q_jcm2:  best.q_jcm2,
            total_q_kwhm2: toKwhm2(best.q_jcm2),
            stn,
            hourly: hours.map(r => ({
                hour:           r.hour,
                q_jcm2:         r.q_jcm2,
                q_kwhm2:        toKwhm2(r.q_jcm2),
                kasten_factor:  kasten(r.cloud_octants),
                sunshine_hours: r.sunshine_hours,
                cloud_octants:  r.cloud_octants,
                temp_c:         r.temp_c,
                humidity_pct:   r.humidity_pct,
            }))
        });
    } catch (err) {
        console.error('[solar/best]', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/solar/forecast ─────────────────────────────────────────────────
// Average hourly Q profile for a calendar day across all years
// Query: ?month=4&day=29&stn=260
router.get('/forecast', async (req, res) => {
    const month = parseInt(req.query.month);
    const day   = parseInt(req.query.day);
    const stn   = parseInt(req.query.stn) || DEFAULT_STN;
    if (!month || !day) return res.status(400).json({ error: 'month and day required' });

    try {
        const db = mySqlPoolKnmi.promise();
        const [rows] = await db.query(`
            SELECT
                u.HH                                        AS hour,
                AVG(u.Q)                                    AS q_avg_jcm2,
                MAX(u.Q)                                    AS q_max_jcm2,
                MIN(u.Q)                                    AS q_min_jcm2,
                AVG(CASE WHEN u.N = 9 THEN NULL ELSE u.N END) AS cloud_avg_octants,
                AVG(u.T / 10.0)                             AS temp_avg_c,
                COUNT(*)                                    AS years_sampled
            FROM uurgeg u
            WHERE u.STN = ?
              AND MONTH(STR_TO_DATE(u.YYYYMMDD, '%Y%m%d')) = ?
              AND DAY(STR_TO_DATE(u.YYYYMMDD, '%Y%m%d'))   = ?
              AND u.Q IS NOT NULL
            GROUP BY u.HH
            ORDER BY u.HH
        `, [stn, month, day]);

        res.json({
            month, day, stn,
            years_sampled: rows[0]?.years_sampled || 0,
            hourly: rows.map(r => ({
                hour:          r.hour,
                q_avg_jcm2:    Math.round(r.q_avg_jcm2 * 10) / 10,
                q_max_jcm2:    r.q_max_jcm2,
                q_min_jcm2:    r.q_min_jcm2,
                q_avg_kwhm2:   toKwhm2(r.q_avg_jcm2),
                q_max_kwhm2:   toKwhm2(r.q_max_jcm2),
                kasten_avg:    kasten(r.cloud_avg_octants),
                cloud_avg_oct: Math.round(r.cloud_avg_octants * 10) / 10,
                temp_avg_c:    Math.round(r.temp_avg_c * 10) / 10,
            }))
        });
    } catch (err) {
        console.error('[solar/forecast]', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/solar/tomorrow ─────────────────────────────────────────────────
// Expected solar panel output for today + 2 days using Open-Meteo forecast.
// Supports multiple panel arrays (different tilt/azimuth) via the arrays param.
//
// Query params:
//   lat        - latitude  (default: 52.09 De Bilt)
//   lon        - longitude (default: 5.18)
//   efficiency - combined loss factor (default: 0.85)
//   maxAcW     - total inverter AC limit in W (default: 0 = no clipping)
//   arrays     - JSON array of {panels, wp, tilt, azimuth}
router.get('/tomorrow', async (req, res) => {
    const lat        = parseFloat(req.query.lat)        || 52.09;
    const lon        = parseFloat(req.query.lon)        || 5.18;
    const efficiency = parseFloat(req.query.efficiency) || 0.85;

    let inverters;
    try {
        inverters = JSON.parse(req.query.inverters || '[]');
        if (!Array.isArray(inverters) || !inverters.length) throw new Error('empty');
        for (const inv of inverters) {
            if (!Array.isArray(inv.arrays) || !inv.arrays.length) throw new Error('inverter missing arrays');
        }
    } catch {
        return res.status(400).json({ error: 'inverters param must be a non-empty JSON array, each with arrays' });
    }

    try {
        const url = 'https://api.open-meteo.com/v1/forecast';

        // Flatten all arrays across all inverters, keeping inverter index
        const flatArrays = [];
        inverters.forEach((inv, ii) => inv.arrays.forEach(arr => flatArrays.push({ ...arr, ii })));

        // One Open-Meteo call per flat array (different tilt/azimuth) — run in parallel
        const fetches = await Promise.all(flatArrays.map(arr =>
            axios.get(url, {
                params: {
                    latitude:      lat,
                    longitude:     lon,
                    hourly:        'global_tilted_irradiance,temperature_2m,cloud_cover',
                    tilt:          arr.tilt,
                    azimuth:       arr.azimuth,
                    forecast_days: 4,
                    timezone:      'Europe/Amsterdam',
                },
                timeout: 10000,
            })
        ));

        const times = fetches[0].data.hourly.time;
        const temp  = fetches[0].data.hourly.temperature_2m;
        const cloud = fetches[0].data.hourly.cloud_cover;

        // Collect today + next 2 days (3 days total)
        const today = new Date();
        const dateStrings = [0, 1, 2].map(offset => {
            const d = new Date(today);
            d.setDate(d.getDate() + offset);
            return d.toISOString().slice(0, 10);
        });

        const dayMap = {};
        dateStrings.forEach(ds => { dayMap[ds] = { totalWh: 0, hours: [] }; });

        times.forEach((t, i) => {
            const dateStr = t.slice(0, 10);
            if (!dayMap[dateStr]) return;
            const hour = parseInt(t.slice(11, 13));

            let systemW  = 0;
            let gtiSum   = 0;
            let gtiCount = 0;

            // Per inverter: sum DC across its arrays, then apply per-inverter AC cap
            inverters.forEach((inv, ii) => {
                let invDcW = 0;
                flatArrays.forEach((fa, fi) => {
                    if (fa.ii !== ii) return;
                    const gtiVal = fetches[fi].data.hourly.global_tilted_irradiance[i];
                    if (gtiVal != null) {
                        invDcW   += Math.round((gtiVal / 1000) * fa.panels * fa.wp * efficiency);
                        gtiSum   += gtiVal;
                        gtiCount += 1;
                    }
                });
                systemW += (inv.maxAcW > 0 && invDcW > inv.maxAcW) ? inv.maxAcW : invDcW;
            });

            dayMap[dateStr].totalWh += systemW;
            dayMap[dateStr].hours.push({
                hour,
                gti_wm2:   gtiCount > 0 ? Math.round(gtiSum / gtiCount) : null,
                power_w:   systemW,
                energy_wh: systemW,
                temp_c:    temp[i]  != null ? Math.round(temp[i] * 10) / 10 : null,
                cloud_pct: cloud[i] != null ? cloud[i] : null,
            });
        });

        const totalWp = inverters.reduce((s, inv) =>
            s + inv.arrays.reduce((as, a) => as + a.panels * a.wp, 0), 0);

        const days = dateStrings.map(ds => {
            const d = dayMap[ds];
            return {
                date:      ds,
                total_wh:  d.totalWh,
                total_kwh: Math.round(d.totalWh / 100) / 10,
                hourly:    d.hours,
            };
        });

        res.json({
            location: { lat, lon },
            total_wp: totalWp,
            days,
        });
    } catch (err) {
        console.error('[solar/tomorrow]', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/solar/stations ─────────────────────────────────────────────────
// Returns all KNMI stations that have known coordinates (for backtest UI)
router.get('/stations', async (req, res) => {
    try {
        const db = mySqlPoolKnmi.promise();
        const [rows] = await db.query('SELECT CODE, OMSCHRIJVING FROM stations ORDER BY CODE');
        const result = rows
            .filter(r => STATION_COORDS[r.CODE])
            .map(r => ({
                code: r.CODE,
                name: r.OMSCHRIJVING,
                lat:  STATION_COORDS[r.CODE].lat,
                lon:  STATION_COORDS[r.CODE].lon,
            }));
        res.json(result);
    } catch (err) {
        console.error('[solar/stations]', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/solar/backtest ──────────────────────────────────────────────────
// Historical panel output for a UTC time range using KNMI uurgeg radiation data.
// Query: ?stn=260&from=2025-05-11T22:00:00&to=2025-05-12T22:00:00&inverters=[...]&efficiency=0.85
router.get('/backtest', async (req, res) => {
    const from       = req.query.from;
    const to         = req.query.to;
    const stn        = parseInt(req.query.stn) || DEFAULT_STN;
    const efficiency = parseFloat(req.query.efficiency) || 0.85;

    if (!from || !to) return res.status(400).json({ error: 'from and to required (ISO UTC, e.g. 2025-05-11T22:00:00)' });

    const coords = STATION_COORDS[stn];
    if (!coords) return res.status(400).json({ error: 'Unknown station: ' + stn });

    let inverters;
    try {
        inverters = JSON.parse(req.query.inverters || '[]');
        if (!Array.isArray(inverters) || !inverters.length) throw new Error('empty');
        for (const inv of inverters) {
            if (!Array.isArray(inv.arrays) || !inv.arrays.length) throw new Error('inverter missing arrays');
        }
    } catch {
        return res.status(400).json({ error: 'inverters param must be a non-empty JSON array, each with arrays' });
    }

    try {
        const db = mySqlPoolKnmi.promise();
        const [rows] = await db.query(
            `SELECT DATE_FORMAT(DATUM_TIJD_VAN, '%Y-%m-%dT%H:%i:%sZ') AS datum_tijd_van,
                    DATE_FORMAT(DATUM_TIJD_TOT, '%Y-%m-%dT%H:%i:%sZ') AS datum_tijd_tot,
                    JAAR AS jaar, MAAND AS maand, DAG AS dag, UUR AS hh,
                    Q, N AS cloud_octants, T/10.0 AS temp_c
             FROM uurgeg
             WHERE STATION = ? AND DATUM_TIJD_VAN >= ? AND DATUM_TIJD_VAN < ?
             ORDER BY DATUM_TIJD_VAN`,
            [stn, from, to]
        );

        if (!rows.length) return res.status(404).json({ error: 'No hourly data for this range at station ' + stn });

        let totalWh = 0;
        const hourly = rows.map(row => {
            const ghiW  = row.Q != null ? row.Q * 10000 / 3600 : 0;
            const solar = solarHourData(ghiW, coords.lat, coords.lon, row.jaar, row.maand, row.dag, row.hh);

            let systemW  = 0;
            let gtiSum   = 0;
            let gtiCount = 0;

            if (solar) {
                inverters.forEach(inv => {
                    let invDcW = 0;
                    inv.arrays.forEach(arr => {
                        const gti = gtiHayDavies(solar, arr.tilt, arr.azimuth);
                        invDcW   += Math.round((gti / 1000) * arr.panels * arr.wp * efficiency);
                        gtiSum   += gti;
                        gtiCount += 1;
                    });
                    systemW += (inv.maxAcW > 0 && invDcW > inv.maxAcW) ? inv.maxAcW : invDcW;
                });
            }

            totalWh += systemW;
            return {
                datum_tijd_van: row.datum_tijd_van,
                datum_tijd_tot: row.datum_tijd_tot,
                gti_wm2:    gtiCount > 0 ? Math.round(gtiSum / gtiCount) : null,
                ghi_wm2:    Math.round(ghiW),
                q_jcm2:     row.Q != null ? Math.round(row.Q * 10) / 10 : null,
                power_w:    systemW,
                energy_wh:  systemW,
                temp_c:     row.temp_c        != null ? Math.round(row.temp_c * 10) / 10 : null,
                cloud_pct:  row.cloud_octants != null && row.cloud_octants !== 9
                    ? Math.round(row.cloud_octants / 8 * 100) : null,
            };
        });

        res.json({
            from,
            to,
            stn,
            station_lat: coords.lat,
            station_lon: coords.lon,
            total_wh:    totalWh,
            total_kwh:   Math.round(totalWh / 100) / 10,
            hourly,
        });
    } catch (err) {
        console.error('[solar/backtest]', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
