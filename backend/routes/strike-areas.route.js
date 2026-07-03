'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const pool = require('../helpers/mysqlpool-knmi.helper').promise();

function calcBbox(points) {
    const lats = points.map(p => p.lat);
    const lngs = points.map(p => p.lng);
    return {
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
        minLng: Math.min(...lngs),
        maxLng: Math.max(...lngs)
    };
}

// GET /api/strike-areas — all areas + points — public, read-only
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT id, name, description, color, active, minLat, maxLat, minLng, maxLng, createdAt, updatedAt
            FROM strike_areas
            WHERE active = 1
            ORDER BY name
        `);

        if (rows.length === 0) return res.json([]);

        const areaIds = rows.map(r => r.id);
        const [points] = await pool.query(`
            SELECT areaId, latitude, longitude, orderIndex
            FROM strike_area_points
            WHERE areaId IN (?)
            ORDER BY areaId, orderIndex
        `, [areaIds]);

        const pointsMap = new Map();
        points.forEach(p => {
            if (!pointsMap.has(p.areaId)) pointsMap.set(p.areaId, []);
            pointsMap.get(p.areaId).push({ lat: p.latitude, lng: p.longitude });
        });

        const areas = rows.map(r => ({
            ...r,
            points: pointsMap.get(r.id) || []
        }));
        res.json(areas);
    } catch (err) {
        console.error('[STRIKE-AREAS] get error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/strike-areas — create area with points
router.post('/', auth, async (req, res) => {
    const { name, description, color, points } = req.body;
    if (!name || !points || points.length < 3) {
        return res.status(400).json({ error: 'name and at least 3 points are required' });
    }
    try {
        const bbox = calcBbox(points);
        const [result] = await pool.query(`
            INSERT INTO strike_areas (name, description, color, minLat, maxLat, minLng, maxLng)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [name, description || null, color || '#3388ff', bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng]);

        const areaId = result.insertId;
        await insertPoints(areaId, points);

        const area = await getAreaById(areaId);
        res.json({ insertedRecord: area });
    } catch (err) {
        console.error('[STRIKE-AREAS] post error:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/strike-areas/:id — update name/description/color
router.put('/:id', auth, async (req, res) => {
    const { name, description, color } = req.body;
    try {
        await pool.query(`
            UPDATE strike_areas SET name = ?, description = ?, color = ? WHERE id = ?
        `, [name, description || null, color || '#3388ff', req.params.id]);
        const area = await getAreaById(req.params.id);
        res.json({ updatedRecord: area });
    } catch (err) {
        console.error('[STRIKE-AREAS] put error:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/strike-areas/:id/points — replace all points and recalculate bbox
router.put('/:id/points', auth, async (req, res) => {
    const { points } = req.body;
    if (!points || points.length < 3) {
        return res.status(400).json({ error: 'at least 3 points are required' });
    }
    try {
        const bbox = calcBbox(points);
        await pool.query(`DELETE FROM strike_area_points WHERE areaId = ?`, [req.params.id]);
        await insertPoints(req.params.id, points);
        await pool.query(`
            UPDATE strike_areas SET minLat = ?, maxLat = ?, minLng = ?, maxLng = ? WHERE id = ?
        `, [bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng, req.params.id]);
        const area = await getAreaById(req.params.id);
        res.json({ updatedRecord: area });
    } catch (err) {
        console.error('[STRIKE-AREAS] put points error:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/strike-areas/:id
router.delete('/:id', auth, async (req, res) => {
    try {
        await pool.query(`DELETE FROM strike_areas WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('[STRIKE-AREAS] delete error:', err);
        res.status(500).json({ error: err.message });
    }
});

async function insertPoints(areaId, points) {
    const values = points.map((p, i) => [areaId, p.lat, p.lng, i]);
    await pool.query(`INSERT INTO strike_area_points (areaId, latitude, longitude, orderIndex) VALUES ?`, [values]);
}

async function getAreaById(id) {
    const [[area]] = await pool.query(`SELECT * FROM strike_areas WHERE id = ?`, [id]);
    const [points] = await pool.query(`
        SELECT latitude AS lat, longitude AS lng
        FROM strike_area_points WHERE areaId = ? ORDER BY orderIndex
    `, [id]);
    return { ...area, points };
}

module.exports = router;
