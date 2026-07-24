'use strict';

// Kết nối SQL Server riêng cho server "Ecode" (R_KEEPER_7_CRM_VTI_FOR_BK).
// Cô lập hoàn toàn với pool chính (config/db.js) — tài khoản READ-ONLY, chỉ SELECT.
const sql = require('mssql');
require('dotenv').config();

let poolPromise = null;

function getEcodeConfig() {
    const required = ['ECODE_DB_SERVER', 'ECODE_DB_NAME', 'ECODE_DB_USER', 'ECODE_DB_PASSWORD'];
    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Ecode DB chưa được cấu hình đầy đủ. Thiếu biến .env: ${missing.join(', ')}`);
    }

    return {
        server: process.env.ECODE_DB_SERVER,
        port: parseInt(process.env.ECODE_DB_PORT, 10) || 1433,
        database: process.env.ECODE_DB_NAME,
        user: process.env.ECODE_DB_USER,
        password: process.env.ECODE_DB_PASSWORD,
        options: {
            encrypt: process.env.ECODE_DB_ENCRYPT === 'true',
            trustServerCertificate: process.env.ECODE_DB_TRUST_CERT !== 'false',
        },
        connectionTimeout: 15000,
        requestTimeout: 30000,
    };
}

// Pool riêng, tạo lười (lazy) và tái sử dụng. Nếu pool bị lỗi/đóng, tạo lại ở lần gọi sau.
async function getEcodePool() {
    if (poolPromise) return poolPromise;

    const config = getEcodeConfig();
    const pool = new sql.ConnectionPool(config);
    pool.on('error', err => {
        console.error('[EcodeDB] Pool error:', err.message);
        poolPromise = null;
    });

    poolPromise = pool.connect().catch(err => {
        poolPromise = null;
        throw err;
    });

    return poolPromise;
}

module.exports = { getEcodePool, sql };
