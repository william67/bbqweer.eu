const fs  = require('fs');
const ini = require('ini');
const jwt = require('jsonwebtoken');
const { getUserById } = require('../services/user.service');

const config = ini.parse(fs.readFileSync('config.ini', 'utf-8'));

const verifyToken = async (req, res, next) => {
    const token = req.body.token || req.query.token || req.headers['x-access-token'];
    if (!token) return res.status(403).send('A token is required for authentication');
    try {
        const decoded = jwt.verify(token, config.jwt.secret_key);
        const user    = await getUserById(decoded.userId);
        if (!user)        return res.status(401).send('User not found');
        if (!user.active) return res.status(403).send('Account disabled');
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).send('Invalid Token');
    }
};

module.exports = verifyToken;
