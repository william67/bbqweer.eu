const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth.middleware');

const mySqlPoolKnmi = require('../helpers/mysqlpool-knmi.helper');
const pool = mySqlPoolKnmi.promise();

const FIELD_NAMES = ['fieldName_station','fieldName_neerslagstation','fieldName_jaar',
                     'fieldName_maand','fieldName_week','fieldName_dag',
                     'fieldName_seizoen','fieldName_decade'];

// GET /api/knmi-reports/categories
async function getCategories(req, res) {
    try {
        const [rows] = await pool.query(
            'SELECT id, code, name, sort_order FROM categories ORDER BY sort_order, name'
        );
        res.send(rows);
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.sqlMessage || err.message });
    }
}

// GET /api/knmi-reports/datasets
async function getDatasets(req, res) {
    try {
        const [datasets] = await pool.query(
            `SELECT d.id, d.code, d.name, d.category_id, c.name AS category_name,
                    d.chartYn, d.anychart_config, d.chartjs_config, d.sort_order
             FROM datasets d
             LEFT JOIN categories c ON c.id = d.category_id
             ORDER BY c.sort_order, c.name, d.sort_order, d.name`
        );
        const [reports] = await pool.query(
            `SELECT id, dataset_id, name, timebase,
                    input_station, input_neerslagstation,
                    input_jaar, input_maand, input_week,
                    input_dag, input_seizoen, input_decade,
                    fieldName_station, fieldName_neerslagstation, fieldName_jaar,
                    fieldName_maand, fieldName_week, fieldName_dag,
                    fieldName_seizoen, fieldName_decade,
                    anychart_config, chartjs_config,
                    sort_order
             FROM reports ORDER BY sort_order`
        );

        const result = datasets.map(d => ({
            ...d,
            timebases: reports
                .filter(r => r.dataset_id === d.id)
                .map(r => ({
                    id: r.id, timebase: r.timebase, name: r.name,
                    input_station: r.input_station, input_neerslagstation: r.input_neerslagstation,
                    input_jaar: r.input_jaar, input_maand: r.input_maand, input_week: r.input_week,
                    input_dag: r.input_dag, input_seizoen: r.input_seizoen, input_decade: r.input_decade,
                    fieldName_station: r.fieldName_station, fieldName_neerslagstation: r.fieldName_neerslagstation,
                    fieldName_jaar: r.fieldName_jaar, fieldName_maand: r.fieldName_maand,
                    fieldName_week: r.fieldName_week, fieldName_dag: r.fieldName_dag,
                    fieldName_seizoen: r.fieldName_seizoen, fieldName_decade: r.fieldName_decade,
                    anychart_config: r.anychart_config, chartjs_config: r.chartjs_config,
                    sort_order: r.sort_order
                }))
        }));

        res.send(result);
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.sqlMessage || err.message });
    }
}

// GET /api/knmi-reports/stations
function getStations(req, res) {
    mySqlPoolKnmi.query(
        'SELECT CODE as code, CONCAT(OMSCHRIJVING, " (", CODE, ")") as omschrijving FROM stations ORDER BY CODE',
        (err, data) => {
            if (err) return res.status(500).send({ error: err.sqlMessage });
            res.send(data);
        }
    );
}

// GET /api/knmi-reports/neerslagstations
function getNeerslagStations(req, res) {
    mySqlPoolKnmi.query(
        'SELECT CODE as code, CONCAT(OMSCHRIJVING, " (", CODE, ")") as omschrijving FROM neerslagstations ORDER BY CODE',
        (err, data) => {
            if (err) return res.status(500).send({ error: err.sqlMessage });
            res.send(data);
        }
    );
}

// GET /api/knmi-reports/column-mapping
function getColumnMapping(req, res) {
    mySqlPoolKnmi.query(
        'SELECT field, header, decimals, sort_field, format, flex_width FROM column_mapping ORDER BY id',
        (err, data) => {
            if (err) return res.status(500).send({ error: err.sqlMessage || err.message });
            res.send(data);
        }
    );
}

