'use strict';

const express = require('express');
const router  = express.Router();
const mySqlPoolKnmi = require('../helpers/mysqlpool-knmi.helper');

router.get('/prices', async (req, res) => {
    try {
        const db = mySqlPoolKnmi.promise();
        const [rows] = await db.query(`
            SELECT priceDate, priceHour, priceKwh, source
            FROM energie_prices
            WHERE priceDate BETWEEN DATE_SUB(CURDATE(), INTERVAL 1 DAY)
                              AND DATE_ADD(CURDATE(), INTERVAL 2 DAY)
            ORDER BY priceDate, priceHour
        `);
        res.json(rows);
    } catch (err) {
        console.error('energie prices route error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
