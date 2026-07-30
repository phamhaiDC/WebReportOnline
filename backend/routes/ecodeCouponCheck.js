'use strict';

const express = require('express');
const router = express.Router();
const { getCrmPool, sql } = require('../config/crmDb');
const { couponCheckLimiter } = require('../middleware/rateLimit');

// @route   GET /api/ecode/coupon-check?ecode=...
// @desc    Tra cứu tình trạng sử dụng 1 coupon theo ecode (dbo.fn_CouponUsageBySuffix, CRM instance)
router.get('/', couponCheckLimiter, async (req, res) => {
    const ecode = String(req.query.ecode || '').trim();

    if (!ecode) {
        return res.status(400).json({ msg: 'Thiếu tham số ecode' });
    }
    if (!/^\d{1,13}$/.test(ecode)) {
        return res.status(400).json({ msg: 'ecode chỉ được chứa tối đa 13 chữ số' });
    }

    try {
        const pool = await getCrmPool();
        const request = pool.request();
        request.input('ecode', sql.VarChar(13), ecode);

        const result = await request.query('SELECT * FROM dbo.fn_CouponUsageBySuffix(@ecode)');

        return res.json(result.recordset);
    } catch (err) {
        console.error('[Ecode] coupon-check failed:', err.message);
        return res.status(500).json({ msg: 'Ecode coupon check failed' });
    }
});

module.exports = router;
