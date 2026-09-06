'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const ntfy = require('../helpers/ntfy.helper');

const TEST_MESSAGES = {
    traffic: {
        topic: 'filealerts',
        title: 'Filemelding (test)',
        message: 'Dit is een testbericht voor filemeldingen.',
        tags: 'warning'
    },
    lightning: {
        topic: 'strikealerts',
        title: '⚡ Bliksemwaarschuwing (test)',
        message: 'Dit is een testbericht voor bliksemwaarschuwingen.',
        tags: 'warning,zap'
    },
    server: {
        topic: 'servererrors',
        title: '🔴 bbqweer.eu (test)',
        message: 'Dit is een testbericht van bbqweer.eu voor server-/taakfouten.',
        tags: 'warning'
    }
};

// POST /api/ntfy/test — auth-protected manual test push, { type: 'traffic' | 'lightning' | 'server' }
router.post('/test', auth, (req, res) => {
    const preset = TEST_MESSAGES[req.body.type];
    if (!preset) {
        return res.status(400).json({ error: "type must be 'traffic', 'lightning' or 'server'" });
    }
    // No dedupe key — a manual test click should always send, even if fired twice in a row.
    ntfy.sendAlert({ ...preset, priority: 'high' });
    res.json({ queued: true });
});

module.exports = router;
