import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { getRefConnectionLogCurrent, getRefConnectionLogHistory } from '../services/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// "Bây giờ" (± offsetHours) theo giờ Việt Nam (+07) -> chuỗi cho input[type=datetime-local]
// ("YYYY-MM-DDTHH:mm"). Dùng làm mặc định From/To (mặc định: 3h gần nhất).
function vnDateTimeLocalStr(offsetHours = 0) {
    const vn = new Date(Date.now() + (7 + offsetHours) * 60 * 60 * 1000);
    return vn.toISOString().slice(0, 16);
}

const QUICK_RANGES = [
    { label: '1 giờ', hours: 1 },
    { label: '3 giờ', hours: 3 },
    { label: '6 giờ', hours: 6 },
    { label: '12 giờ', hours: 12 },
    { label: '24 giờ', hours: 24 },
];

// timestamptz (ISO, UTC) -> "dd/MM/yyyy HH:mm:ss" theo giờ Việt Nam.
function formatVNDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(d).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

const COLUMNS = [
    { key: 'network_name', label: 'Network Name' },
    { key: 'remote_ip', label: 'Remote IP' },
    { key: 'application_kind', label: 'Application Kind' },
    { key: 'application_ver', label: 'Application Ver' },
    { key: 'additional_info', label: 'Additional Info' },
];

