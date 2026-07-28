import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getRk7UsageFilterTypes, getRk7Usage } from '../services/api';

// ---------------------------------------------------------------------------
// Column config
// ---------------------------------------------------------------------------

// Always visible, not toggleable — per spec these are the default columns.
const DEFAULT_FILTER_COLUMNS = ['FILTER_RESTAURANT', 'FILTER_PERIOD', 'FILTER_STARTAT', 'FILTER_STOPAT'];

// Remaining FILTER_* columns from dbo.v_object_usage — hidden by default, toggleable.
const OPTIONAL_FILTER_COLUMNS = [
    'FILTER_LANG', 'FILTER_FLAGS', 'FILTER_COT', 'FILTER_UOT', 'FILTER_EMPLOYEE',
    'FILTER_STATION', 'FILTER_TRADEGROUP', 'FILTER_DEFAULTER', 'FILTER_ROLE', 'FILTER_TABLE',
    'FILTER_COLORS', 'FILTER_TABLEGROUP', 'FILTER_GUESTTYPE', 'FILTER_HALLPLAN',
    'FILTER_EMPLOYEEGROUP', 'FILTER_BRIGADE', 'FILTER_CASHGROUP', 'FILTER_CONCEPT',
    'FILTER_REGION', 'FILTER_FRANCHISE', 'FILTER_KURS',
    'FILTER_CUSTOMENUM1', 'FILTER_CUSTOMENUM2', 'FILTER_CUSTOMENUM3', 'FILTER_CUSTOMENUM4', 'FILTER_CUSTOMENUM5',
];

const COLUMN_LABELS = {
    FILTER_LANG: 'Lang', FILTER_FLAGS: 'Flags', FILTER_COT: 'COT', FILTER_UOT: 'UOT',
    FILTER_EMPLOYEE: 'Employee', FILTER_PERIOD: 'Period', FILTER_STATION: 'Station',
    FILTER_TRADEGROUP: 'Trade Group', FILTER_DEFAULTER: 'Defaulter', FILTER_ROLE: 'Role',
    FILTER_TABLE: 'Table', FILTER_COLORS: 'Colors', FILTER_TABLEGROUP: 'Table Group',
    FILTER_GUESTTYPE: 'Guest Type', FILTER_HALLPLAN: 'Hall Plan', FILTER_EMPLOYEEGROUP: 'Employee Group',
    FILTER_BRIGADE: 'Brigade', FILTER_RESTAURANT: 'Restaurant', FILTER_STARTAT: 'Start At',
    FILTER_STOPAT: 'Stop At', FILTER_CASHGROUP: 'Cash Group', FILTER_CONCEPT: 'Concept',
    FILTER_REGION: 'Region', FILTER_FRANCHISE: 'Franchise', FILTER_KURS: 'Kurs',
    FILTER_CUSTOMENUM1: 'Custom Enum 1', FILTER_CUSTOMENUM2: 'Custom Enum 2', FILTER_CUSTOMENUM3: 'Custom Enum 3',
    FILTER_CUSTOMENUM4: 'Custom Enum 4', FILTER_CUSTOMENUM5: 'Custom Enum 5',
};

const DATETIME_COLUMNS = new Set(['FILTER_STARTAT', 'FILTER_STOPAT']);

