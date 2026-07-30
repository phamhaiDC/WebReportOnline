'use strict';

const rateLimit = require('express-rate-limit');

// Giới hạn thử đăng nhập — chặn brute-force mật khẩu qua RK7 API.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Quá nhiều lần thử đăng nhập, vui lòng thử lại sau ít phút' },
});

// Giới hạn sinh captcha — chặn spam sinh captcha hàng loạt.
const captchaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Quá nhiều yêu cầu captcha, vui lòng thử lại sau ít phút' },
});

// Giới hạn tra cứu coupon theo ecode — chặn dò quét hàng loạt mã ecode (13 chữ số).
const couponCheckLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { msg: 'Quá nhiều yêu cầu tra cứu, vui lòng thử lại sau ít phút' },
});

// Giới hạn toggle FLAGS coupon — route ghi dữ liệu thật, captcha đã chặn brute-force answer
// nhưng chưa giới hạn tần suất gọi tổng thể.
const toggleFlagLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút' },
});

module.exports = { loginLimiter, captchaLimiter, couponCheckLimiter, toggleFlagLimiter };
