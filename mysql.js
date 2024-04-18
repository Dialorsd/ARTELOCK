
const mysql = require('mysql');

const pool = mysql.createPool({
    connectionLimit: 10,
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'work'
});

pool.on('error', (err) => {
    console.error('MySQL pool error:', err);
});

module.exports = pool;
