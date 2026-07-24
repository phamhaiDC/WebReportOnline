const sql = require('mssql');
const { Pool } = require('pg');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    port: parseInt(process.env.DB_PORT, 10),
    options: {
        encrypt: true, // Use this if you're on Windows Azure
        trustServerCertificate: true, // Change to true for local dev / self-signed certs
        requestTimeout: 3000000 // Global timeout 30s
    }
};

const pgPool = new Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: parseInt(process.env.PG_PORT, 10) || 5432,
});

const connectDB = async () => {
    try {
        await sql.connect(config);
        console.log('MSSQL Connected...');

        // Test PG connection
        await pgPool.query('SELECT NOW()');
        console.log('PostgreSQL Connected...');
    } catch (err) {
        console.error('Database connection failed:', err);
    }
};

module.exports = { connectDB, sql, pgPool };
