import React, { useEffect, useMemo, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import {
    getScriptChangelogScripts, getScriptChangelogStats,
    getScriptChangelogScript, getScriptChangelogHistory
} from '../services/api';

const STATUS_STYLE = {
    original: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7', label: 'Original' },
    modified: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d', label: 'Modified' },
};

// Scripts modified within this many hours get the red "look here now" dot + row tint.
const RECENT_THRESHOLD_HOURS = 24;

function isRecent(lastModified) {
    if (!lastModified) return false;
    const hoursAgo = (Date.now() - new Date(lastModified).getTime()) / (1000 * 60 * 60);
    return hoursAgo <= RECENT_THRESHOLD_HOURS;
}

function timeAgo(dateString) {
    if (!dateString) return '—';
    const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (seconds < 60) return 'Vừa xong';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} ngày trước`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)} tuần trước`;
    return new Date(dateString).toLocaleDateString('vi-VN');
}

function formatDateTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function FilterTabs({ active, onChange, counts }) {
    const tabs = [
        { key: 'all', label: 'All', count: counts.all },
        { key: 'recent', label: 'Recently Changed', count: counts.modified },
        { key: 'original', label: 'Original', count: counts.original },
    ];
    return (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {tabs.map(t => (
                <button
                    key={t.key}
                    onClick={() => onChange(t.key)}
                    style={{
                        padding: '0.4rem 0.9rem', borderRadius: 999, fontSize: '0.8rem', fontWeight: 600,
                        border: active === t.key ? '1px solid #4f46e5' : '1px solid #e5e7eb',
                        background: active === t.key ? '#4f46e5' : '#fff',
                        color: active === t.key ? '#fff' : '#374151',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                >
                    {t.label} ({t.count})
                </button>
            ))}
        </div>
    );
}

function StatusBadge({ status }) {
    const s = STATUS_STYLE[status] || STATUS_STYLE.original;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            background: s.bg, color: s.text, border: `1px solid ${s.border}`,
            borderRadius: '999px', padding: '0.1rem 0.6rem', fontSize: '0.72rem', fontWeight: 700,
            whiteSpace: 'nowrap',
        }}>
            {s.label}
        </span>
    );
}

