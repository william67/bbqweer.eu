const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const auth    = require('../middleware/auth.middleware');
const pool    = require('../helpers/mysqlpool-knmi.helper').promise();

// GET /api/users — admin only
router.get('/', auth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, firstName, lastName, email, active FROM users ORDER BY id');
        res.send(rows);
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

// POST /api/users — admin only
router.post('/', auth, async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;
        if (!firstName || !lastName || !email || !password)
            return res.status(400).send({ error: 'All fields required' });
        const hashed = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO users (firstName, lastName, email, password, active) VALUES (?,?,?,?,1)',
            [firstName, lastName, email, hashed]
        );
        res.send({ id: result.insertId });
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

// PUT /api/users/:id — admin only
router.put('/:id', auth, async (req, res) => {
    try {
        const { firstName, lastName, email, active, password } = req.body;
        const fields = [], values = [];
        if (firstName !== undefined) { fields.push('firstName=?'); values.push(firstName); }
        if (lastName  !== undefined) { fields.push('lastName=?');  values.push(lastName); }
        if (email     !== undefined) { fields.push('email=?');     values.push(email); }
        if (active    !== undefined) { fields.push('active=?');    values.push(active ? 1 : 0); }
        if (password) {
            fields.push('password=?');
            values.push(await bcrypt.hash(password, 10));
        }
        if (!fields.length) return res.status(400).send({ error: 'No fields to update' });
        values.push(parseInt(req.params.id));
        await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id=?`, values);
        res.send({ ok: true });
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

module.exports = router;
