const fs    = require('fs');
const ini   = require('ini');
const mysql = require('mysql2');

const configFile = fs.existsSync('config.local.ini') ? 'config.local.ini' : 'config.ini';
const config = ini.parse(fs.readFileSync(configFile, 'utf-8'));
console.log(`mySqlPoolKnmi using ${configFile}`);

const mySqlPoolKnmi = mysql.createPool({
    host:     config.mysql_knmi.host,
    port:     config.mysql_knmi.port || 3306,
    user:     config.mysql_knmi.user,
    password: config.mysql_knmi.password,
    database: config.mysql_knmi.database,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    timezone: 'Z',
    decimalNumbers: true
});

console.log(`mySqlPoolKnmi initiated (${config.mysql_knmi.host}:${config.mysql_knmi.port || 3306})`);

module.exports = mySqlPoolKnmi;
