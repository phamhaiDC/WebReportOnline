'use strict';

// Store captcha in-memory cho luồng xác thực trước khi ghi (toggle FLAGS coupon).
// Single-use (xoá ngay sau lần verify đầu) + TTL 3 phút.
// LƯU Ý: nếu sau này deploy nhiều instance (load-balanced), Map này không còn đúng
// (mỗi instance giữ store riêng) — khi đó cần thay bằng bảng DB hoặc Redis dùng chung.
const crypto = require('crypto');

const TTL_MS = 3 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

const store = new Map();

function create(text) {
    const captchaId = crypto.randomUUID();
    store.set(captchaId, { text, expiresAt: Date.now() + TTL_MS });
    return { captchaId, text };
}

// Chuẩn hoá 2 phía trước khi so sánh: bỏ khoảng trắng đầu/cuối lẫn ở giữa, không phân biệt hoa/thường.
// (vd tránh lệch do người dùng lỡ gõ dính dấu cách, hoặc lệch hoa/thường giữa text lưu và answer nhập).
function norm(s) {
    return String(s ?? '').trim().replace(/\s+/g, '').toLowerCase();
}

function verify(captchaId, answer) {
    if (!captchaId || !answer) return false;
    const entry = store.get(captchaId);
    // Single-use: xoá ngay khi lấy ra, bất kể đúng/sai — không cho retry bằng cùng captchaId.
    store.delete(captchaId);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) return false;
    return norm(entry.text) === norm(answer);
}

function cleanupExpired() {
    const now = Date.now();
    for (const [id, entry] of store.entries()) {
        if (entry.expiresAt < now) store.delete(id);
    }
}

setInterval(cleanupExpired, CLEANUP_INTERVAL_MS).unref();

module.exports = { create, verify };
