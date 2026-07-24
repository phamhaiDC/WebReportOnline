'use strict';

const express = require('express');
const router = express.Router();
const { getEcodePool, sql } = require('../config/ecodeDb');
const cache = require('../services/ecodeCache');

const CACHE_TTL_MS = 60 * 1000;
const CACHE_TTL_LIVE_MS = 30 * 1000;

function todayDateOnly() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Chuẩn hoá SaleDate trả về từ mssql (Date object hoặc string) về key YYYY-MM-DD (local, không lệch timezone)
function normalizeSaleDateKey(saleDate) {
    if (saleDate instanceof Date) return toDateKey(saleDate);
    return String(saleDate).split('T')[0];
}

// @route   GET /api/ecode/coupon-usage/today-live
// @desc    Coupon theo giờ của HÔM NAY (0..giờ hiện tại) + baseline TB cùng giờ 7 ngày trước + freshness (MAX(LoadedAt))
router.get('/today-live', async (req, res) => {
    try {
        const result = await cache.getOrSet('today-live', CACHE_TTL_LIVE_MS, async () => {
            const pool = await getEcodePool();

            const liveResult = await pool.request().query(`
                DECLARE @Today date = CAST(GETDATE() AS date);
                DECLARE @H int = DATEPART(HOUR, GETDATE());

                SELECT SaleHour, CouponUse
                FROM dbo.RPT_COUPON_USAGE_HOURLY
                WHERE SaleDate = @Today AND SaleHour <= @H
                ORDER BY SaleHour;

                SELECT SaleHour, AVG(CAST(CouponUse AS float)) AS avg_use
                FROM dbo.RPT_COUPON_USAGE_HOURLY
                WHERE SaleDate >= DATEADD(DAY,-7,@Today) AND SaleDate < @Today
                GROUP BY SaleHour ORDER BY SaleHour;

                SELECT CONVERT(varchar(16), MAX(LoadedAt), 120) AS last_etl FROM dbo.RPT_COUPON_USAGE_HOURLY;
            `);

            const [hoursRecordset, baselineRecordset, freshnessRecordset] = liveResult.recordsets;

            // last_etl đã là chuỗi 'yyyy-mm-dd hh:mi' format sẵn trong SQL (không qua Date object)
            // để tránh driver/browser áp thêm timezone offset — đọc thẳng giờ trên server, không quy đổi.
            return {
                currentHour: new Date().getHours(),
                hours: hoursRecordset.map(r => ({ hour: r.SaleHour, couponUse: Number(r.CouponUse) || 0 })),
                baseline: baselineRecordset.map(r => ({ hour: r.SaleHour, avgUse: Number(r.avg_use) || 0 })),
                lastEtl: freshnessRecordset[0]?.last_etl || null,
            };
        });

        return res.json(result);
    } catch (err) {
        console.error('[Ecode] today-live failed:', err.message);
        return res.status(500).json({ msg: 'Ecode coupon usage (today-live) failed', error: err.message });
    }
});

