'use strict';

// Kết nối Postgres riêng cho schema "vtiref" (Script Change Logs).
// Cô lập hoàn toàn với pool chính (config/db.js).
const { Pool } = require('pg');
require('dotenv').config();

let pool = null;

function getVtirefConfig() {
    const required = ['VTIREF_DB_HOST', 'VTIREF_DB_NAME', 'VTIREF_DB_USER', 'VTIREF_DB_PASSWORD'];
    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Vtiref DB chưa được cấu hình đầy đủ. Thiếu biến .env: ${missing.join(', ')}`);
    }

    return {
        host: process.env.VTIREF_DB_HOST,
        port: parseInt(process.env.VTIREF_DB_PORT, 10) || 5432,
        database: process.env.VTIREF_DB_NAME,
        user: process.env.VTIREF_DB_USER,
        password: process.env.VTIREF_DB_PASSWORD,
    };
}

// Pool riêng, tạo lười (lazy) và tái sử dụng.
function getVtirefPool() {
    if (pool) return pool;

    pool = new Pool(getVtirefConfig());
    pool.on('error', err => {
        console.error('[VtirefDB] Pool error:', err.message);
        pool = null;
    });

    return pool;
}

const VTIREF_SCHEMA = process.env.VTIREF_DB_SCHEMA || 'vtiref';

module.exports = { getVtirefPool, VTIREF_SCHEMA };