function SortableHeader({ label, sortKey, sortConfig, onSort }) {
    const active = sortConfig.key === sortKey;
    return (
        <th
            onClick={() => onSort(sortKey)}
            style={{
                position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1,
                cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
            }}
            title="Nhấn để sắp xếp"
        >
            {label} {active ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
        </th>
    );
}

// ---------------------------------------------------------------------------
// Khối 1 — Current Connection
// ---------------------------------------------------------------------------

function CurrentConnectionBlock() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [loadedAt, setLoadedAt] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        getRefConnectionLogCurrent()
            .then((data) => {
                setRows(data.rows || []);
                setLoadedAt(new Date());
            })
            .catch((err) => setError(err.response?.data?.error || err.message || 'Không thể tải dữ liệu Current Connection'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    return (
        <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
                    🔌 Current Connection
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {loadedAt && (
                        <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
                            Tải lúc {formatVNDateTime(loadedAt.toISOString())} · {rows.length} dòng
                        </span>
                    )}
                    <button
                        onClick={load}
                        disabled={loading}
                        style={{
                            padding: '0.45rem 0.9rem', borderRadius: 7, border: '1px solid #d1d5db',
                            background: '#fff', color: '#374151', fontSize: '0.82rem', fontWeight: 600,
                            cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1,
                        }}
                    >
                        {loading ? 'Đang tải…' : '⟳ Refresh'}
                    </button>
                </div>
            </div>

            {error && (
                <div style={{
                    padding: '0.75rem 1rem', background: '#fee2e2', color: '#991b1b',
                    border: '1px solid #fca5a5', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem',
                }}>
                    <strong>Lỗi:</strong> {error}
                </div>
            )}

            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'auto', maxHeight: 420 }}>
                <table style={{ margin: 0 }}>
                    <thead>
                        <tr>
                            {COLUMNS.map((c) => (
                                <th key={c.key} style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}>{c.label}</th>
                            ))}
                            <th style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}>Last Seen</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!loading && rows.length === 0 && !error && (
                            <tr><td colSpan={COLUMNS.length + 1} style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>Không có kết nối nào</td></tr>
                        )}
                        {rows.map((row, i) => (
                            <tr key={i} style={{ background: i % 2 === 1 ? '#fafafa' : '#fff' }}>
                                {COLUMNS.map((c) => (
                                    <td key={c.key} style={{ fontSize: '0.85rem', color: '#374151' }}>{row[c.key] ?? '—'}</td>
                                ))}
                                <td style={{ fontSize: '0.85rem', color: '#374151' }}>{formatVNDateTime(row.last_seen)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Khối 2 — History (Log)
// ---------------------------------------------------------------------------

function HistoryBlock() {
    // Mặc định: 3 giờ gần nhất — trọn ngày thường quá nhiều dòng, dễ chạm giới hạn.
    const [fromDate, setFromDate] = useState(() => vnDateTimeLocalStr(-3));
    const [toDate, setToDate] = useState(() => vnDateTimeLocalStr(0));
    const [networkName, setNetworkName] = useState('');
    const [applicationKind, setApplicationKind] = useState('');

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [truncated, setTruncated] = useState(false);
    const [limit, setLimit] = useState(null);
    const [hasSearched, setHasSearched] = useState(false);

    const [sortConfig, setSortConfig] = useState({ key: 'checked_at', direction: 'desc' });

    // Option của 2 select — tính từ dữ liệu history đã tải (distinct), không gọi API riêng.
    const networkNameOptions = useMemo(
        () => [...new Set(rows.map((r) => r.network_name).filter(Boolean))].sort(),
        [rows]
    );
    const applicationKindOptions = useMemo(
        () => [...new Set(rows.map((r) => r.application_kind).filter(Boolean))].sort(),
        [rows]
    );

    const runSearch = useCallback((overrides = {}) => {
        const from = overrides.from ?? fromDate;
        const to = overrides.to ?? toDate;
        setLoading(true);
        setError(null);
        getRefConnectionLogHistory({
            from,
            to,
            networkName: networkName || undefined,
            applicationKind: applicationKind || undefined,
        })
            .then((data) => {
                setRows(data.rows || []);
                setTruncated(!!data.truncated);
                setLimit(data.limit ?? null);
                setHasSearched(true);
            })
            .catch((err) => setError(err.response?.data?.error || err.message || 'Không thể tải dữ liệu History'))
            .finally(() => setLoading(false));
    }, [fromDate, toDate, networkName, applicationKind]);

    // Tự động tải lần đầu với bộ lọc mặc định (3h gần nhất).
    useEffect(() => { runSearch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Nút chọn nhanh khoảng thời gian (N giờ gần nhất) — set lại From/To rồi tìm ngay,
    // không đợi state cập nhật xong (setState là async).
    const applyQuickRange = (hours) => {
        const from = vnDateTimeLocalStr(-hours);
        const to = vnDateTimeLocalStr(0);
        setFromDate(from);
        setToDate(to);
        runSearch({ from, to });
    };

    const handleSort = (key) => {
        setSortConfig((prev) => {
            if (prev.key === key) return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            return { key, direction: 'asc' };
        });
    };

    const sortedRows = useMemo(() => {
        const { key, direction } = sortConfig;
        const dir = direction === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            let va = a[key];
            let vb = b[key];
            if (key === 'checked_at') {
                va = va ? new Date(va).getTime() : 0;
                vb = vb ? new Date(vb).getTime() : 0;
            } else {
                va = (va ?? '').toString().toLowerCase();
                vb = (vb ?? '').toString().toLowerCase();
            }
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
        });
    }, [rows, sortConfig]);

    const handleExport = () => {
        const exportRows = sortedRows.map((r) => ({
            'Network Name': r.network_name ?? '',
            'Remote IP': r.remote_ip ?? '',
            'Application Kind': r.application_kind ?? '',
            'Application Ver': r.application_ver ?? '',
            'Additional Info': r.additional_info ?? '',
            'Checked At': formatVNDateTime(r.checked_at),
        }));
        const ws = XLSX.utils.json_to_sheet(exportRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'History');
        const safe = (s) => s.replace('T', ' ').replace(/:/g, '-');
        XLSX.writeFile(wb, `Ref Connection Log (${safe(fromDate)} to ${safe(toDate)}).xlsx`);
    };

    return (
        <div>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
                📜 History (Log)
            </h3>

            {/* Quick range */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>Khoảng nhanh:</span>
                {QUICK_RANGES.map((r) => (
                    <button
                        key={r.hours}
                        onClick={() => applyQuickRange(r.hours)}
                        style={{
                            padding: '0.3rem 0.7rem', borderRadius: 999, border: '1px solid #d1d5db',
                            background: '#fff', color: '#374151', fontSize: '0.78rem', fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        {r.label}
                    </button>
                ))}
            </div>

            {/* Filter bar */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '0.75rem',
                padding: '0.85rem 1rem', background: '#f9fafb', border: '1px solid #e5e7eb',
                borderRadius: 10, marginBottom: '1rem',
            }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>
                    Từ
                    <input
                        type="datetime-local"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        style={{ padding: '0.45rem 0.6rem', borderRadius: 7, border: '1px solid #d1d5db', fontSize: '0.85rem' }}
                    />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>
                    Đến
                    <input
                        type="datetime-local"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        style={{ padding: '0.45rem 0.6rem', borderRadius: 7, border: '1px solid #d1d5db', fontSize: '0.85rem' }}
                    />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>
                    Network Name
                    <select
                        value={networkName}
                        onChange={(e) => setNetworkName(e.target.value)}
                        style={{ padding: '0.45rem 0.6rem', borderRadius: 7, border: '1px solid #d1d5db', fontSize: '0.85rem', minWidth: 160 }}
                    >
                        <option value="">Tất cả</option>
                        {networkNameOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>
                    Application Kind
                    <select
                        value={applicationKind}
                        onChange={(e) => setApplicationKind(e.target.value)}
                        style={{ padding: '0.45rem 0.6rem', borderRadius: 7, border: '1px solid #d1d5db', fontSize: '0.85rem', minWidth: 160 }}
                    >
                        <option value="">Tất cả</option>
                        {applicationKindOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                </label>
                <button
                    onClick={runSearch}
                    disabled={loading}
                    style={{
                        padding: '0.5rem 1.1rem', borderRadius: 7, border: 'none',
                        background: '#4f46e5', color: '#fff', fontSize: '0.85rem', fontWeight: 700,
                        cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1,
                    }}
                >
                    {loading ? 'Đang tải…' : '🔎 Xem'}
                </button>
                <button
                    onClick={handleExport}
                    disabled={sortedRows.length === 0}
                    style={{
                        padding: '0.5rem 1.1rem', borderRadius: 7, border: '1px solid #d1d5db',
                        background: '#fff', color: '#374151', fontSize: '0.85rem', fontWeight: 600,
                        cursor: sortedRows.length === 0 ? 'default' : 'pointer', opacity: sortedRows.length === 0 ? 0.5 : 1,
                    }}
                >
                    📊 Export Excel
                </button>
            </div>

            {error && (
                <div style={{
                    padding: '0.75rem 1rem', background: '#fee2e2', color: '#991b1b',
                    border: '1px solid #fca5a5', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem',
                }}>
                    <strong>Lỗi:</strong> {error}
                </div>
            )}

            {truncated && (
                <div style={{
                    padding: '0.75rem 1rem', background: '#fef3c7', color: '#92400e',
                    border: '1px solid #fcd34d', borderRadius: 8, marginBottom: '1rem', fontSize: '0.85rem',
                }}>
                    ⚠️ Đã giới hạn {limit} dòng, hãy thu hẹp khoảng ngày hoặc bộ lọc để xem đầy đủ.
                </div>
            )}

            {hasSearched && (
                <div style={{ marginBottom: '0.5rem', fontSize: '0.82rem', color: '#6b7280' }}>
                    {rows.length} dòng
                </div>
            )}

            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'auto', maxHeight: 520 }}>
                <table style={{ margin: 0 }}>
                    <thead>
                        <tr>
                            {COLUMNS.map((c) => (
                                <SortableHeader key={c.key} label={c.label} sortKey={c.key} sortConfig={sortConfig} onSort={handleSort} />
                            ))}
                            <SortableHeader label="Checked At" sortKey="checked_at" sortConfig={sortConfig} onSort={handleSort} />
                        </tr>
                    </thead>
                    <tbody>
                        {!loading && sortedRows.length === 0 && !error && (
                            <tr><td colSpan={COLUMNS.length + 1} style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>Không có dữ liệu trong khoảng đã chọn</td></tr>
                        )}
                        {sortedRows.map((row) => (
                            <tr key={row.id} style={{ background: row.id % 2 === 1 ? '#fafafa' : '#fff' }}>
                                {COLUMNS.map((c) => (
                                    <td key={c.key} style={{ fontSize: '0.85rem', color: '#374151' }}>{row[c.key] ?? '—'}</td>
                                ))}
                                <td style={{ fontSize: '0.85rem', color: '#374151' }}>{formatVNDateTime(row.checked_at)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function RefConnectionLogPage() {
    return (
        <div>
            <div style={{ marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#111827' }}>
                    🔗 Ref Connection Log
                </h2>
                <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                    Theo dõi kết nối tới Reference Server — vtiref.connects_current / vtiref.connects_log
                </p>
            </div>

            <CurrentConnectionBlock />
            <HistoryBlock />
        </div>
    );
}
