'use strict';

const express = require('express');
const router = express.Router();
const { getVtirefPool, VTIREF_SCHEMA } = require('../config/vtirefDb');

const DEFAULT_LIMIT = 5000;
const MAX_LIMIT = 20000;
const DEFAULT_HISTORY_HOURS = 3; // Mặc định chỉ lấy 3h gần nhất — cả ngày quá nhiều dòng, dễ chạm LIMIT
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;

// Date đã dịch +07 -> chuỗi "YYYY-MM-DD HH:mm:ss" (đọc bằng getUTC* vì đã dịch thủ công).
function formatVNParts(vnShiftedDate) {
    const yyyy = vnShiftedDate.getUTCFullYear();
    const mm = String(vnShiftedDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(vnShiftedDate.getUTCDate()).padStart(2, '0');
    const hh = String(vnShiftedDate.getUTCHours()).padStart(2, '0');
    const mi = String(vnShiftedDate.getUTCMinutes()).padStart(2, '0');
    const ss = String(vnShiftedDate.getUTCSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

// "Bây giờ" theo giờ Việt Nam (+07, không DST), lùi lại N giờ nếu truyền offsetHours.
function nowVN(offsetHours = 0) {
    return new Date(Date.now() + (7 + offsetHours) * 60 * 60 * 1000);
}

// "Hôm nay" theo giờ Việt Nam — vẫn hỗ trợ khi client truyền from/to dạng ngày (YYYY-MM-DD).
function todayVN() {
    return formatVNParts(nowVN()).slice(0, 10);
}

// Cộng thêm N ngày vào một chuỗi ngày YYYY-MM-DD (thao tác thuần trên ngày,
// không liên quan giờ/múi giờ).
function addDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Chuẩn hoá 1 chuỗi datetime "YYYY-MM-DDTHH:mm[:ss]" hoặc "YYYY-MM-DD HH:mm[:ss]"
// (giờ địa phương VN, do FE gửi lên từ <input type="datetime-local">) thành literal timestamptz +07.
function normalizeDateTime(value) {
    let v = value.replace('T', ' ');
    if (v.length === 16) v += ':00'; // thiếu giây
    return `${v}+07`;
}

// Ranh giới BẮT ĐẦU của khoảng lọc: ngày (YYYY-MM-DD) -> đầu ngày đó; datetime -> dùng đúng thời điểm.
function boundaryStart(value) {
    if (DATETIME_RE.test(value)) return normalizeDateTime(value);
    if (DATE_RE.test(value)) return `${value} 00:00:00+07`;
    return null;
}

// Ranh giới KẾT THÚC (dùng với "<"): ngày (YYYY-MM-DD) -> đầu ngày kế tiếp (trọn ngày); datetime -> đúng thời điểm.
function boundaryEnd(value) {
    if (DATETIME_RE.test(value)) return normalizeDateTime(value);
    if (DATE_RE.test(value)) return `${addDays(value, 1)} 00:00:00+07`;
    return null;
}

// @route   GET /api/reports/ref-connection-log/current
// @desc    Danh sách kết nối đang thực tế (vtiref.connects_current)
router.get('/current', async (req, res) => {
    try {
        const pool = getVtirefPool();
        const result = await pool.query(`
            SELECT network_name, remote_ip, additional_info, application_kind, application_ver, last_seen
            FROM ${VTIREF_SCHEMA}.connects_current
            ORDER BY last_seen DESC
        `);
        res.json({ rows: result.rows });
    } catch (err) {
        console.error('[RefConnectionLog] /current error:', err);
        res.status(500).json({ error: err.message });
    }
});

// @route   GET /api/reports/ref-connection-log/history?from=&to=&networkName=&applicationKind=&limit=
// @desc    Lịch sử kết nối (vtiref.connects_log), lọc theo khoảng thời gian (giờ VN) + network/application kind.
//          from/to nhận dạng ngày (YYYY-MM-DD, trọn ngày) hoặc datetime (YYYY-MM-DDTHH:mm[:ss], chính xác đến giây).
//          Không truyền gì -> mặc định 3h gần nhất (cả ngày quá nhiều dòng, dễ bị LIMIT cắt bớt).
router.get('/history', async (req, res) => {
    try {
        const { networkName, applicationKind } = req.query;
        const rawFrom = req.query.from;
        const rawTo = req.query.to;

        let start, end;
        if (!rawFrom && !rawTo) {
            const toDt = nowVN();
            const fromDt = nowVN(-DEFAULT_HISTORY_HOURS);
            start = `${formatVNParts(fromDt)}+07`;
            end = `${formatVNParts(toDt)}+07`;
        } else {
            start = boundaryStart(rawFrom || todayVN());
            end = boundaryEnd(rawTo || todayVN());
            if (!start || !end) {
                return res.status(400).json({ error: 'from/to phải theo định dạng YYYY-MM-DD hoặc YYYY-MM-DDTHH:mm' });
            }
        }

        let limit = parseInt(req.query.limit, 10);
        if (!Number.isInteger(limit) || limit <= 0) limit = DEFAULT_LIMIT;
        limit = Math.min(limit, MAX_LIMIT);

        const pool = getVtirefPool();
        const result = await pool.query(
            `
            SELECT id, network_name, remote_ip, additional_info, application_kind, application_ver, checked_at
            FROM ${VTIREF_SCHEMA}.connects_log
            WHERE checked_at >= $1 AND checked_at < $2
              AND ($3::text IS NULL OR network_name = $3)
              AND ($4::text IS NULL OR application_kind = $4)
            ORDER BY checked_at DESC
            LIMIT $5
            `,
            [start, end, networkName || null, applicationKind || null, limit]
        );

        res.json({
            rows: result.rows,
            truncated: result.rows.length === limit,
            limit,
        });
    } catch (err) {
        console.error('[RefConnectionLog] /history error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
