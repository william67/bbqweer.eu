const express = require('express');
const router = express.Router();

const { MongoClient } = require('mongodb');
const fs = require('fs');
const ini = require('ini');

// Serves the model grids that the weather-maps service (weather-maps/, docs/weather-charts.md) keeps in MongoDB:
// weather_grid_runs says which run of every model and grid is current and complete, weather_grids holds one packed
// grid per model, grid, run, step and parameter. Public weather data: no login. Connection settings come from the
// [weathermaps] section of config.ini / config.local.ini (same file the pool helper picks).
const configFile = fs.existsSync('config.local.ini') ? 'config.local.ini' : 'config.ini';
const config = ini.parse(fs.readFileSync(configFile, 'utf-8'));
const wm = config.weathermaps || {};
const uri = `mongodb://${wm.host || 'mongodb'}:${wm.port || 27017}`;
const dbName = wm.database || 'weathermaps';

let db;
MongoClient.connect(uri)
  .then(client => { db = client.db(dbName); })
  .catch(error => console.error(error));

const MODEL_ORDER = ['ecmwf', 'gfs', 'icon-eu', 'harmonie'];
const PARAMS = ['msl', 't2m', 'u10', 'v10', 'precip', 'gust', 'prate', 'ptype', 'snow'];
const SAFE = /^[a-z0-9.\-]+$/;

// The complete runs of a weather_grid_runs document (newest first); a document of the first version has one run at the
// top level and no list.
const runsOf = (r) => (r.runs && r.runs.length) ? r.runs : [{ run: r.run, steps: r.steps, params: r.params, meta: r.meta }];

// GET /api/weather-maps/models -> per model and grid: the complete runs (newest first, with their steps) and the
// timeline that merges them: for every valid time the run and step to use (the newest run for its whole range, an
// older run only after the end of the newer ones, see weather-maps/maps/store.py build_timeline)
const getModels = async (req, res) => {
  try {
    if (!db) return res.status(503).send({ error: 'MongoDB not connected' });
    const docs = await db.collection('weather_grid_runs').find().toArray();
    docs.sort((a, b) => (MODEL_ORDER.indexOf(a.model) - MODEL_ORDER.indexOf(b.model)) || (parseFloat(b.grid) - parseFloat(a.grid)));
    res.json(docs.map(d => {
      const runs = runsOf(d);
      const timeline = (d.timeline && d.timeline.length) ? d.timeline.map(t => ({ valid: t.valid.toISOString(), run: t.run.toISOString(), step: t.step }))
        : runs[0].steps.map(s => ({ valid: new Date(runs[0].run.getTime() + s * 3600e3).toISOString(), run: runs[0].run.toISOString(), step: s }));
      return {
        id: d._id, model: d.model, grid: d.grid, run: runs[0].run.toISOString(), params: runs[0].params,
        fetchedAt: runs[0].meta && runs[0].meta.fetchedAt ? runs[0].meta.fetchedAt : null,
        runs: runs.map(r => ({ run: r.run.toISOString(), steps: r.steps, params: r.params })),
        timeline
      };
    }));
  } catch (err) {
    console.error(err, '\r\n');
    res.status(500).send({ error: err.message });
  }
};

// GET /api/weather-maps/field?model=&grid=&run=<ISO>&step=&param= -> one grid (the packed bytes as base64: zlib of the
// high bytes of the uint16 values followed by the low bytes, value = min + q * (max - min) / 65535, row 0 is the
// northern edge). The run is part of the URL, so a response never changes and may be cached for good; a run that has
// been replaced answers 404 and the page reloads the model list.
const getField = async (req, res) => {
  try {
    if (!db) return res.status(503).send({ error: 'MongoDB not connected' });
    const { model, grid, param } = req.query;
    const step = parseInt(req.query.step, 10);
    const run = new Date(req.query.run);
    if (!SAFE.test(model || '') || !SAFE.test(grid || '') || !PARAMS.includes(param) || isNaN(step) || isNaN(run.getTime())) {
      return res.status(400).send({ error: 'Invalid model, grid, param, step or run' });
    }
    const d = await db.collection('weather_grids').findOne({ model, grid, run, step, param });
    if (!d) return res.status(404).send({ error: 'No such grid (the run may have been replaced)' });
    res.set('Cache-Control', 'public, max-age=31536000, immutable');   // public data, same URL = same bytes
    res.json({
      model: d.model, grid: d.grid, run: d.run.toISOString(), step: d.step, param: d.param, units: d.units,
      nx: d.nx, ny: d.ny, lat0: d.lat0, lon0: d.lon0, dlat: d.dlat, dlon: d.dlon, min: d.min, max: d.max,
      packed: Buffer.from(d.packed.buffer).toString('base64')
    });
  } catch (err) {
    console.error(err, '\r\n');
    res.status(500).send({ error: err.message });
  }
};

router.get('/models', getModels);
router.get('/field', getField);

module.exports = router;
