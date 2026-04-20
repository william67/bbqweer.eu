'use strict';

const bcrypt = require('bcryptjs');
const pool   = require('./helpers/mysqlpool-knmi.helper');

const USER = {
    firstName: 'William',
    lastName:  'Oorschot',
    email:     'woorschot67@gmail.com',
    password:  'Admin2024!',
    active:    1
};

(async () => {
    const db   = pool.promise();
    const hash = await bcrypt.hash(USER.password, 10);
    await db.execute(
        'INSERT INTO users (firstName, lastName, email, password, active) VALUES (?,?,?,?,?)',
        [USER.firstName, USER.lastName, USER.email, hash, USER.active]
    );
    console.log(`User created: ${USER.email} / ${USER.password}`);
    process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