// GET /api/knmi-reports/datasets/:id/export
async function exportDataset(req, res) {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).send({ error: 'Invalid id' });
    try {
        const [datasets] = await pool.query(
            `SELECT d.id, d.code, d.name, d.category_id, c.code AS category_code, c.name AS category_name,
                    d.chartYn, d.anychart_config, d.chartjs_config, d.sort_order
             FROM datasets d
             LEFT JOIN categories c ON c.id = d.category_id
             WHERE d.id = ?`, [id]
        );
        if (!datasets.length) return res.status(404).send({ error: 'Dataset not found' });

        const [reports] = await pool.query(
            `SELECT name, timebase, query,
                    input_station, input_neerslagstation,
                    input_jaar, input_maand, input_week,
                    input_dag, input_seizoen, input_decade,
                    fieldName_station, fieldName_neerslagstation, fieldName_jaar,
                    fieldName_maand, fieldName_week, fieldName_dag,
                    fieldName_seizoen, fieldName_decade,
                    anychart_config, chartjs_config,
                    sort_order
             FROM reports WHERE dataset_id = ? ORDER BY sort_order`, [id]
        );

        res.send({ version: '1.0', exportedAt: new Date().toISOString(), dataset: datasets[0], reports });
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.sqlMessage || err.message });
    }
}

// GET /api/knmi-reports/reports/:id
async function getReport(req, res) {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).send({ error: 'Invalid id' });
    try {
        const [rows] = await pool.query(
            `SELECT id, dataset_id, name, timebase, query,
                    input_station, input_neerslagstation,
                    input_jaar, input_maand, input_week,
                    input_dag, input_seizoen, input_decade,
                    fieldName_station, fieldName_neerslagstation, fieldName_jaar,
                    fieldName_maand, fieldName_week, fieldName_dag,
                    fieldName_seizoen, fieldName_decade,
                    anychart_config, chartjs_config,
                    sort_order
             FROM reports WHERE id = ?`, [id]
        );
        if (!rows.length) return res.status(404).send({ error: 'Report not found' });
        res.send(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.sqlMessage || err.message });
    }
}

// GET /api/knmi-reports/reports/:id/columns
// Runs the query with LIMIT 0 to detect available column names (for Edit Report fieldName dropdowns)
async function getReportColumns(req, res) {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).send({ error: 'Invalid id' });
    try {
        const [rows] = await pool.query('SELECT query FROM reports WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).send({ error: 'Report not found' });

        const query = rows[0].query
            .replace(/<#SELECTIONS>/g, '')
            .replace(/<#[^>]+>/g, '0');

        const [, fields] = await pool.query(`SELECT * FROM (${query}) _t LIMIT 0`);
        res.send({ columns: fields.map(f => f.name) });
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.sqlMessage || err.message });
    }
}