// @route   GET /api/ecode/coupon-usage/hourly?days=5|7|14
// @desc    Coupon usage theo giờ của N ngày gần nhất (gồm hôm nay), densified 24h, cap giờ tương lai của hôm nay
router.get('/hourly', async (req, res) => {
    try {
        const allowedDays = [5, 7, 14];
        let days = parseInt(req.query.days, 10);
        if (!allowedDays.includes(days)) days = 7;

        const cacheKey = `hourly:${days}`;
        const result = await cache.getOrSet(cacheKey, CACHE_TTL_MS, async () => {
            const pool = await getEcodePool();
            const request = pool.request();
            request.input('days', sql.Int, days);

            const queryResult = await request.query(`
                SELECT SaleDate, SaleHour, CouponUse
                FROM dbo.RPT_COUPON_USAGE_HOURLY
                WHERE SaleDate >= DATEADD(DAY, -(@days-1), CAST(GETDATE() AS date))
                ORDER BY SaleDate, SaleHour;
            `);

            const nowHour = new Date().getHours();
            const todayKey = toDateKey(todayDateOnly());

            // Densify: mỗi ngày trong khoảng đủ 24 giờ (0..23), giờ thiếu = 0
            const byDate = new Map();
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(todayDateOnly());
                d.setDate(d.getDate() - i);
                const key = toDateKey(d);
                byDate.set(key, new Array(24).fill(0));
            }

            queryResult.recordset.forEach(row => {
                const key = normalizeSaleDateKey(row.SaleDate);
                const hours = byDate.get(key);
                if (hours && row.SaleHour >= 0 && row.SaleHour <= 23) {
                    hours[row.SaleHour] = Number(row.CouponUse) || 0;
                }
            });

            // Cap: ngày hôm nay bỏ (null hoá) các giờ > giờ hiện tại — tránh nhiễu do điểm bán cấu hình sai giờ
            const days_ = Array.from(byDate.entries()).map(([date, hours]) => {
                const isToday = date === todayKey;
                const values = isToday
                    ? hours.map((v, h) => (h > nowHour ? null : v))
                    : hours;
                return { date, isToday, hours: values };
            });

            return { days: days_, nowHour };
        });

        return res.json(result);
    } catch (err) {
        console.error('[Ecode] hourly failed:', err.message);
        return res.status(500).json({ msg: 'Ecode coupon usage (hourly) failed', error: err.message });
    }
});

// @route   GET /api/ecode/coupon-usage/kpi
// @desc    So sánh coupon hôm nay-đến-giờ-H vs cùng giờ hôm qua / tuần trước, + tổng 7 ngày gần nhất
router.get('/kpi', async (req, res) => {
    try {
        const result = await cache.getOrSet('kpi', CACHE_TTL_MS, async () => {
            const pool = await getEcodePool();
            const queryResult = await pool.request().query(`
                DECLARE @Today date = CAST(GETDATE() AS date);
                DECLARE @H int = DATEPART(HOUR, GETDATE());
                SELECT
                  today_to_now  = ISNULL(SUM(CASE WHEN SaleDate=@Today                 AND SaleHour<=@H THEN CouponUse END),0),
                  yday_to_now   = ISNULL(SUM(CASE WHEN SaleDate=DATEADD(DAY,-1,@Today) AND SaleHour<=@H THEN CouponUse END),0),
                  lastwk_to_now = ISNULL(SUM(CASE WHEN SaleDate=DATEADD(DAY,-7,@Today) AND SaleHour<=@H THEN CouponUse END),0),
                  last7_total   = ISNULL(SUM(CASE WHEN SaleDate>=DATEADD(DAY,-6,@Today) THEN CouponUse END),0)
                FROM dbo.RPT_COUPON_USAGE_HOURLY;
            `);

            const row = queryResult.recordset[0] || {};
            return {
                todayToNow: Number(row.today_to_now) || 0,
                ydayToNow: Number(row.yday_to_now) || 0,
                lastwkToNow: Number(row.lastwk_to_now) || 0,
                last7Total: Number(row.last7_total) || 0,
                nowHour: new Date().getHours(),
            };
        });

        return res.json(result);
    } catch (err) {
        console.error('[Ecode] kpi failed:', err.message);
        return res.status(500).json({ msg: 'Ecode coupon usage (kpi) failed', error: err.message });
    }
});

