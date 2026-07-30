'use strict';

const express = require('express');
const router = express.Router();
const svgCaptcha = require('svg-captcha');
const { getCrmPool, sql } = require('../config/crmDb');
const captchaStore = require('../services/captchaStore');
const { captchaLimiter } = require('../middleware/rateLimit');

// Chữ dễ đọc: bỏ hẳn các ký tự dễ nhầm lẫn (I/l/1/L, O/0, U/V/u/v, S/s/5...) khỏi bảng ký tự,
// thay vì chỉ ignoreChars một phần — ignoreChars vẫn giữ lại làm lớp lọc thứ 2 cho an toàn.
const CAPTCHA_CHAR_PRESET = 'ABCDEFGHJKMNPQRTWXYZabcdefghjkmnpqrtwxyz23456789';
const CAPTCHA_IGNORE_CHARS = '0oO1ilILuUvVsS5';

// LƯU Ý (gotcha của svg-captcha): nếu truyền `background`, thư viện tự ép `options.color = true`
// (xem lib/index.js: `if (bg) { options.color = true; }`) — nghĩa là dù mình set color:false,
// chữ vẫn bị tô màu ngẫu nhiên loè loẹt như cũ nếu có background. Muốn chữ ĐEN/XÁM ĐẬM thật sự dễ đọc
// (color:false → dùng random.greyColor, rất tối, gần đen) thì KHÔNG được set background.
function buildCaptcha() {
    const options = {
        size: 5,
        noise: 1,
        color: false,
        width: 200,
        height: 70,
        fontSize: 68,
        charPreset: CAPTCHA_CHAR_PRESET,
        ignoreChars: CAPTCHA_IGNORE_CHARS,
    };

    if (process.env.CAPTCHA_MODE === 'math') {
        return svgCaptcha.createMathExpr({ ...options, mathMin: 1, mathMax: 9, mathOperator: '+' });
    }
    return svgCaptcha.create(options);
}

// @route   GET /api/ecode/captcha
// @desc    Sinh captcha SVG cho luồng xác nhận Update FLAGS coupon
router.get('/captcha', captchaLimiter, (req, res) => {
    const captcha = buildCaptcha();
    const { captchaId } = captchaStore.create(captcha.text);

    return res.json({ captchaId, svg: captcha.data });
});

// @route   POST /api/ecode/toggle-flag
// @desc    Toggle FLAGS coupon 49<->51 qua dbo.usp_ToggleCouponFlag, bắt buộc captcha hợp lệ (single-use)
// TODO(auth): repo hiện chưa có middleware xác thực request (auth.js chỉ validate lúc login,
// không có JWT/session check trên các route sau đó). Khi có middleware auth thật, gắn vào đây
// và thay req.user?.username xuống dưới cho đúng người dùng đang đăng nhập.
router.post('/toggle-flag', async (req, res) => {
    const { couponId, captchaId, captchaAnswer } = req.body || {};

    if (!couponId || !/^\d+$/.test(String(couponId))) {
        return res.status(400).json({ error: 'couponId không hợp lệ' });
    }
    if (!captchaId || !captchaAnswer) {
        return res.status(400).json({ error: 'Thiếu captchaId hoặc captchaAnswer' });
    }

    // Bước 1 — captcha phải hợp lệ trước khi đụng tới DB. verify() luôn tiêu thụ (single-use)
    // captchaId dù đúng hay sai, nên không cần xử lý thêm để chặn retry cùng 1 captcha.
    const captchaOk = captchaStore.verify(captchaId, captchaAnswer);
    if (!captchaOk) {
        return res.status(400).json({ error: 'Captcha không đúng hoặc đã hết hạn' });
    }

    try {
        const pool = await getCrmPool();
        const request = pool.request();
        // COUPON_ID là BIGINT nhưng có thể vượt Number.MAX_SAFE_INTEGER (tedious's sql.BigInt
        // validate() reject thẳng các giá trị này — xem node_modules/tedious/lib/data-types/bigint.js).
        // Truyền dạng VarChar để giữ nguyên độ chính xác, SQL Server tự convert ngầm sang BIGINT
        // khi bind vào tham số @CouponId của proc.
        request.input('CouponId', sql.VarChar(20), String(couponId));
        request.input('ChangedBy', sql.NVarChar(128), req.user?.username ?? 'unknown');
        request.input('ClientIp', sql.VarChar(45), req.ip);
        request.input('AppName', sql.NVarChar(128), 'WEBREPORTONLINE/EcodeCheck');

        const result = await request.execute('dbo.usp_ToggleCouponFlag');
        const row = result.recordset && result.recordset[0];

        return res.json(row);
    } catch (err) {
        console.error('[Ecode] toggle-flag failed:', err.number, err.message);
        if (err.number === 50001 || err.number === 50002) {
            return res.status(409).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Toggle coupon flag failed' });
    }
});

module.exports = router;