// POST /api/knmi-reports/execute
async function executeReport(req, res) {
    const { reportId, station, neerslagstation, jaar, maand, dag, week, seizoen, decade } = req.body;

    if (!reportId) return res.status(400).send({ error: 'reportId is required' });
    const numId = parseInt(reportId);
    if (isNaN(numId)) return res.status(400).send({ error: 'Invalid reportId' });

    const toInt     = v => { const n = parseInt(v); return isNaN(n) ? null : n; };
    const validSeiz = v => /^[WLZHwlzh]$/.test(v || '') ? v.toUpperCase() : null;

    try {
        const [rows] = await pool.query(
            `SELECT r.id, r.name, r.timebase, r.query,
                    r.fieldName_station, r.fieldName_neerslagstation, r.fieldName_jaar,
                    r.fieldName_maand, r.fieldName_week, r.fieldName_dag,
                    r.fieldName_seizoen, r.fieldName_decade,
                    r.anychart_config AS report_anychart_config,
                    r.chartjs_config  AS report_chartjs_config,
                    d.chartYn, d.anychart_config, d.chartjs_config, d.name AS datasetName
             FROM reports r
             JOIN datasets d ON d.id = r.dataset_id
             WHERE r.id = ?`,
            [numId]
        );
        if (!rows.length) return res.status(404).send({ error: 'Report not found' });

        const report = rows[0];
        let query = report.query;

        // Build WHERE clause using fieldName_* — field names can be anything, not just sc_ columns
        let selections = '';
        if (report.fieldName_station         && station         != null) { const v = toInt(station);         if (v !== null) selections += ` AND ${report.fieldName_station} = ${v}`; }
        if (report.fieldName_neerslagstation && neerslagstation != null) { const v = toInt(neerslagstation); if (v !== null) selections += ` AND ${report.fieldName_neerslagstation} = ${v}`; }
        if (report.fieldName_jaar            && jaar            != null) { const v = toInt(jaar);            if (v !== null) selections += ` AND ${report.fieldName_jaar} = ${v}`; }
        if (report.fieldName_maand           && maand           != null) { const v = toInt(maand);           if (v !== null) selections += ` AND ${report.fieldName_maand} = ${v}`; }
        if (report.fieldName_dag             && dag             != null) { const v = toInt(dag);             if (v !== null) selections += ` AND ${report.fieldName_dag} = ${v}`; }
        if (report.fieldName_week            && week            != null) { const v = toInt(week);            if (v !== null) selections += ` AND ${report.fieldName_week} = ${v}`; }
        if (report.fieldName_seizoen         && seizoen         != null) { const v = validSeiz(seizoen);     if (v)          selections += ` AND ${report.fieldName_seizoen} = '${v}'`; }
        if (report.fieldName_decade          && decade          != null) { const v = toInt(decade);          if (v !== null) selections += ` AND ${report.fieldName_decade} = ${v}`; }
        query = query.replace(/<#SELECTIONS>/g, selections);

        //console.log('[knmi-reports] execute:', query);

        const [resultRows] = await pool.query(query);
        res.send({
            timebase:        report.timebase,
            datasetName:     report.datasetName,
            reportName:      report.name,
            chartYn:         report.chartYn,
            anychart_config: report.report_anychart_config || report.anychart_config || null,
            chartjs_config:  report.report_chartjs_config  || report.chartjs_config  || null,
            rows:            resultRows
        });
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.sqlMessage || err.message });
    }
}

// PUT /api/knmi-reports/datasets/:id  (auth required)
async function updateDataset(req, res) {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).send({ error: 'Invalid id' });
    const boolFields = ['chartYn'];
    const allowed    = ['code', 'name', 'category_id', 'chartYn', 'anychart_config', 'chartjs_config', 'sort_order'];
    const fields = [], values = [];
    for (const key of allowed) {
        if (!(key in req.body)) continue;
        fields.push(`${key}=?`);
        values.push(boolFields.includes(key) ? (req.body[key] ? 1 : 0) : (req.body[key] ?? null));
    }
    if (!fields.length) return res.status(400).send({ error: 'No fields to update' });
    values.push(id);
    try {
        await pool.query(`UPDATE datasets SET ${fields.join(', ')} WHERE id=?`, values);
        res.send({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.sqlMessage || err.message });
    }
}

// PUT /api/knmi-reports/reports/:id  (auth required)
async function updateReport(req, res) {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).send({ error: 'Invalid id' });
    const boolFields = ['input_station','input_neerslagstation','input_jaar','input_maand',
                        'input_dag','input_week','input_seizoen','input_decade'];
    const allowed    = ['name', 'dataset_id', 'timebase', 'query', ...boolFields, ...FIELD_NAMES, 'sort_order', 'anychart_config', 'chartjs_config'];
    const fields = [], values = [];
    for (const key of allowed) {
        if (!(key in req.body)) continue;
        fields.push(`${key}=?`);
        values.push(boolFields.includes(key) ? (req.body[key] ? 1 : 0) : (req.body[key] ?? null));
    }
    if (!fields.length) return res.status(400).send({ error: 'No fields to update' });
    values.push(id);
    try {
        await pool.query(`UPDATE reports SET ${fields.join(', ')} WHERE id=?`, values);
        res.send({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.sqlMessage || err.message });
    }
}