function formatCell(col, value) {
    if (value === null || value === undefined || value === '') return '—';
    if (DATETIME_COLUMNS.has(col)) {
        const d = new Date(value);
        if (Number.isNaN(d.getTime()) || d.getFullYear() <= 1899) return '—'; // Delphi zero-date sentinel
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return String(value);
}

// ---------------------------------------------------------------------------
// Grouping — hierarchy is derived strictly from PARENTOBJECT, never from the
// ObjectParentName string. PARENTOBJECT <> 0 rows are collected into a group
// keyed by PARENTOBJECT (header = ObjectParentName, falling back to the raw
// id if the view has no name for it); PARENTOBJECT = 0 rows stay flat.
// Rows arrive already sorted by PRIORITY, so insertion order == priority order.
// ---------------------------------------------------------------------------

function buildBlocks(rows) {
    const blocks = [];
    const groupByParent = new Map();
    rows.forEach((row, idx) => {
        if (row.PARENTOBJECT) {
            let group = groupByParent.get(row.PARENTOBJECT);
            if (!group) {
                group = {
                    type: 'group',
                    key: row.PARENTOBJECT,
                    header: row.ObjectParentName || `Parent #${row.PARENTOBJECT}`,
                    rows: [],
                };
                groupByParent.set(row.PARENTOBJECT, group);
                blocks.push(group);
            }
            group.rows.push(row);
        } else {
            blocks.push({ type: 'row', key: `flat-${idx}`, row });
        }
    });
    return blocks;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ColumnPicker({ visibleCols, onToggle }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                onClick={() => setOpen((o) => !o)}
                style={{
                    padding: '0.5rem 0.9rem', borderRadius: 7, border: '1px solid #d1d5db',
                    background: '#fff', color: '#374151', fontSize: '0.85rem', fontWeight: 600,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap',
                }}
            >
                ☰ Chọn cột {visibleCols.size > 0 ? `(${visibleCols.size})` : ''} {open ? '▴' : '▾'}
            </button>
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 20,
                    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
                    boxShadow: '0 8px 20px rgba(0,0,0,0.12)', padding: '0.5rem',
                    minWidth: 220, maxHeight: 320, overflowY: 'auto',
                }}>
                    {OPTIONAL_FILTER_COLUMNS.map((col) => (
                        <label
                            key={col}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.35rem 0.5rem', borderRadius: 6, cursor: 'pointer',
                                fontSize: '0.82rem', color: '#374151',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                            <input
                                type="checkbox"
                                checked={visibleCols.has(col)}
                                onChange={() => onToggle(col)}
                            />
                            {COLUMN_LABELS[col] || col}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

function DataRow({ row, columns, indent, zebra }) {
    return (
        <tr style={{ background: zebra ? '#fafafa' : '#fff' }}>
            <td style={{ paddingLeft: indent ? `${1 + indent}rem` : undefined }}>{row.ObjectName || '—'}</td>
            <td>
                <span style={{
                    display: 'inline-block', minWidth: 30, textAlign: 'center',
                    background: '#eef2ff', color: '#4338ca', fontWeight: 700,
                    borderRadius: 6, padding: '0.1rem 0.5rem', fontSize: '0.78rem',
                }}>
                    {row.PRIORITY}
                </span>
            </td>
            {columns.map((col) => (
                <td key={col} style={{ color: '#4b5563', fontSize: '0.85rem' }}>
                    {formatCell(col, row[col])}
                </td>
            ))}
        </tr>
    );
}

function GroupHeaderRow({ group, colSpan, collapsed, onToggle }) {
    return (
        <tr onClick={onToggle} style={{ cursor: 'pointer' }}>
            <td colSpan={colSpan} style={{
                background: '#e8ebfb', borderBottom: '1px solid #c7d2fe',
                fontWeight: 700, color: '#312e81', fontSize: '0.82rem', padding: '0.6rem 1rem',
            }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.7rem', color: '#4f46e5' }}>{collapsed ? '▸' : '▾'}</span>
                    📁 {group.header}
                    <span style={{
                        background: '#c7d2fe', color: '#312e81', borderRadius: 999,
                        padding: '0.05rem 0.5rem', fontSize: '0.7rem', fontWeight: 700,
                    }}>
                        {group.rows.length}
                    </span>
                </span>
            </td>
        </tr>
    );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function RK7UsagePage() {
    const [filterTypes, setFilterTypes] = useState([]);
    const [loadingList, setLoadingList] = useState(true);
    const [listError, setListError] = useState(null);

    const [selectedFilterType, setSelectedFilterType] = useState(null);
    const [rows, setRows] = useState([]);
    const [loadingRows, setLoadingRows] = useState(false);
    const [rowsError, setRowsError] = useState(null);

    const [search, setSearch] = useState('');
    const [visibleCols, setVisibleCols] = useState(new Set(['FILTER_UOT', 'FILTER_CONCEPT']));
    const [collapsedGroups, setCollapsedGroups] = useState(new Set());

    useEffect(() => {
        getRk7UsageFilterTypes()
            .then((data) => {
                setFilterTypes(data);
                if (data.length) setSelectedFilterType(data[0].FILTERTYPE);
            })
            .catch((err) => setListError(err.response?.data?.message || err.message || 'Không thể tải danh sách Filter Type'))
            .finally(() => setLoadingList(false));
    }, []);

    useEffect(() => {
        if (selectedFilterType === null) return;
        setLoadingRows(true);
        setRowsError(null);
        setCollapsedGroups(new Set());
        getRk7Usage(selectedFilterType)
            .then((data) => setRows(data))
            .catch((err) => setRowsError(err.response?.data?.message || err.message || 'Không thể tải dữ liệu Object Usage'))
            .finally(() => setLoadingRows(false));
    }, [selectedFilterType]);

    const filteredRows = useMemo(() => {
        if (!search.trim()) return rows;
        const q = search.trim().toLowerCase();
        return rows.filter((r) => (r.ObjectName || '').toLowerCase().includes(q));
    }, [rows, search]);

    const blocks = useMemo(() => buildBlocks(filteredRows), [filteredRows]);

    const activeExtraCols = useMemo(
        () => OPTIONAL_FILTER_COLUMNS.filter((c) => visibleCols.has(c)),
        [visibleCols]
    );
    const dataColumns = [...DEFAULT_FILTER_COLUMNS, ...activeExtraCols];
    const totalColSpan = 2 + dataColumns.length; // ObjectName + Priority + data columns

    const toggleColumn = (col) => {
        setVisibleCols((prev) => {
            const next = new Set(prev);
            if (next.has(col)) next.delete(col); else next.add(col);
            return next;
        });
    };

    const toggleGroup = (key) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const selectedMeta = filterTypes.find((f) => f.FILTERTYPE === selectedFilterType);

    return (
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
            {/* Left: FilterType list */}
            <div style={{
                width: 260, flexShrink: 0, background: '#fff', border: '1px solid #e5e7eb',
                borderRadius: 10, overflow: 'hidden',
            }}>
                <div style={{
                    padding: '0.85rem 1rem', background: '#111827', color: '#fff',
                    fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.02em',
                }}>
                    Filter Types
                </div>
                {loadingList ? (
                    <div style={{ padding: '1rem', color: '#9ca3af', fontSize: '0.85rem' }}>Đang tải…</div>
                ) : listError ? (
                    <div style={{ padding: '1rem', color: '#991b1b', fontSize: '0.82rem' }}>{listError}</div>
                ) : filterTypes.length === 0 ? (
                    <div style={{ padding: '1rem', color: '#9ca3af', fontSize: '0.85rem' }}>Không có dữ liệu</div>
                ) : (
                    <div style={{ maxHeight: 640, overflowY: 'auto' }}>
                        {filterTypes.map((ft) => {
                            const active = ft.FILTERTYPE === selectedFilterType;
                            return (
                                <div
                                    key={ft.FILTERTYPE}
                                    onClick={() => setSelectedFilterType(ft.FILTERTYPE)}
                                    style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '0.65rem 1rem', cursor: 'pointer',
                                        background: active ? '#4f46e5' : 'transparent',
                                        color: active ? '#fff' : '#374151',
                                        borderBottom: '1px solid #f3f4f6',
                                        fontSize: '0.85rem', fontWeight: active ? 700 : 500,
                                    }}
                                >
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {ft.ObjectTypeName}
                                        <span style={{ opacity: 0.6, fontWeight: 400 }}> · #{ft.FILTERTYPE}</span>
                                    </span>
                                    <span style={{
                                        marginLeft: '0.5rem', flexShrink: 0,
                                        background: active ? 'rgba(255,255,255,0.25)' : '#eef2ff',
                                        color: active ? '#fff' : '#4338ca',
                                        borderRadius: 999, padding: '0.05rem 0.55rem',
                                        fontSize: '0.72rem', fontWeight: 700,
                                    }}>
                                        {ft.count}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Right: content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ marginBottom: '1rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#111827' }}>
                        ⚙️ RK7 Usage
                    </h2>
                    <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                        Cấu hình Object Usage (filter) của hệ thống RK7 — dbo.v_object_usage
                    </p>
                </div>

                {/* Control bar */}
                <div style={{
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem',
                    padding: '0.85rem 1rem', background: '#f9fafb', border: '1px solid #e5e7eb',
                    borderRadius: 10, marginBottom: '1rem',
                }}>
                    <input
                        type="text"
                        placeholder="🔎 Tìm theo Object Name…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            flex: '1 1 240px', padding: '0.5rem 0.75rem', borderRadius: 7,
                            border: '1px solid #d1d5db', fontSize: '0.85rem',
                        }}
                    />
                    <ColumnPicker visibleCols={visibleCols} onToggle={toggleColumn} />
                </div>

                {/* PRIORITY note */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem',
                    fontSize: '0.78rem', color: '#6b7280',
                }}>
                    ℹ️ Hệ thống áp dụng điều kiện <strong>Object Usage</strong> theo thứ tự ưu tiên tăng dần của cột <strong>PRIORITY</strong>.
                </div>

                {rowsError && (
                    <div style={{
                        padding: '0.75rem 1rem', background: '#fee2e2', color: '#991b1b',
                        border: '1px solid #fca5a5', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem',
                    }}>
                        <strong>Lỗi:</strong> {rowsError}
                    </div>
                )}

                {loadingRows ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>Đang tải dữ liệu…</div>
                ) : !rowsError && selectedFilterType !== null && filteredRows.length === 0 ? (
                    <div style={{
                        textAlign: 'center', padding: '3rem 2rem', color: '#9ca3af',
                        border: '2px dashed #e5e7eb', borderRadius: 12,
                    }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗂️</div>
                        <div style={{ fontWeight: 600, color: '#6b7280' }}>
                            {search ? 'Không tìm thấy Object Name phù hợp' : 'Không có dữ liệu cho Filter Type này'}
                        </div>
                    </div>
                ) : selectedFilterType !== null && (
                    <div style={{
                        border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'auto', maxHeight: 640,
                    }}>
                        <table style={{ margin: 0 }}>
                            <thead>
                                <tr>
                                    <th style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}>Object Name</th>
                                    <th style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}>Priority</th>
                                    {dataColumns.map((col) => (
                                        <th key={col} style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}>
                                            {COLUMN_LABELS[col] || col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {blocks.map((block, i) => {
                                    if (block.type === 'row') {
                                        return (
                                            <DataRow
                                                key={block.key}
                                                row={block.row}
                                                columns={dataColumns}
                                                indent={0}
                                                zebra={i % 2 === 1}
                                            />
                                        );
                                    }
                                    const collapsed = collapsedGroups.has(block.key);
                                    return (
                                        <React.Fragment key={block.key}>
                                            <GroupHeaderRow
                                                group={block}
                                                colSpan={totalColSpan}
                                                collapsed={collapsed}
                                                onToggle={() => toggleGroup(block.key)}
                                            />
                                            {!collapsed && block.rows.map((row, j) => (
                                                <DataRow
                                                    key={`${block.key}-${j}`}
                                                    row={row}
                                                    columns={dataColumns}
                                                    indent={1}
                                                    zebra={j % 2 === 1}
                                                />
                                            ))}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {selectedMeta && !loadingRows && (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                        {filteredRows.length} / {selectedMeta.count} dòng hiển thị
                    </div>
                )}
            </div>
        </div>
    );
}
