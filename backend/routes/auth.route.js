const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const ini     = require('ini');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { getUserByEmail, getUserById } = require('../services/user.service');

const config = ini.parse(fs.readFileSync('config.ini', 'utf-8'));

// POST /api/auth/login
async function userLogin(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).send({ error: 'Email and password are required' });

        const user     = await getUserByEmail(email);
        const fakeHash = '$2b$10$7s6eFakeHashToPreventTimingAttack1234567890123456789';
        const match    = await bcrypt.compare(password, user ? user.password : fakeHash);

        if (!user || !match)  return res.status(401).send({ error: 'Invalid credentials' });
        if (!user.active)     return res.status(403).send({ error: 'Account disabled' });

        const token = jwt.sign({ userId: user.id }, config.jwt.secret_key, { expiresIn: '30d' });
        res.send({ success: true, userId: user.id, firstName: user.firstName, lastName: user.lastName, token, userRoles: ['admin'] });
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.message });
    }
}

// POST /api/auth/checktoken
async function checkToken(req, res) {
    try {
        const { token } = req.body;
        if (!token) return res.status(403).send({ error: 'Token required' });

        const decoded = jwt.verify(token, config.jwt.secret_key);
        const user    = await getUserById(decoded.userId);

        if (!user || !user.active) return res.status(401).send({ error: 'Invalid token' });

        res.send({ userId: user.id, firstName: user.firstName, lastName: user.lastName, userRoles: ['admin'] });
    } catch (err) {
        res.status(401).send({ error: 'Invalid token' });
    }
}

router.post('/login',      userLogin);
router.post('/checktoken', checkToken);

module.exports = router;
