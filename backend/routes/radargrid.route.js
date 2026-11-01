const express = require('express');
const router = express.Router();

const { MongoClient } = require('mongodb');
const fs = require('fs');
const ini = require('ini');

// Serves the radar grids that the radar thread of weather-maps (weather-maps/maps/radar.py, docs/radar-grids.md) keeps in
// MongoDB: collection radar_grids, one document per set (precip, echotop, hail) and 5-minute time `ts` (UTC), the 765 x 700
// grid as zlib-compressed integer codes, value = code * scale + offset. Public weather data: no login. Same MongoDB as
// weathermaps.route.js ([weathermaps] section of config.ini / config.local.ini).
const configFile = fs.existsSync('config.local.ini') ? 'config.local.ini' : 'config.ini';
const config = ini.parse(fs.readFileSync(configFile, 'utf-8'));
const wm = config.weathermaps || {};
const uri = `mongodb://${wm.host || 'mongodb'}:${wm.port || 27017}`;
const dbName = wm.database || 'weathermaps';

let db;
MongoClient.connect(uri)
  .then(client => { db = client.db(dbName); })
  .catch(error => console.error(error));

const SETS = ['precip', 'echotop', 'hail'];
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;      // seconds and milliseconds are optional
const MAX_RANGE_MS = 49 * 60 * 60 * 1000;          // like the WMS image route: at most 2 days at once
const DAY_TZ = 'Europe/Amsterdam';                  // the days of the date picker are local days

const GRID_FIELDS = { rows: 1, cols: 1, dtype: 1, enc: 1, scale: 1, offset: 1, nodata: 1, units: 1 };

const toIso = (d) => d.toISOString().replace('.000Z', 'Z');

