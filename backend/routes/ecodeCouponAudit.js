'use strict';

const express = require('express');
const router = express.Router();
const { getCrmPool, sql } = require('../config/crmDb');

// @route   GET /api/ecode/audit?couponId=...
// @desc    Lịch sử thay đổi FLAGS của 1 coupon (dbo.usp_GetCouponFlagAuditByCoupon, CRM instance)
router.get('/audit', async (req, res) => {
    const couponId = String(req.query.couponId || '').trim();

    if (!couponId || !/^\d+$/.test(couponId)) {
        return res.status(400).json({ error: 'couponId không hợp lệ' });
    }

    try {
        const pool = await getCrmPool();
        const request = pool.request();
        // COUPON_ID là BIGINT nhưng có thể vượt Number.MAX_SAFE_INTEGER (tedious's sql.BigInt
        // validate() reject thẳng các giá trị này). Truyền dạng VarChar để giữ nguyên độ chính xác,
        // cùng cách ecodeCouponFlag.js đang làm cho @CouponId.
        request.input('CouponId', sql.VarChar(20), couponId);

        const result = await request.execute('dbo.usp_GetCouponFlagAuditByCoupon');

        return res.json({ items: result.recordset });
    } catch (err) {
        console.error('[Ecode] audit failed:', err.message);
        return res.status(500).json({ error: 'Lấy lịch sử audit thất bại', detail: err.message });
    }
});

// @route   GET /api/ecode/audit-history?days=...&ecode=...
// @desc    Lịch sử thay đổi FLAGS trong N ngày gần nhất, hoặc theo 1 ecode cụ thể (all-time)
//          (dbo.usp_GetCouponFlagAuditHistory, CRM instance)
router.get('/audit-history', async (req, res) => {
    const ecodeRaw = req.query.ecode != null ? String(req.query.ecode).trim() : '';
    const hasEcode = ecodeRaw.length > 0;

    if (hasEcode && !/^\d{1,13}$/.test(ecodeRaw)) {
        return res.status(400).json({ error: 'ecode chỉ được chứa tối đa 13 chữ số' });
    }

    let days = parseInt(req.query.days, 10);
    if (!Number.isFinite(days)) days = 5;
    days = Math.min(90, Math.max(1, days));

    try {
        const pool = await getCrmPool();
        const request = pool.request();
        request.input('Top', sql.Int, 500);

        if (hasEcode) {
            request.input('Ecode', sql.VarChar(13), ecodeRaw);
        } else {
            request.input('Days', sql.Int, days);
        }

        const result = await request.execute('dbo.usp_GetCouponFlagAuditHistory');

        return res.json({
            items: result.recordset,
            mode: hasEcode ? 'ecode' : 'days',
            days: hasEcode ? null : days,
            ecode: hasEcode ? ecodeRaw : null,
        });
    } catch (err) {
        console.error('[Ecode] audit-history failed:', err.message);
        return res.status(500).json({ error: 'Lấy lịch sử audit thất bại', detail: err.message });
    }
});

module.exports = router;