// POST /api/knmi-reports/datasets  (auth required)
async function createDataset(req, res) {
    const { code, name, category_id, chartYn, anychart_config, chartjs_config, sort_order } = req.body;
    if (!name) return res.status(400).send({ error: 'name is required' });
    try {
        const [result] = await pool.query(
            `INSERT INTO datasets (code, name, category_id, chartYn, anychart_config, chartjs_config, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [code || null, name, category_id ?? null, chartYn ? 1 : 0, anychart_config ?? null, chartjs_config ?? null, sort_order ?? 0]
        );
        res.send({ id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.sqlMessage || err.message });
    }
}

// POST /api/knmi-reports/reports  (auth required)
async function createReport(req, res) {
    const { name, dataset_id, timebase, query,
            input_station, input_neerslagstation,
            input_jaar, input_maand, input_dag,
            input_week, input_seizoen, input_decade,
            fieldName_station, fieldName_neerslagstation, fieldName_jaar,
            fieldName_maand, fieldName_week, fieldName_dag,
            fieldName_seizoen, fieldName_decade,
            anychart_config, chartjs_config,
            sort_order } = req.body;
    if (!name || !dataset_id || !timebase) return res.status(400).send({ error: 'name, dataset_id and timebase are required' });
    try {
        const [result] = await pool.query(
            `INSERT INTO reports
                (name, dataset_id, timebase, query,
                 input_station, input_neerslagstation,
                 input_jaar, input_maand, input_dag,
                 input_week, input_seizoen, input_decade,
                 fieldName_station, fieldName_neerslagstation, fieldName_jaar,
                 fieldName_maand, fieldName_week, fieldName_dag,
                 fieldName_seizoen, fieldName_decade,
                 anychart_config, chartjs_config,
                 sort_order)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [name, dataset_id, timebase, query || '',
             input_station ? 1 : 0, input_neerslagstation ? 1 : 0,
             input_jaar ? 1 : 0, input_maand ? 1 : 0, input_dag ? 1 : 0,
             input_week ? 1 : 0, input_seizoen ? 1 : 0, input_decade ? 1 : 0,
             fieldName_station || null, fieldName_neerslagstation || null, fieldName_jaar || null,
             fieldName_maand || null, fieldName_week || null, fieldName_dag || null,
             fieldName_seizoen || null, fieldName_decade || null,
             anychart_config || null, chartjs_config || null,
             sort_order ?? 0]
        );
        res.send({ id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.sqlMessage || err.message });
    }
}

// POST /api/knmi-reports/categories  (auth required)
async function createCategory(req, res) {
    const { code, name, sort_order } = req.body;
    if (!name) return res.status(400).send({ error: 'name is required' });
    try {
        const [result] = await pool.query(
            'INSERT INTO categories (code, name, sort_order) VALUES (?, ?, ?)',
            [code || null, name, sort_order ?? 0]
        );
        res.send({ id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.sqlMessage || err.message });
    }
}

// PUT /api/knmi-reports/categories/:id  (auth required)
async function updateCategory(req, res) {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).send({ error: 'Invalid id' });
    const allowed = ['code', 'name', 'sort_order'];
    const fields = [], values = [];
    for (const key of allowed) {
        if (!(key in req.body)) continue;
        fields.push(`${key}=?`);
        values.push(req.body[key] ?? null);
    }
    if (!fields.length) return res.status(400).send({ error: 'No fields to update' });
    values.push(id);
    try {
        await pool.query(`UPDATE categories SET ${fields.join(', ')} WHERE id=?`, values);
        res.send({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.sqlMessage || err.message });
    }
}

router.get('/categories',              getCategories);
router.get('/datasets',                getDatasets);
router.get('/datasets/:id/export',     exportDataset);
router.get('/stations',                getStations);
router.get('/neerslagstations',        getNeerslagStations);
router.get('/column-mapping',          getColumnMapping);
router.get('/reports/:id/columns',     getReportColumns);
router.get('/reports/:id',             getReport);
router.post('/execute',                executeReport);
router.post('/categories',        auth, createCategory);
router.post('/datasets',          auth, createDataset);
router.post('/reports',           auth, createReport);
router.put('/categories/:id',     auth, updateCategory);
router.put('/datasets/:id',       auth, updateDataset);
router.put('/reports/:id',        auth, updateReport);

module.exports = router;
