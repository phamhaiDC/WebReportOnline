import React, { useState, useEffect } from 'react';
import { getConnectionsMonitorRoots, runConnectionsMonitor } from '../services/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_STYLE = {
    expanded:          { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe', dot: '#3b82f6' },
    leaf:              { bg: '#f9fafb', text: '#374151', border: '#e5e7eb', dot: '#9ca3af' },
    no_config:         { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db', dot: '#9ca3af' },
    unreachable:       { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', dot: '#ef4444' },
    cycle_detected:    { bg: '#fef3c7', text: '#92400e', border: '#fcd34d', dot: '#f59e0b' },
    max_depth_reached: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d', dot: '#f59e0b' },
    // syncStatus (transaction đồng bộ rk7) — cùng ngôn ngữ màu OK/warn/neutral dùng chung app
    in_sync:           { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7', dot: '#10b981' },
    out_of_sync:       { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', dot: '#ef4444' },
    unknown:           { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db', dot: '#9ca3af' },
};

const STATUS_LABEL = {
    expanded: 'Expanded',
    leaf: 'Leaf',
    no_config: 'No Config',
    unreachable: 'Unreachable',
    cycle_detected: 'Cycle',
    max_depth_reached: 'Max Depth',
};

const KIND_ICON = {
    'Manager Station': '🖥️',
    'Cash Server': '💰',
    'Report Server': '🗄️',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status, error }) {
    const s = NODE_STYLE[status] || NODE_STYLE.leaf;
    return (
        <span title={error || ''} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            background: s.bg, color: s.text, border: `1px solid ${s.border}`,
            borderRadius: '999px', padding: '0.1rem 0.55rem', fontSize: '0.7rem', fontWeight: 700,
            whiteSpace: 'nowrap',
        }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
            {STATUS_LABEL[status] || status}
        </span>
    );
}

// Badge số liệu transaction (alias 'rk7') so với root — không hiện cho node
// 'not_applicable' (leaf/no_config/cycle/max_depth/hoàn toàn unreachable).
function TxBadge({ baseVersion, syncStatus, diff }) {
    if (!baseVersion || baseVersion.status === 'not_applicable') return null;

    const title = baseVersion.status === 'ok'
        ? `Structure: ${baseVersion.structure} · Last modified: ${baseVersion.lastModified} · Sync stopped: ${baseVersion.syncStopped ? 'Yes' : 'No'}`
        : (baseVersion.error || (baseVersion.status === 'no_data' ? "Không có dòng 'rk7' trong BaseVersions" : ''));

    let label;
    if (syncStatus === 'in_sync') {
        label = `✓ tx: ${baseVersion.dataTransactions}`;
    } else if (syncStatus === 'out_of_sync') {
        label = `⚠ tx: ${baseVersion.dataTransactions} (${diff > 0 ? '+' : ''}${diff})`;
    } else {
        label = 'tx: —';
    }

    const s = NODE_STYLE[syncStatus] || NODE_STYLE.unknown;
    return (
        <span title={title} style={{
            display: 'inline-flex', alignItems: 'center',
            background: s.bg, color: s.text, border: `1px solid ${s.border}`,
            borderRadius: '999px', padding: '0.1rem 0.55rem', fontSize: '0.68rem', fontWeight: 700,
            whiteSpace: 'nowrap',
        }}>
            {label}
        </span>
    );
}

// Root luôn hiển thị sẵn hàng con cấp 1 (không thu được) — mọi node khác mặc định
// đóng, người dùng tự bấm để mở từng nhánh. Không có logic tự-mở-nếu-có-vấn-đề;
// Summary Bar đã đủ để báo tổng quan có vấn đề hay không.
function TreeNode({ node, depth, isRoot }) {
    const [open, setOpen] = useState(isRoot);
    const s = NODE_STYLE[node.status] || NODE_STYLE.leaf;

    const hasChildren = node.status === 'expanded' && node.children && node.children.length > 0;
    const canToggle = hasChildren && !isRoot;
    const showChildren = hasChildren && (isRoot || open);
    const icon = isRoot ? '🏠' : (KIND_ICON[node.applicationKind] || '🔌');
    const kindLabel = isRoot ? 'Reference/Report Server' : node.applicationKind;

    return (
        <div>
            <div
                onClick={() => canToggle && setOpen(o => !o)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.4rem 0.6rem', marginLeft: depth * 20,
                    borderRadius: 6, cursor: canToggle ? 'pointer' : 'default',
                    background: node.status !== 'leaf' && node.status !== 'expanded' ? s.bg : (depth === 0 ? '#f9fafb' : 'transparent'),
                    border: depth === 0 ? `1px solid ${s.border}` : 'none',
                }}
            >
                <span style={{ width: 14, color: '#9ca3af', fontSize: '0.7rem', flexShrink: 0 }}>
                    {canToggle ? (open ? '▾' : '▸') : ''}
                </span>
                <span style={{ fontSize: '1rem' }}>{icon}</span>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#111827' }}>{node.networkName}</span>
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{kindLabel}</span>
                {node.applicationVer && (
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{node.applicationVer}</span>
                )}
                {isRoot && node.version && (
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                        v{node.version} {node.pid ? `(PID ${node.pid})` : ''}
                    </span>
                )}
                <StatusBadge status={node.status} error={node.error} />
                <TxBadge baseVersion={node.baseVersion} syncStatus={node.syncStatus} diff={node.diff} />
                {!isRoot && node.remoteIp && (
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontFamily: 'monospace' }}>
                        {node.remoteIp}
                    </span>
                )}
                {node.error && (
                    <span style={{ fontSize: '0.72rem', color: '#991b1b', marginLeft: '0.25rem' }}>
                        — {node.error}
                    </span>
                )}
            </div>
            {showChildren && (
                <div>
                    {node.children.map((child, i) => (
                        <TreeNode key={`${child.networkName}-${i}`} node={child} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

function StatBadge({ icon, label, count, status }) {
    const s = NODE_STYLE[status] || NODE_STYLE.leaf;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            background: s.bg, color: s.text, border: `1px solid ${s.border}`,
            borderRadius: 8, padding: '0.35rem 0.75rem', fontSize: '0.8rem', fontWeight: 600,
            whiteSpace: 'nowrap',
        }}>
            <span>{icon}</span>
            <span>{label}:</span>
            <span style={{ fontWeight: 800 }}>{count}</span>
        </span>
    );
}

function SummaryBar({ summary }) {
    if (!summary) return null;
    const hasIssues = summary.noConfigCount > 0 || summary.unreachableCount > 0
        || summary.cycleDetectedCount > 0 || summary.maxDepthReachedCount > 0
        || summary.outOfSyncCount > 0 || summary.syncUnknownCount > 0;

    return (
        <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151' }}>Tổng:</span>
                <StatBadge icon={KIND_ICON['Report Server']} label="Report Server" count={summary.totalReportServer} status="expanded" />
                <StatBadge icon={KIND_ICON['Cash Server']} label="Cash Server" count={summary.totalCashServer} status="leaf" />
                <StatBadge icon={KIND_ICON['Manager Station']} label="Manager Station" count={summary.totalManagerStation} status="leaf" />
            </div>
            {hasIssues ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#92400e' }}>⚠️ Cần chú ý:</span>
                    <StatBadge icon="🚫" label="No Config" count={summary.noConfigCount} status="no_config" />
                    <StatBadge icon="❌" label="Unreachable" count={summary.unreachableCount} status="unreachable" />
                    <StatBadge icon="🔁" label="Cycle" count={summary.cycleDetectedCount} status="cycle_detected" />
                    <StatBadge icon="⛔" label="Max Depth" count={summary.maxDepthReachedCount} status="max_depth_reached" />
                    <StatBadge icon="⚠" label="Out of sync (rk7)" count={summary.outOfSyncCount} status="out_of_sync" />
                    <StatBadge icon="❔" label="Sync unknown (rk7)" count={summary.syncUnknownCount} status="unknown" />
                </div>
            ) : (
                <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 700 }}>
                    ✅ Không có vấn đề
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ConnectionsMonitorPage() {
    const [roots, setRoots] = useState([]);
    const [rootNetworkName, setRootNetworkName] = useState('');
    const [maxDepth, setMaxDepth] = useState(6);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [loadingRoots, setLoadingRoots] = useState(true);

    useEffect(() => {
        getConnectionsMonitorRoots()
            .then(data => {
                setRoots(data);
                if (data.length) setRootNetworkName(data[0].networkName);
            })
            .catch(err => setError('Không thể tải danh sách root server: ' + (err.message || err)))
            .finally(() => setLoadingRoots(false));
    }, []);

    const handleRun = async () => {
        if (!rootNetworkName) return;
        setRunning(true);
        setResult(null);
        setError(null);
        try {
            const data = await runConnectionsMonitor(rootNetworkName, Number(maxDepth) || 6);
            setResult(data);
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Unknown error');
        } finally {
            setRunning(false);
        }
    };

    return (
        <div style={{ maxWidth: 1000, padding: '0 1rem' }}>
            {/* Page title */}
            <div style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#111827' }}>
                    🔗 Connections Monitor
                </h2>
                <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                    Cây kết nối RK7 Reference/Report Server — Manager Station, Cash Server, Report Server con
                </p>
            </div>

            {/* Control bar */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem',
                padding: '1rem 1.25rem', background: '#f9fafb',
                border: '1px solid #e5e7eb', borderRadius: 10, marginBottom: '1.5rem',
            }}>
                {/* Root selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
                        Root server:
                    </label>
                    {loadingRoots ? (
                        <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Đang tải…</span>
                    ) : roots.length === 0 ? (
                        <span style={{ color: '#ef4444', fontSize: '0.875rem' }}>Không có root server — kiểm tra connection_check_sources.json</span>
                    ) : (
                        <select
                            value={rootNetworkName}
                            onChange={e => setRootNetworkName(e.target.value)}
                            disabled={running}
                            style={{
                                padding: '0.4rem 0.75rem', borderRadius: 6,
                                border: '1px solid #d1d5db', fontSize: '0.875rem',
                                background: '#fff', cursor: 'pointer',
                            }}
                        >
                            {roots.map(r => (
                                <option key={r.networkName} value={r.networkName}>
                                    {r.label || r.networkName}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Max depth */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
                        Max depth:
                    </label>
                    <input
                        type="number"
                        min={1}
                        max={20}
                        value={maxDepth}
                        onChange={e => setMaxDepth(e.target.value)}
                        disabled={running}
                        style={{
                            width: 64, padding: '0.4rem 0.5rem', borderRadius: 6,
                            border: '1px solid #d1d5db', fontSize: '0.875rem',
                        }}
                    />
                </div>

                {/* Run button */}
                <button
                    onClick={handleRun}
                    disabled={running || loadingRoots || roots.length === 0 || !rootNetworkName}
                    style={{
                        marginLeft: 'auto', padding: '0.5rem 1.25rem',
                        background: running ? '#9ca3af' : '#2563eb',
                        color: '#fff', border: 'none', borderRadius: 7,
                        fontWeight: 600, fontSize: '0.875rem', cursor: running ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap',
                    }}
                >
                    {running ? '⏳ Đang chạy…' : '▶ Run'}
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
                    background: '#f9fafb', border: '1px solid #e5e7eb',
                }}>
                    <span style={{ fontSize: '0.875rem', color: '#374151' }}>
                        Chạy lúc {new Date(result.runAt).toLocaleString('vi-VN')}
                    </span>
                </div>
            )}

            {/* Summary */}
            {result && !running && <SummaryBar summary={result.summary} />}

            {/* Tree — key={result.runAt} forces a fresh mount (all nodes back to default
                collapsed/expanded state) every time a new run replaces the result */}
            {result && result.root && (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '0.75rem' }}>
                    <TreeNode key={result.runAt} node={result.root} depth={0} isRoot />
                </div>
            )}

            {/* Empty state */}
            {!result && !running && !error && (
                <div style={{
                    textAlign: 'center', padding: '4rem 2rem',
                    color: '#9ca3af', border: '2px dashed #e5e7eb', borderRadius: 12,
                }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔗</div>
                    <div style={{ fontWeight: 600, color: '#6b7280', marginBottom: '0.25rem' }}>Chưa có kết quả</div>
                    <div style={{ fontSize: '0.875rem' }}>Chọn root server và nhấn <strong>Run</strong> để bắt đầu</div>
                </div>
            )}
        </div>
    );
}
