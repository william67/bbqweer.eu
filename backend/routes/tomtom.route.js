'use strict';

const express = require('express');
const router = express.Router();
const tomtom = require('../helpers/tomtom.helper');

// GET /api/tomtom/incidents — public. Served from an in-memory cache refreshed
// every 2 minutes by backend/helpers/tomtom.helper.js — this route never calls
// TomTom itself, so exposing it publicly costs no extra API quota.
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