function StatCard({ label, value, color }) {
    return (
        <div style={{
            flex: 1, minWidth: 140, padding: '1rem 1.25rem', background: '#f9fafb',
            border: '1px solid #e5e7eb', borderRadius: 10,
        }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {label}
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.35rem', color: color || '#111827' }}>
                {value}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Panel 3: change history + side-by-side diff
// ---------------------------------------------------------------------------

function ScriptHistoryPanel({ ident, onBack }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [leftIdx, setLeftIdx] = useState(0);
    const [rightIdx, setRightIdx] = useState(0);
    const [splitView, setSplitView] = useState(true);

    useEffect(() => {
        getScriptChangelogHistory(ident)
            .then(data => {
                setHistory(data);
                const lastIdx = data.length - 1;
                setRightIdx(lastIdx);
                setLeftIdx(Math.max(0, lastIdx - 1));
            })
            .catch(err => setError(err.response?.data?.message || err.message))
            .finally(() => setLoading(false));
    }, [ident]);

    if (loading) return <div style={{ padding: '2rem', color: '#6b7280' }}>Đang tải lịch sử...</div>;
    if (error) return <div style={{ padding: '1rem', color: '#991b1b' }}>Lỗi: {error}</div>;

    const leftVersion = history[leftIdx];
    const rightVersion = history[rightIdx];

    return (
        <div>
            <button
                onClick={onBack}
                style={{ marginBottom: '1.25rem', padding: '0.5rem 1rem', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: '#374151', fontWeight: 600, cursor: 'pointer' }}
            >
                ← Back to script detail
            </button>

            {/* Version timeline. change_type (NEW/MODIFIED) only describes how this
                snapshot differed from the previous capture — it does NOT mean "this
                is what's live now". The most recently captured row always is, so it
                gets its own explicit "Đang chạy" badge regardless of change_type. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
                {history.map((v, i) => ({ v, i })).reverse().map(({ v, i }) => {
                    const isCurrent = i === history.length - 1;
                    return (
                        <div key={v.id} style={{
                            padding: '0.5rem 0.75rem', borderRadius: 8, fontSize: '0.8rem',
                            border: isCurrent ? '1px solid #6ee7b7' : '1px solid #e5e7eb',
                            background: isCurrent ? '#ecfdf5' : ((i === leftIdx || i === rightIdx) ? '#eff6ff' : '#f9fafb'),
                            borderColor: isCurrent ? '#6ee7b7' : ((i === leftIdx || i === rightIdx) ? '#bfdbfe' : '#e5e7eb'),
                        }}>
                            <div style={{ fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                v{i + 1}
                                <span style={{ fontWeight: 500, color: v.change_type === 'NEW' ? '#065f46' : '#92400e' }}>({v.change_type})</span>
                                {isCurrent && (
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#065f46', background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 999, padding: '0.05rem 0.5rem' }}>
                                        🟢 Đang chạy
                                    </span>
                                )}
                            </div>
                            <div style={{ color: '#6b7280' }}>{formatDateTime(v.captured_at)}</div>
                        </div>
                    );
                })}
            </div>

            {/* Version pickers */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
                    So sánh:
                    <select value={leftIdx} onChange={e => setLeftIdx(Number(e.target.value))} style={{ marginLeft: '0.5rem', padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #d1d5db' }}>
                        {history.map((v, i) => (
                            <option key={v.id} value={i}>v{i + 1} — {formatDateTime(v.captured_at)}{i === history.length - 1 ? ' (Đang chạy)' : ''}</option>
                        ))}
                    </select>
                </label>
                <span style={{ color: '#9ca3af' }}>→</span>
                <select value={rightIdx} onChange={e => setRightIdx(Number(e.target.value))} style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #d1d5db' }}>
                    {history.map((v, i) => (
                        <option key={v.id} value={i}>v{i + 1} — {formatDateTime(v.captured_at)}{i === history.length - 1 ? ' (Đang chạy)' : ''}</option>
                    ))}
                </select>

                <label style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <input type="checkbox" checked={splitView} onChange={e => setSplitView(e.target.checked)} />
                    Split view
                </label>
            </div>

            {leftVersion && rightVersion && (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                    <ReactDiffViewer
                        oldValue={leftVersion.script_text || ''}
                        newValue={rightVersion.script_text || ''}
                        splitView={splitView}
                        compareMethod={DiffMethod.WORDS}
                        leftTitle={`v${leftIdx + 1} — ${formatDateTime(leftVersion.captured_at)}${leftIdx === history.length - 1 ? ' 🟢 (Đang chạy)' : ''}`}
                        rightTitle={`v${rightIdx + 1} — ${formatDateTime(rightVersion.captured_at)}${rightIdx === history.length - 1 ? ' 🟢 (Đang chạy)' : ''}`}
                        styles={{
                            contentText: { fontFamily: '"Fira Code", "Consolas", monospace', fontSize: '13px' }
                        }}
                    />
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Panel 2: script detail (latest version)
// ---------------------------------------------------------------------------

function ScriptDetailPanel({ ident, onViewHistory }) {
    const [script, setScript] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        getScriptChangelogScript(ident)
            .then(setScript)
            .catch(err => setError(err.response?.data?.message || err.message))
            .finally(() => setLoading(false));
    }, [ident]);

    if (loading) return <div style={{ padding: '2rem', color: '#6b7280' }}>Đang tải script...</div>;
    if (error) return <div style={{ padding: '1rem', color: '#991b1b' }}>Lỗi: {error}</div>;
    if (!script) return null;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {script.name}
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#065f46', background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 999, padding: '0.1rem 0.6rem', whiteSpace: 'nowrap' }}>
                            🟢 Đang chạy
                        </span>
                    </h3>
                    <div style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                        Code: <strong>{script.code}</strong> · Ident: <strong>{script.ident}</strong> · Cập nhật: {formatDateTime(script.captured_at)}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '0.78rem', marginTop: '0.15rem' }}>
                        Đây là phiên bản mới nhất được ghi nhận — script này đang chạy trong hệ thống.
                    </div>
                    {script.gen_description && (
                        <div style={{ color: '#374151', fontSize: '0.85rem', marginTop: '0.35rem' }}>{script.gen_description}</div>
                    )}
                </div>
                <button
                    onClick={onViewHistory}
                    style={{ padding: '0.5rem 1rem', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                    View Change History
                </button>
            </div>

            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'auto', maxHeight: '65vh' }}>
                <SyntaxHighlighter language="pascal" style={oneLight} customStyle={{ margin: 0, fontSize: '13px' }} showLineNumbers>
                    {script.script_text || ''}
                </SyntaxHighlighter>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ScriptChangeLogsPage() {
    const [scripts, setScripts] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState('all');
    // null = keep the backend's default order (modified-first, newest change on top)
    const [sortBy, setSortBy] = useState(null);
    const [sortOrder, setSortOrder] = useState('asc');
    const [selectedIdent, setSelectedIdent] = useState(null);
    const [rightView, setRightView] = useState('detail'); // 'detail' | 'history'
    const [refreshing, setRefreshing] = useState(false);
    // Bumped on manual refresh so the currently open detail/history panel
    // (keyed below) remounts and refetches too, not just the list.
    const [refreshKey, setRefreshKey] = useState(0);

    // No synchronous setState calls here (only inside .then/.catch/.finally) —
    // this function is called directly from an effect body below, and
    // setRefreshing(true) for the manual-refresh case is set by the caller.
    const loadData = () => {
        return Promise.all([getScriptChangelogScripts(), getScriptChangelogStats()])
            .then(([scriptsData, statsData]) => {
                setScripts(scriptsData);
                setStats(statsData);
                setError(null);
            })
            .catch(err => setError(err.response?.data?.message || err.message))
            .finally(() => {
                setLoading(false);
                setRefreshing(false);
            });
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleRefresh = () => {
        setRefreshing(true);
        loadData();
        setRefreshKey(k => k + 1);
    };

    const tabCounts = useMemo(() => ({
        all: scripts.length,
        modified: scripts.filter(s => s.status === 'modified').length,
        original: scripts.filter(s => s.status === 'original').length,
    }), [scripts]);

    const filteredScripts = useMemo(() => {
        let list = scripts;
        if (activeTab === 'recent') list = list.filter(s => s.status === 'modified');
        else if (activeTab === 'original') list = list.filter(s => s.status === 'original');

        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter(s => (s.name || '').toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q));
        }

        // No explicit column sort chosen — keep the backend's default order
        // (modified-first, newest change on top, then original scripts by name).
        if (!sortBy) return list;

        return [...list].sort((a, b) => {
            let valA = a[sortBy], valB = b[sortBy];
            if (sortBy === 'last_modified') { valA = new Date(valA).getTime(); valB = new Date(valB).getTime(); }
            if (sortBy === 'version_count') { valA = Number(valA); valB = Number(valB); }
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [scripts, activeTab, search, sortBy, sortOrder]);

    const handleSort = (col) => {
        if (sortBy === col) {
            setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(col);
            setSortOrder('asc');
        }
    };

    const handleSelect = (ident) => {
        setSelectedIdent(ident);
        setRightView('detail');
    };

    return (
        <div>
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#111827' }}>
                        📜 Script Change Logs
                    </h2>
                    <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                        Theo dõi thay đổi script Pascal/Delphi trong hệ thống
                    </p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    style={{
                        padding: '0.5rem 1rem', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem',
                        border: '1px solid #e5e7eb', background: '#fff', color: '#374151',
                        cursor: refreshing ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap',
                    }}
                >
                    <span style={{ display: 'inline-block', animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}>🔄</span>
                    {refreshing ? 'Đang làm mới...' : 'Refresh'}
                </button>
            </div>

            {error && (
                <div style={{ padding: '0.75rem 1rem', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem' }}>
                    <strong>Lỗi:</strong> {error}
                </div>
            )}

            {stats && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                    <StatCard label="Total Scripts" value={stats.total_scripts} />
                    <StatCard label="Original" value={stats.original_scripts} color="#065f46" />
                    <StatCard label="Modified" value={stats.modified_scripts} color="#92400e" />
                    <StatCard label="Last Scan" value={formatDateTime(stats.last_scan_time)} />
                </div>
            )}

            {loading ? (
                <div style={{ padding: '2rem', color: '#6b7280' }}>Đang tải...</div>
            ) : (
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
                    {/* Panel 1: script list */}
                    <div style={{ width: 380, flexShrink: 0, border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <FilterTabs active={activeTab} onChange={setActiveTab} counts={tabCounts} />
                            <input
                                type="text"
                                placeholder="Tìm theo tên hoặc code..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.85rem', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginTop: 0 }}>
                                <thead>
                                    <tr>
                                        <th onClick={() => handleSort('name')} style={{ cursor: 'pointer', padding: '0.6rem 0.75rem' }}>Name{sortBy === 'name' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                                        <th onClick={() => handleSort('version_count')} style={{ cursor: 'pointer', padding: '0.6rem 0.75rem' }}>Ver.{sortBy === 'version_count' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                                        <th style={{ padding: '0.6rem 0.75rem' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredScripts.map(s => {
                                        const recent = s.status === 'modified' && isRecent(s.last_modified);
                                        return (
                                            <tr
                                                key={s.ident}
                                                onClick={() => handleSelect(s.ident)}
                                                style={{
                                                    cursor: 'pointer',
                                                    background: selectedIdent === s.ident ? '#eff6ff' : (recent ? '#fff5f5' : 'transparent'),
                                                }}
                                            >
                                                <td style={{ padding: '0.6rem 0.75rem' }} title={s.gen_description}>
                                                    <div style={{ display: 'flex', alignItems: 'center', fontWeight: 600, color: '#111827' }}>
                                                        {recent && <span className="recent-change-dot" />}
                                                        {s.name}
                                                    </div>
                                                    <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
                                                        Code: {s.code} · {s.status === 'original' ? 'Chưa thay đổi' : `${timeAgo(s.last_modified)} · v${s.version_count}`}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>{s.version_count}</td>
                                                <td style={{ padding: '0.6rem 0.75rem' }}><StatusBadge status={s.status} /></td>
                                            </tr>
                                        );
                                    })}
                                    {filteredScripts.length === 0 && (
                                        <tr><td colSpan={3} style={{ padding: '1.5rem', textAlign: 'center', color: '#9ca3af' }}>Không có script nào khớp</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Panel 2 / 3: detail or history */}
                    <div style={{ flex: 1, minWidth: 0, border: '1px solid #e5e7eb', borderRadius: 10, padding: '1.25rem', background: '#fff' }}>
                        {!selectedIdent ? (
                            <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#9ca3af' }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📜</div>
                                <div style={{ fontWeight: 600, color: '#6b7280' }}>Chọn một script ở danh sách bên trái để xem chi tiết</div>
                            </div>
                        ) : rightView === 'detail' ? (
                            <ScriptDetailPanel key={`${selectedIdent}-${refreshKey}`} ident={selectedIdent} onViewHistory={() => setRightView('history')} />
                        ) : (
                            <ScriptHistoryPanel key={`${selectedIdent}-${refreshKey}`} ident={selectedIdent} onBack={() => setRightView('detail')} />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
