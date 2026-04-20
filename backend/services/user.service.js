const mySqlPoolKnmi = require('../helpers/mysqlpool-knmi.helper').promise();

async function getUserById(userId) {
    try {
        const [rows] = await mySqlPoolKnmi.query(
            'SELECT id, firstName, lastName, email, active FROM users WHERE id = ?', [userId]
        );
        return rows.length === 1 ? rows[0] : false;
    } catch (err) {
        console.error('getUserById error:', err);
        return false;
    }
}

async function getUserByEmail(email) {
    try {
        const [rows] = await mySqlPoolKnmi.query(
            'SELECT * FROM users WHERE email = ?', [email]
        );
        return rows.length === 1 ? rows[0] : false;
    } catch (err) {
        console.error('getUserByEmail error:', err);
        return false;
    }
}

module.exports = { getUserById, getUserByEmail };
