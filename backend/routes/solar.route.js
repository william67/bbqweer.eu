'use strict';

const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const mySqlPoolKnmi = require('../helpers/mysqlpool-knmi.helper');

const DEFAULT_STN = 260; // De Bilt

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
// Expected solar panel output for tomorrow using Open-Meteo forecast
// Open-Meteo handles tilt+azimuth geometry via global_tilted_irradiance
//
// Query params:
//   lat       - latitude  (default: 52.09 De Bilt)
//   lon       - longitude (default: 5.18)
//   tilt      - panel tilt in degrees from horizontal (default: 35)
//   azimuth   - panel azimuth: 0=south, -90=east, 90=west (default: 0)
//   panels    - number of panels (default: 1)
//   wp        - Wp per panel (default: 400)
//   efficiency - performance ratio incl. inverter + degradation (default: 0.85)
//   maxAcW    - inverter AC output limit in W (default: 0 = no clipping)
router.get('/tomorrow', async (req, res) => {
    const lat        = parseFloat(req.query.lat)        || 52.09;
    const lon        = parseFloat(req.query.lon)        || 5.18;
    const tilt       = parseFloat(req.query.tilt)       || 35;
    const azimuth    = parseFloat(req.query.azimuth)    || 0;
    const panels     = parseInt(req.query.panels)       || 1;
    const wp         = parseFloat(req.query.wp)         || 400;
    const efficiency = parseFloat(req.query.efficiency) || 0.85;
    const maxAcW     = parseFloat(req.query.maxAcW)     || 0;

    const totalWp = panels * wp;

    try {
        const url = 'https://api.open-meteo.com/v1/forecast';
        const { data } = await axios.get(url, {
            params: {
                latitude:   lat,
                longitude:  lon,
                hourly:     'global_tilted_irradiance,temperature_2m,cloud_cover',
                tilt,
                azimuth,
                forecast_days: 2,
                timezone:   'Europe/Amsterdam',
            },
            timeout: 10000,
        });

        const times = data.hourly.time;
        const gti   = data.hourly.global_tilted_irradiance;
        const temp  = data.hourly.temperature_2m;
        const cloud = data.hourly.cloud_cover;

        // Filter to tomorrow only
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().slice(0, 10);

        const hours = [];
        let totalWh = 0;

        times.forEach((t, i) => {
            if (!t.startsWith(tomorrowStr)) return;
            const hour = parseInt(t.slice(11, 13));
            // Power (W) = (GTI W/m² / 1000) × totalWp × efficiency, capped at inverter limit
            let powerW = gti[i] != null ? Math.round((gti[i] / 1000) * totalWp * efficiency) : 0;
            if (maxAcW > 0 && powerW > maxAcW) powerW = maxAcW;
            const energyWh = powerW; // 1 hour period → W = Wh
            totalWh += energyWh;
            hours.push({
                hour,
                gti_wm2:   gti[i] != null   ? Math.round(gti[i])   : null,
                power_w:   powerW,
                energy_wh: energyWh,
                temp_c:    temp[i]  != null  ? Math.round(temp[i] * 10) / 10  : null,
                cloud_pct: cloud[i] != null  ? cloud[i] : null,
            });
        });

        res.json({
            date:       tomorrowStr,
            location:   { lat, lon },
            panels:     { count: panels, wp_each: wp, total_wp: totalWp, tilt, azimuth, efficiency },
            total_kwh:  Math.round(totalWh / 100) / 10,
            total_wh:   totalWh,
            hourly:     hours,
        });
    } catch (err) {
        console.error('[solar/tomorrow]', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
