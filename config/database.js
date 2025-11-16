const mysql = require('mysql2');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'mariadb',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'COSS',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool.promise();