// GET /api/radar-grid/frames?set=precip                        -> the grid description and the newest / oldest time of the set
// GET /api/radar-grid/frames?set=precip&from=<ISO>&to=<ISO>    -> plus the frames of that period (max 2 days)
// GET /api/radar-grid/frames?set=precip&from=..&to=..&forecast=1 -> plus `forecast`: { run, frames } of the newest run (precip only)
// A frame: { ts, v, size }. v = when it was stored (goes into the frame URL, a rewritten frame gets a new URL); size = bytes of
// the stored document, a bigger one means more rain in the picture (same idea as the PNG size of the WMS cache).
const getFrames = async (req, res) => {
  try {
    if (!db) return res.status(503).send({ error: 'MongoDB not connected' });
    const set = req.query.set;
    if (!SETS.includes(set)) return res.status(400).send({ error: 'set must be one of ' + SETS.join(', ') });
    const coll = db.collection('radar_grids');

    const newest = await coll.findOne({ set }, { sort: { ts: -1 }, projection: { ts: 1, ...GRID_FIELDS } });
    const oldest = await coll.findOne({ set }, { sort: { ts: 1 }, projection: { ts: 1 } });
    const out = {
      set,
      grid: newest ? { rows: newest.rows, cols: newest.cols, dtype: newest.dtype, enc: newest.enc, scale: newest.scale,
                       offset: newest.offset, nodata: newest.nodata, units: newest.units } : null,
      newest: newest ? toIso(newest.ts) : null,
      oldest: oldest ? toIso(oldest.ts) : null,
      frames: []
    };

    const { from, to } = req.query;
    if (from !== undefined || to !== undefined) {
      if (typeof from !== 'string' || typeof to !== 'string' || !ISO_UTC_RE.test(from) || !ISO_UTC_RE.test(to)) {
        return res.status(400).send({ error: 'from and to must both be UTC ISO times like 2026-10-13T00:00:00Z' });
      }
      const fromMs = Date.parse(from), toMs = Date.parse(to);
      if (isNaN(fromMs) || isNaN(toMs) || toMs < fromMs) return res.status(400).send({ error: 'Invalid period' });
      if (toMs - fromMs > MAX_RANGE_MS) return res.status(400).send({ error: 'Period too long (max 2 days)' });
      const docs = await coll.aggregate([
        { $match: { set, ts: { $gte: new Date(fromMs), $lte: new Date(toMs) } } },
        { $sort: { ts: 1 } },
        { $project: { _id: 0, ts: 1, v: { $toLong: '$fetchedAt' }, size: { $bsonSize: '$$ROOT' } } }
      ]).toArray();
      out.frames = docs.map(d => ({ ts: toIso(d.ts), v: d.v, size: d.size }));
    }
    if (req.query.forecast === '1' && set === 'precip') {
      // the forecast of the newest run (weather-maps keeps one run, 24 steps of 5 minutes); only when it belongs to the newest observation,
      // a forecast that is older than 15 minutes means the sync stopped and would be shown as if it were current
      const f = await db.collection('radar_forecast').aggregate([
        { $match: { set } }, { $sort: { step: 1 } },
        { $project: { _id: 0, ts: 1, run: 1, v: { $toLong: '$fetchedAt' }, size: { $bsonSize: '$$ROOT' } } }
      ]).toArray();
      const fresh = f.length && newest && f[0].run.getTime() >= newest.ts.getTime() - 15 * 60 * 1000;
      out.forecast = fresh ? { run: toIso(f[0].run), frames: f.map(d => ({ ts: toIso(d.ts), v: d.v, size: d.size })) } : null;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.json(out);
  } catch (err) {
    console.error(err, '\r\n');
    res.status(500).send({ error: err.message });
  }
};

// GET /api/radar-grid/days?set=precip -> the local days (Europe/Amsterdam) that have frames: { date, count, first, last }
const getDays = async (req, res) => {
  try {
    if (!db) return res.status(503).send({ error: 'MongoDB not connected' });
    const set = req.query.set;
    if (!SETS.includes(set)) return res.status(400).send({ error: 'set must be one of ' + SETS.join(', ') });
    const rows = await db.collection('radar_grids').aggregate([
      { $match: { set } },
      { $project: { _id: 0, ts: 1 } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$ts', timezone: DAY_TZ } }, count: { $sum: 1 },
                  first: { $min: '$ts' }, last: { $max: '$ts' } } },
      { $sort: { _id: 1 } }
    ]).toArray();
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ days: rows.map(r => ({ date: r._id, count: r.count, first: toIso(r.first), last: toIso(r.last) })) });
  } catch (err) {
    console.error(err, '\r\n');
    res.status(500).send({ error: err.message });
  }
};

// GET /api/radar-grid/frame?set=precip&ts=<ISO>&v=<stored ms>[&forecast=1] -> the zlib bytes of one grid (application/octet-stream);
// forecast=1 = a step of the forecast of the newest run instead of an observation.
// The frontend inflates them (DecompressionStream 'deflate' = zlib) into uint16 (precip) or uint8 codes, row 0 = northern
// edge. `v` is only part of the URL, so a rewritten frame is fetched again; a response may be cached for an hour.
const getFrame = async (req, res) => {
  try {
    if (!db) return res.status(503).send({ error: 'MongoDB not connected' });
    const set = req.query.set;
    const ts = typeof req.query.ts === 'string' && ISO_UTC_RE.test(req.query.ts) ? new Date(req.query.ts) : null;
    if (!SETS.includes(set) || !ts || isNaN(ts.getTime())) return res.status(400).send({ error: 'Invalid set or ts' });
    const d = await db.collection(req.query.forecast === '1' ? 'radar_forecast' : 'radar_grids').findOne({ set, ts }, { projection: { data: 1 } });
    if (!d) return res.status(404).send({ error: 'No such frame' });
    res.set('Content-Type', 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=3600');               // nginx may cache it too: the URL changes with ts and v
    res.send(Buffer.from(d.data.buffer));
  } catch (err) {
    console.error(err, '\r\n');
    res.status(500).send({ error: err.message });
  }
};

router.get('/frames', getFrames);
router.get('/days', getDays);
router.get('/frame', getFrame);

module.exports = router;