// @route   GET /api/ecode/coupon-usage/heatmap?weeks=12
// @desc    TB coupon/giờ theo Giờ x Thứ trong tuần, N tuần gần nhất
router.get('/heatmap', async (req, res) => {
    try {
        let weeks = parseInt(req.query.weeks, 10);
        if (!Number.isFinite(weeks) || weeks <= 0) weeks = 12;

        const cacheKey = `heatmap:${weeks}`;
        const result = await cache.getOrSet(cacheKey, CACHE_TTL_MS, async () => {
            const pool = await getEcodePool();
            const request = pool.request();
            request.input('weeks', sql.Int, weeks);

            const queryResult = await request.query(`
                SELECT WeekdayNo, WeekdayName, SaleHour, AVG(CAST(CouponUse AS float)) AS avg_use
                FROM dbo.RPT_COUPON_USAGE_HOURLY
                WHERE SaleDate >= DATEADD(DAY, -(@weeks*7), CAST(GETDATE() AS date))
                GROUP BY WeekdayNo, WeekdayName, SaleHour;
            `);

            return queryResult.recordset.map(r => ({
                weekdayNo: r.WeekdayNo,
                weekdayName: r.WeekdayName,
                hour: r.SaleHour,
                avgUse: Number(r.avg_use) || 0,
            }));
        });

        return res.json(result);
    } catch (err) {
        console.error('[Ecode] heatmap failed:', err.message);
        return res.status(500).json({ msg: 'Ecode coupon usage (heatmap) failed', error: err.message });
    }
});

// @route   GET /api/ecode/coupon-usage/daily-trend?days=14
// @desc    Tổng coupon/ngày + trung bình trượt 7 ngày
router.get('/daily-trend', async (req, res) => {
    try {
        let days = parseInt(req.query.days, 10);
        if (!Number.isFinite(days) || days <= 0) days = 14;

        const cacheKey = `daily-trend:${days}`;
        const result = await cache.getOrSet(cacheKey, CACHE_TTL_MS, async () => {
            const pool = await getEcodePool();
            const request = pool.request();
            request.input('days', sql.Int, days);

            const queryResult = await request.query(`
                SELECT SaleDate, SUM(CouponUse) AS daily_use
                FROM dbo.RPT_COUPON_USAGE_HOURLY
                WHERE SaleDate >= DATEADD(DAY, -(@days-1), CAST(GETDATE() AS date))
                GROUP BY SaleDate
                ORDER BY SaleDate;
            `);

            const rows = queryResult.recordset.map(r => ({
                date: normalizeSaleDateKey(r.SaleDate),
                dailyUse: Number(r.daily_use) || 0,
            }));

            const withMovingAvg = rows.map((row, i) => {
                const start = Math.max(0, i - 6);
                const slice = rows.slice(start, i + 1);
                const avg = slice.reduce((sum, r) => sum + r.dailyUse, 0) / slice.length;
                return { ...row, movingAvg7: Math.round(avg) };
            });

            return withMovingAvg;
        });

        return res.json(result);
    } catch (err) {
        console.error('[Ecode] daily-trend failed:', err.message);
        return res.status(500).json({ msg: 'Ecode coupon usage (daily-trend) failed', error: err.message });
    }
});

// @route   GET /api/ecode/coupon-usage/monthly?year=2026
// @desc    Tổng coupon theo tháng trong năm
router.get('/monthly', async (req, res) => {
    try {
        let year = parseInt(req.query.year, 10);
        if (!Number.isFinite(year)) year = new Date().getFullYear();

        const cacheKey = `monthly:${year}`;
        const result = await cache.getOrSet(cacheKey, CACHE_TTL_MS, async () => {
            const pool = await getEcodePool();
            const request = pool.request();
            request.input('year', sql.Int, year);

            const queryResult = await request.query(`
                SELECT SaleYear, SaleMonth, SUM(CouponUse) AS total_use
                FROM dbo.RPT_COUPON_USAGE_HOURLY
                WHERE SaleYear = @year
                GROUP BY SaleYear, SaleMonth
                ORDER BY SaleMonth;
            `);

            return queryResult.recordset.map(r => ({
                year: r.SaleYear,
                month: r.SaleMonth,
                totalUse: Number(r.total_use) || 0,
            }));
        });

        return res.json(result);
    } catch (err) {
        console.error('[Ecode] monthly failed:', err.message);
        return res.status(500).json({ msg: 'Ecode coupon usage (monthly) failed', error: err.message });
    }
});

module.exports = router;
