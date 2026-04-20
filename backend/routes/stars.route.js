const express = require('express');
const router = express.Router();

const mySqlPoolKnmi = require('../helpers/mysqlpool-knmi.helper');

async function getStars(req, res) {
    const maxMag  = req.query.maxMag  !== undefined ? parseFloat(req.query.maxMag)  : 6.5;
    const raMin   = req.query.raMin   !== undefined ? parseFloat(req.query.raMin)   : null;
    const raMax   = req.query.raMax   !== undefined ? parseFloat(req.query.raMax)   : null;
    const declMin = req.query.declMin !== undefined ? parseFloat(req.query.declMin) : null;
    const declMax = req.query.declMax !== undefined ? parseFloat(req.query.declMax) : null;

    let sql = `SELECT StarID, ProperName, BayerFlamsteed, RA, Decl, Mag, Spectrum, ColorIndex
               FROM stars
               WHERE Mag <= ?`;
    const values = [maxMag];

    if (raMin !== null && raMax !== null) {
        sql += ' AND RA BETWEEN ? AND ?';
        values.push(raMin, raMax);
    }
    if (declMin !== null && declMax !== null) {
        sql += ' AND Decl BETWEEN ? AND ?';
        values.push(declMin, declMax);
    }

    sql += ' ORDER BY Mag ASC';

    mySqlPoolKnmi.query(sql, values, (err, data) => {
        if (err) {
            console.error(err);
            res.status(500).send({ error: err.sqlMessage });
        } else {
            res.json(data);
        }
    });
}

router.get('/', getStars);

module.exports = router;
