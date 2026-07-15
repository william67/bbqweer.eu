'use strict';

const express = require('express');
const router = express.Router();
const tomtom = require('../helpers/tomtom.helper');

// GET /api/tomtom/incidents — public. Served from an in-memory cache refreshed
// every 10 minutes, 07:00-19:00 Amsterdam time, by backend/helpers/tomtom.helper.js
// (see that file for the free-tier-quota reasoning) — this route never calls TomTom
// itself, so exposing it publicly costs no extra API quota.
router.get('/incidents', async (req, res) => {
    try {
        const data = await tomtom.getIncidents();
        res.json(data);
    } catch (err) {
        console.error('[TOMTOM] incidents error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
