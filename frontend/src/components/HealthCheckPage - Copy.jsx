import React, { useState, useEffect } from 'react';
import { getHealthCheckInstances, runHealthCheck } from '../services/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_STYLE = {
    green:  { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7', dot: '#10b981' },
    yellow: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d', dot: '#f59e0b' },
    red:    { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', dot: '#ef4444' },
};

const STATUS_LABEL = { green: 'OK', yellow: 'WARN', red: 'CRIT' };

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusPill({ status, size = 'sm' }) {
    const s = STATUS_STYLE[status] || STATUS_STYLE.green;
    const pad = size === 'lg' ? '0.4rem 1rem' : '0.15rem 0.55rem';
    const fs  = size === 'lg' ? '0.9rem' : '0.72rem';
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            background: s.bg, color: s.text, border: `1px solid ${s.border}`,
            borderRadius: '999px', padding: pad, fontSize: fs, fontWeight: 700,
            whiteSpace: 'nowrap',
        }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
            {STATUS_LABEL[status] || status}
        </span>
    );
}

function MetricRow({ metric }) {
    const s = STATUS_STYLE[metric.status] || STATUS_STYLE.green;
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.3rem 0.75rem', borderRadius: 6,
            background: metric.status !== 'green' ? s.bg : 'transparent',
        }}>
            <span style={{ color: '#4b5563', fontSize: '0.8rem', flex: 1 }}>{metric.label}</span>
            <span style={{
                fontWeight: 600, fontSize: '0.82rem', color: s.text,
                marginLeft: '0.5rem', whiteSpace: 'nowrap',
            }}>
                {metric.displayValue}
            </span>
            {metric.status !== 'green' && (
                <span style={{ marginLeft: '0.5rem' }}>
                    <StatusPill status={metric.status} />
                </span>
            )}
        </div>
    );
}

