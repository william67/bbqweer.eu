const express = require('express');
const router  = express.Router();
const mySqlPoolKnmi = require('../helpers/mysqlpool-knmi.helper');

router.get('/tle', (req, res) => {
    const group  = req.query.group;
    const sql    = group
        ? 'SELECT name, tle1, tle2 FROM satellites WHERE groupName = ? ORDER BY name'
        : 'SELECT name, tle1, tle2 FROM satellites ORDER BY name';
    const params = group ? [group] : [];

    mySqlPoolKnmi.query(sql, params, (err, rows) => {
        if (err) {
            console.error('[satellites] DB error:', err);
            return res.status(500).json({ error: err.sqlMessage });
        }
        const text = rows.map(r => `${r.name}\n${r.tle1}\n${r.tle2}`).join('\n') + '\n';
        res.type('text/plain').send(text);
    });
});

module.exports = router;
