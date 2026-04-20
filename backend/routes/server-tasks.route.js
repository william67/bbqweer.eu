const express    = require('express');
const router     = express.Router();
const verifyToken = require('../middleware/auth.middleware');
const pool       = require('../helpers/mysqlpool-knmi.helper');

router.get('/', verifyToken, (req, res) => {
    pool.query('SELECT * FROM `server-tasks` ORDER BY taskCode', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

module.exports = router;