function QueryCard({ result }) {
    const [open, setOpen] = useState(result.status !== 'green');
    const s = STATUS_STYLE[result.status] || STATUS_STYLE.green;

    return (
        <div style={{
            border: `1px solid ${result.status !== 'green' ? s.border : '#e5e7eb'}`,
            borderRadius: 8, marginBottom: '0.5rem', overflow: 'hidden',
        }}>
            {/* Header row */}
            <div
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.6rem 1rem', cursor: 'pointer',
                    background: result.status !== 'green' ? s.bg : '#f9fafb',
                }}
            >
                <StatusPill status={result.status} />
                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#111827', minWidth: 32 }}>
                    {result.id}
                </span>
                <span style={{ flex: 1, fontSize: '0.85rem', color: '#374151' }}>{result.name}</span>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                    {result.durationMs} ms
                </span>
                <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{open ? '▲' : '▼'}</span>
            </div>

            {/* Expanded detail */}
            {open && (
                <div style={{ padding: '0.5rem 1rem 0.75rem', borderTop: `1px solid ${s.border || '#e5e7eb'}` }}>
                    {result.error && (
                        <div style={{
                            background: '#fee2e2', color: '#991b1b', borderRadius: 6,
                            padding: '0.5rem 0.75rem', fontSize: '0.8rem', marginBottom: '0.5rem',
                        }}>
                            <strong>Error:</strong> {result.error}
                        </div>
                    )}
                    {result.metrics && result.metrics.length > 0 && (
                        <div>
                            {result.metrics.map((m, i) => <MetricRow key={i} metric={m} />)}
                        </div>
                    )}
                    {!result.error && result.metrics && result.metrics.length === 0 && (
                        <div style={{ color: '#9ca3af', fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}>
                            Không có metric đánh giá — xem rows dưới đây để phân tích thủ công.
                        </div>
                    )}
                    {result.rows && result.rows.length > 0 && (
                        <details style={{ marginTop: '0.5rem' }}>
                            <summary style={{ fontSize: '0.78rem', color: '#6b7280', cursor: 'pointer' }}>
                                Raw data ({result.rows.length} rows)
                            </summary>
                            <div style={{ overflowX: 'auto', marginTop: '0.4rem' }}>
                                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.75rem' }}>
                                    <thead>
                                        <tr>
                                            {Object.keys(result.rows[0]).map(col => (
                                                <th key={col} style={{
                                                    textAlign: 'left', padding: '0.25rem 0.5rem',
                                                    background: '#f3f4f6', borderBottom: '1px solid #e5e7eb',
                                                    whiteSpace: 'nowrap', fontWeight: 600, color: '#374151',
                                                }}>
                                                    {col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.rows.map((row, ri) => (
                                            <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#f9fafb' }}>
                                                {Object.values(row).map((val, ci) => (
                                                    <td key={ci} style={{
                                                        padding: '0.25rem 0.5rem',
                                                        borderBottom: '1px solid #e5e7eb',
                                                        whiteSpace: 'nowrap', color: '#374151',
                                                    }}>
                                                        {val === null ? <em style={{ color: '#9ca3af' }}>null</em>
                                                            : val instanceof Date ? val.toLocaleString()
                                                            : String(val)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </details>
                    )}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function HealthCheckPage() {
    const [instances, setInstances] = useState([]);
    const [instanceKey, setInstanceKey] = useState('');
    const [sections, setSections] = useState(['A', 'B']);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [loadingInstances, setLoadingInstances] = useState(true);

    useEffect(() => {
        getHealthCheckInstances()
            .then(data => {
                setInstances(data);
                if (data.length) setInstanceKey(data[0].key);
            })
            .catch(err => setError('Không thể tải danh sách instance: ' + (err.message || err)))
            .finally(() => setLoadingInstances(false));
    }, []);

    const toggleSection = (sec) => {
        setSections(prev =>
            prev.includes(sec) ? prev.filter(s => s !== sec) : [...prev, sec]
        );
    };

    const handleRun = async () => {
        if (!instanceKey || sections.length === 0) return;
        setRunning(true);
        setResult(null);
        setError(null);
        try {
            const data = await runHealthCheck(instanceKey, sections);
            setResult(data);
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Unknown error');
        } finally {
            setRunning(false);
        }
    };

    const sectionA = result?.results?.filter(r => r.section === 'A') || [];
    const sectionB = result?.results?.filter(r => r.section === 'B') || [];

    return (
        <div style={{ maxWidth: 900, padding: '0 1rem' }}>
            {/* Page title */}
            <div style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#111827' }}>
                    🗄️ SQL Server Health Check
                </h2>
                <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                    Kiểm tra sức khỏe SQL Server theo thời gian thực
                </p>
            </div>

            {/* Control bar */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem',
                padding: '1rem 1.25rem', background: '#f9fafb',
                border: '1px solid #e5e7eb', borderRadius: 10, marginBottom: '1.5rem',
            }}>
                {/* Instance selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
                        Instance:
                    </label>
                    {loadingInstances ? (
                        <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Đang tải…</span>
                    ) : instances.length === 0 ? (
                        <span style={{ color: '#ef4444', fontSize: '0.875rem' }}>Không tìm thấy kết nối — kiểm tra cấu hình backend</span>
                    ) : (
                        <select
                            value={instanceKey}
                            onChange={e => setInstanceKey(e.target.value)}
                            disabled={running}
                            style={{
                                padding: '0.4rem 0.75rem', borderRadius: 6,
                                border: '1px solid #d1d5db', fontSize: '0.875rem',
                                background: '#fff', cursor: 'pointer',
                            }}
                        >
                            {instances.map(inst => (
                                <option key={inst.key} value={inst.key}>
                                    {inst.name}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Section checkboxes */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>Sections:</span>
                    {['A', 'B'].map(sec => (
                        <label key={sec} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>
                            <input
                                type="checkbox"
                                checked={sections.includes(sec)}
                                onChange={() => toggleSection(sec)}
                                disabled={running}
                            />
                            Section {sec}
                            {sec === 'A' && <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>(general)</span>}
                            {sec === 'B' && <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>(CRM only)</span>}
                        </label>
                    ))}
                </div>

                {/* Run button */}
                <button
                    onClick={handleRun}
                    disabled={running || loadingInstances || instances.length === 0 || sections.length === 0}
                    style={{
                        marginLeft: 'auto', padding: '0.5rem 1.25rem',
                        background: running ? '#9ca3af' : '#2563eb',
                        color: '#fff', border: 'none', borderRadius: 7,
                        fontWeight: 600, fontSize: '0.875rem', cursor: running ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap',
                    }}
                >
                    {running ? '⏳ Đang chạy…' : '▶ Run Health Check'}
                </button>
            </div>

            {/* API / fetch error */}
            {error && (
                <div style={{
                    padding: '0.75rem 1rem', background: '#fee2e2', color: '#991b1b',
                    border: '1px solid #fca5a5', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem',
                }}>
                    <strong>Lỗi:</strong> {error}
                </div>
            )}

            {/* Result summary bar */}
            {result && !running && (
                <div style={{
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem',
                    padding: '0.75rem 1.25rem', borderRadius: 10, marginBottom: '1rem',
                    background: STATUS_STYLE[result.overallStatus]?.bg || '#f9fafb',
                    border: `1px solid ${STATUS_STYLE[result.overallStatus]?.border || '#e5e7eb'}`,
                }}>
                    <StatusPill status={result.overallStatus} size="lg" />
                    <span style={{ fontSize: '0.875rem', color: '#374151' }}>
                        {result.results.length} queries &nbsp;·&nbsp;
                        {result.totalDurationMs.toLocaleString()} ms total &nbsp;·&nbsp;
                        {new Date(result.runAt).toLocaleString('vi-VN')}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#9ca3af', fontFamily: 'monospace' }}>
                        {result.runId}
                    </span>
                </div>
            )}

            {/* Results */}
            {result && (
                <div>
                    {sectionA.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                Section A — General
                            </div>
                            {sectionA.map(r => <QueryCard key={r.id} result={r} />)}
                        </div>
                    )}
                    {sectionB.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                Section B — CRM Specific
                            </div>
                            {sectionB.map(r => <QueryCard key={r.id} result={r} />)}
                        </div>
                    )}
                </div>
            )}

            {/* Empty state */}
            {!result && !running && !error && (
                <div style={{
                    textAlign: 'center', padding: '4rem 2rem',
                    color: '#9ca3af', border: '2px dashed #e5e7eb', borderRadius: 12,
                }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🗄️</div>
                    <div style={{ fontWeight: 600, color: '#6b7280', marginBottom: '0.25rem' }}>Chưa có kết quả</div>
                    <div style={{ fontSize: '0.875rem' }}>Chọn instance và nhấn <strong>Run Health Check</strong> để bắt đầu</div>
                </div>
            )}
        </div>
    );
}
