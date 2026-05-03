'use strict';

const express = require('express');
const router  = express.Router();
const mySqlPoolKnmi = require('../helpers/mysqlpool-knmi.helper');

router.get('/prices', async (req, res) => {
    try {
        const date = req.query.date || null;
        const db = mySqlPoolKnmi.promise();
        const [rows] = await db.query(`
            SELECT priceDate, priceHour, priceKwh, source
            FROM energie_prices
            WHERE priceDate BETWEEN COALESCE(?, CURDATE())
                              AND DATE_ADD(COALESCE(?, CURDATE()), INTERVAL 1 DAY)
            ORDER BY priceDate, priceHour
        `, [date, date]);
        res.json(rows);
    } catch (err) {
        console.error('energie prices route error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
