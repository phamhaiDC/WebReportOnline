'use strict';

const jwt = require('jsonwebtoken');

// Áp cho toàn bộ /api/* (trừ /api/auth) — xem backend/index.js. Chỉ chấp nhận JWT hợp lệ, ký bởi
// chính server này (routes/auth.js) lúc đăng nhập thành công. Message lỗi cố tình chung chung
// (không phân biệt thiếu header/token sai/hết hạn) — tránh lộ chi tiết cho người dò quét.
function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        req.user = { code: payload.code, name: payload.name, email: payload.email };
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
    }
}

module.exports = requireAuth;
