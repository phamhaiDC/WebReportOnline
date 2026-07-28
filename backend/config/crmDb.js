'use strict';

// Kết nối SQL Server riêng cho "Instance 2 — CRM" (R_KEEPER_7_CRM_VTI).
// Dùng lại đúng các biến CRM_* đã có sẵn trong .env — pool lazy, tái sử dụng
// (thay vì dựng ad-hoc mỗi lần như trong routes/healthcheck.js).
const sql = require('mssql');
require('dotenv').config();

let poolPromise = null;

function getCrmConfig() {
    const required = ['CRM_SERVER', 'CRM_DATABASE', 'CRM_USER', 'CRM_PASSWORD'];
    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`CRM DB chưa được cấu hình đầy đủ. Thiếu biến .env: ${missing.join(', ')}`);
    }

    return {
        server: process.env.CRM_SERVER,
        port: parseInt(process.env.CRM_PORT, 10) || 1433,
        database: process.env.CRM_DATABASE,
        user: process.env.CRM_USER,
        password: process.env.CRM_PASSWORD,
        options: {
            encrypt: true,
            trustServerCertificate: true,
        },
        connectionTimeout: 15000,
        requestTimeout: 30000,
    };
}

// Pool riêng, tạo lười (lazy) và tái sử dụng. Nếu pool bị lỗi/đóng, tạo lại ở lần gọi sau.
async function getCrmPool() {
    if (poolPromise) return poolPromise;

    const config = getCrmConfig();
    const pool = new sql.ConnectionPool(config);
    pool.on('error', err => {
        console.error('[CrmDB] Pool error:', err.message);
        poolPromise = null;
    });

    poolPromise = pool.connect().catch(err => {
        poolPromise = null;
        throw err;
    });

    return poolPromise;
}

module.exports = { getCrmPool, sql };
