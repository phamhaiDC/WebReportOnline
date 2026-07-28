import React, { useEffect, useState, useMemo, useCallback } from 'react';
import api, {
    getReportDetails,
    getEcodeTodayLive, getEcodeHourly, getEcodeKpi, getEcodeHeatmap, getEcodeDailyTrend, getEcodeMonthly,
    getEcodeCheck
} from '../services/api';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, PieChart, Pie, Cell, ComposedChart, ReferenceArea
} from 'recharts';

const LocationDashboard = ({ data, params, extraData }) => {
    const [selectedLoc, setSelectedLoc] = useState(null);
    const showP99 = params?.showP99 === true;
    const LATENCY_CAP = 2000;

    const kpis = extraData?.kpis || { typical: 0, outlier: 0, fleetSize: 0, totalUploads: 0 };
    const slaDist = extraData?.slaDistribution || [];
    const topWorstRaw = extraData?.topWorst || [];

    const topWorst = useMemo(() => {
        return topWorstRaw.map(item => ({
            name: item.location_name ? (item.location_name.length > 20 ? item.location_name.substring(0, 17) + '...' : item.location_name) : 'Unknown',
            fullName: item.location_name || 'Unknown',
            p95: parseFloat(item.p95_latency_ms) || 0,
            p95Capped: Math.min(parseFloat(item.p95_latency_ms) || 0, LATENCY_CAP),
            avg: parseFloat(item.avg_latency_ms) || 0,
            p99: parseFloat(item.p99_latency_ms) || 0,
            uploads: parseInt(item.upload_count) || 0,
            severity: item.severity,
            isClipped: parseFloat(item.p95_latency_ms) > LATENCY_CAP
        }));
    }, [topWorstRaw]);

    if (selectedLoc) {
        const loc = selectedLoc;
        return (
            <div style={{ padding: '1rem', animation: 'fadeIn 0.3s' }}>
                <button
                    onClick={() => setSelectedLoc(null)}
                    style={{ marginBottom: '1.5rem', padding: '0.6rem 1.25rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', color: '#374151', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                >
                    ← Back to Operational Overview
                </button>

                <div style={{ backgroundColor: '#fff', padding: '2.5rem', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.5rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '1.5rem' }}>
                        <div>
                            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.025em' }}>Location Analysis: {loc.fullName}</h2>
                            <p style={{ color: '#6b7280', marginTop: '0.25rem' }}>Detailed operational deep-dive for this specific restaurant</p>
                        </div>
                        <div style={{ padding: '0.75rem 1.5rem', backgroundColor: loc.p95 > 2000 ? '#fee2e2' : loc.p95 > 500 ? '#ffedd5' : loc.p95 > 200 ? '#fef3c7' : '#dcfce7', borderRadius: '10px', color: loc.p95 > 2000 ? '#991b1b' : loc.p95 > 500 ? '#9a3412' : loc.p95 > 200 ? '#92400e' : '#166534', fontWeight: 700, fontSize: '0.875rem', border: '1px solid currentColor' }}>
                            STATUS: {loc.severity}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
                        {[
                            { label: 'Avg Latency', val: Math.round(loc.avg) + ' ms' },
                            { label: 'P95 Latency', val: Math.round(loc.p95) + ' ms' },
                            { label: 'P99 Latency', val: Math.round(loc.p99) + ' ms' },
                            { label: 'Total Volume', val: loc.uploads.toLocaleString() }
                        ].map((s, i) => (
                            <div key={i} style={{ padding: '1.5rem', backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #f3f4f6' }}>
                                <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.5rem', color: '#111827' }}>{s.val}</div>
                            </div>
                        ))}
                    </div>

                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '16px', padding: '3rem', textAlign: 'center', border: '2px dashed #e5e7eb' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📈</div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#374151' }}>Hourly Performance Trend</h3>
                        <p style={{ color: '#6b7280', maxWidth: '400px', margin: '0.5rem auto 0' }}> Hourly time-series analysis requires integration with <code>f_latency_node_hourly</code> table.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '1rem' }}>
            {/* KPI Header: Strict Operational Requirements */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem' }}>
                <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '16px', borderLeft: '6px solid #4f46e5', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700 }}>Typical Upload Experience</span>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem', color: '#111827' }}>{kpis.typical} <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>ms</span></div>
                    <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.5rem' }}>Median (P50) of loc averages</p>
                </div>
                <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '16px', borderLeft: '6px solid #ef4444', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700 }}>Worst Outlier P95</span>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem', color: '#b91c1c' }}>{kpis.outlier} <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>ms</span></div>
                    <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.5rem' }}>Max per-location P95</p>
                </div>
                <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700 }}>Fleet Size</span>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem' }}>{kpis.fleetSize} <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Nodes</span></div>
                    <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.5rem' }}>Distinct MidservUid count</p>
                </div>
                <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700 }}>Total Uploads</span>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem', color: '#10b981' }}>{kpis.totalUploads?.toLocaleString()}</div>
                    <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.5rem' }}>Aggregated successes</p>
                </div>
            </div>

            {/* SLA Distribution Section */}
            <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', color: '#374151' }}>SLA Compliance (Per-Location P95)</h3>
                <div style={{ display: 'flex', height: '40px', borderRadius: '20px', overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
                    {slaDist.map((item, idx) => (
                        <div key={idx} style={{
                            width: `${(item.count / kpis.fleetSize) * 100}%`,
                            backgroundColor: item.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: '0.875rem', fontWeight: 700,
                            minWidth: item.count > 0 ? '40px' : '0'
                        }}>
                            {item.count > 0 && `${Math.round((item.count / kpis.fleetSize) * 100)}%`}
                        </div>
                    ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '1.5rem' }}>
                    {slaDist.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: item.color }}></div>
                            <span style={{ fontSize: '0.875rem', color: '#4b5563' }}>{item.level}: <strong>{item.count}</strong></span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Top Critical Nodes section */}
            <div style={{ backgroundColor: '#fff', padding: '2rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>Top 20 Critical Hotspots</h3>
                        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Ranked by P95 | Visual capped at {LATENCY_CAP}ms</p>
                    </div>
                </div>
                <div style={{ height: '700px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            layout="vertical"
                            data={topWorst}
                            margin={{ top: 5, right: 80, left: 100, bottom: 5 }}
                            onClick={(d) => d && d.activePayload && setSelectedLoc(d.activePayload[0].payload)}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f3f4f6" />
                            <XAxis type="number" domain={[0, LATENCY_CAP]} hide />
                            <YAxis
                                dataKey="name"
                                type="category"
                                width={120}
                                tick={{ fontSize: 12, fontWeight: 600, fill: '#4b5563' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                cursor={{ fill: '#f9fafb' }}
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const d = payload[0].payload;
                                        return (
                                            <div style={{ backgroundColor: '#fff', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', border: '1px solid #f3f4f6' }}>
                                                <p style={{ fontWeight: 800, marginBottom: '0.75rem', color: '#111827', borderBottom: '1px solid #f3f4f6', paddingBottom: '0.5rem' }}>{d.fullName}</p>
                                                <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '0.5rem', fontSize: '0.875rem' }}>
                                                    <span style={{ color: '#6b7280' }}>Avg:</span> <span style={{ fontWeight: 600 }}>{Math.round(d.avg)} ms</span>
                                                    <span style={{ color: '#6b7280' }}>P95:</span> <span style={{ fontWeight: 700, color: d.p95 > 500 ? '#ef4444' : '#111827' }}>{Math.round(d.p95)} ms</span>
                                                    {showP99 && <><span style={{ color: '#6b7280' }}>P99:</span> <span style={{ fontWeight: 600, color: '#a855f7' }}>{Math.round(d.p99)} ms</span></>}
                                                    <span style={{ color: '#6b7280' }}>Uploads:</span> <span style={{ fontWeight: 600 }}>{d.uploads.toLocaleString()}</span>
                                                    <span style={{ color: '#6b7280' }}>Severity:</span> <span style={{ fontWeight: 700, color: d.p95 > 2000 ? '#991b1b' : d.p95 > 500 ? '#9a3412' : '#111827' }}>{d.severity}</span>
                                                </div>
                                                <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#4f46e5', fontWeight: 600 }}>Click to analyze in detail →</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Bar
                                dataKey="p95Capped"
                                radius={[0, 6, 6, 0]}
                                barSize={24}
                                cursor="pointer"
                            >
                                {topWorst.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.p95 > 2000 ? '#7f1d1d' : entry.p95 > 500 ? '#ef4444' : entry.p95 > 200 ? '#f59e0b' : '#10b981'}
                                        fillOpacity={0.9}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

const ChannelFilter = ({ channels, hidden, onToggle }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div style={{ position: 'relative', marginLeft: '1rem' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '0.35rem 0.75rem',
                    backgroundColor: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#4b5563',
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
            >
                <span>⚙️ Filter</span>
            </button>
            {isOpen && (
                <div style={{
                    position: 'absolute', right: 0, top: '110%',
                    backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px',
                    padding: '1rem', zIndex: 50, minWidth: '220px',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#111827' }}>Show/Hide Channels</span>
                        <span onClick={() => setIsOpen(false)} style={{ cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1, color: '#9ca3af' }}>&times;</span>
                    </div>
                    <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {channels.map(c => (
                            <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                                <input
                                    type="checkbox"
                                    checked={!hidden.has(c)}
                                    onChange={() => onToggle(c)}
                                    style={{ width: '14px', height: '14px', accentColor: '#4f46e5', cursor: 'pointer' }}
                                />
                                <span style={{ color: hidden.has(c) ? '#9ca3af' : '#374151' }}>{c}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const SalesAnalyzeDashboard = ({ summary, loading, onRefresh }) => {
    if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Loading analysis dashboard...</div>;

    // State for filtering charts
    const [hidden1, setHidden1] = useState(new Set());
    const [hidden3, setHidden3] = useState(new Set());
    const [hidden4, setHidden4] = useState(new Set());
    const [hidden5, setHidden5] = useState(new Set());

    const toggleHidden = (prevSet, val) => {
        const newSet = new Set(prevSet);
        if (newSet.has(val)) newSet.delete(val);
        else newSet.add(val);
        return newSet;
    };

    const rows = summary?.rows || [];
    if (rows.length === 0) return (
        <div style={{ padding: '4rem 2rem', textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '16px', border: '2px dashed #e5e7eb' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>No Data Found</h3>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>No sales records found for the selected date range.</p>
            <button onClick={() => onRefresh && onRefresh()} style={{ padding: '0.5rem 1.5rem', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Refresh</button>
        </div>
    );

    // Helper to process row keys case-insensitively
    const getField = (row, key) => row[key] !== undefined ? row[key] : row[key.toUpperCase()];

    // Helper to format date with day of week
    const formatDateWithDay = (dateStr) => {
        if (!dateStr || dateStr === 'Unknown') return dateStr;

        // Extract just the date part (YYYY-MM-DD)
        let datePart = dateStr;
        if (dateStr.includes('T')) {
            datePart = dateStr.split('T')[0];
        } else if (dateStr.includes(' ')) {
            datePart = dateStr.split(' ')[0];
        }

        // Parse date components
        const [year, month, day] = datePart.split('-').map(num => parseInt(num, 10));

        // Create date using local time (not UTC) to get correct day of week
        const date = new Date(year, month - 1, day);
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayOfWeek = days[date.getDay()];

        return `${datePart} (${dayOfWeek})`;
    };

    // Aggregate data helper
    const aggregateByDate = (filteredRows) => {
        const aggregated = filteredRows.reduce((acc, current) => {
            const dateStr = getField(current, 'shiftdate');

            // Extract date portion handling timezone correctly
            let date = 'Unknown';
            if (dateStr) {
                // If it's a string with T (ISO), parse it to Date to convert UTC to Local
                if (typeof dateStr === 'string' && dateStr.includes('T')) {
                    const d = new Date(dateStr);
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    date = `${year}-${month}-${day}`;
                } else if (dateStr instanceof Date) {
                    const year = dateStr.getFullYear();
                    const month = String(dateStr.getMonth() + 1).padStart(2, '0');
                    const day = String(dateStr.getDate()).padStart(2, '0');
                    date = `${year}-${month}-${day}`;
                } else {
                    // Fallback for simple strings (YYYY-MM-DD)
                    const strDate = String(dateStr);
                    date = strDate.includes('T') ? strDate.split('T')[0] : (strDate.includes(' ') ? strDate.split(' ')[0] : strDate);
                }
            }

            if (!acc[date]) {
                const dayOfWeek = getField(current, 'dayofweek') || '';
                acc[date] = { shiftdate: date, dayofweek: dayOfWeek, paysum: 0, checkcount: 0 };
            }
            acc[date].paysum += Number(getField(current, 'paysum') || 0);
            acc[date].checkcount += Number(getField(current, 'checkcount') || 0);
            return acc;
        }, {});
        return Object.values(aggregated).map(item => ({
            ...item,
            shiftdateWithDay: item.dayofweek ? `${item.shiftdate} (${item.dayofweek})` : formatDateWithDay(item.shiftdate),
            averageBill: item.checkcount > 0 ? Math.round(item.paysum / item.checkcount) : 0
        })).sort((a, b) => a.shiftdate.localeCompare(b.shiftdate));
    };

    // Aggregate by Date and Channel
    const aggregateByDateChannel = (filteredRows) => {
        const aggregated = filteredRows.reduce((acc, current) => {
            const dateStr = getField(current, 'shiftdate');

            // Extract date portion handling timezone correctly
            let date = 'Unknown';
            if (dateStr) {
                // If it's a string with T (ISO), parse it to Date to convert UTC to Local
                if (typeof dateStr === 'string' && dateStr.includes('T')) {
                    const d = new Date(dateStr);
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    date = `${year}-${month}-${day}`;
                } else if (dateStr instanceof Date) {
                    const year = dateStr.getFullYear();
                    const month = String(dateStr.getMonth() + 1).padStart(2, '0');
                    const day = String(dateStr.getDate()).padStart(2, '0');
                    date = `${year}-${month}-${day}`;
                } else {
                    // Fallback for simple strings (YYYY-MM-DD)
                    const strDate = String(dateStr);
                    date = strDate.includes('T') ? strDate.split('T')[0] : (strDate.includes(' ') ? strDate.split(' ')[0] : strDate);
                }
            }

            const channel = getField(current, 'revenuecenter') || 'Unknown';
            const key = `${date}_${channel}`;
            if (!acc[key]) {
                acc[key] = { shiftdate: date, revenuecenter: channel, paysum: 0, checkcount: 0 };
            }
            acc[key].paysum += Number(getField(current, 'paysum') || 0);
            acc[key].checkcount += Number(getField(current, 'checkcount') || 0);
            return acc;
        }, {});
        return Object.values(aggregated).sort((a, b) => a.shiftdate.localeCompare(b.shiftdate) || a.revenuecenter.localeCompare(b.revenuecenter));
    };

    // Filter rows for Dashboard 1 based on user selection
    const dashboard1Rows = useMemo(() => {
        if (hidden1.size === 0) return rows;
        return rows.filter(r => !hidden1.has(getField(r, 'revenuecenter')));
    }, [rows, hidden1]);

    const dashboard1Data = useMemo(() => aggregateByDate(dashboard1Rows), [dashboard1Rows]);
    const inHouseRows = rows.filter(r => Number(getField(r, 'revenuecenterid')) === 10033);
    const dashboard2Data = aggregateByDate(inHouseRows);
    const inHouseName = inHouseRows.length > 0 ? getField(inHouseRows[0], 'revenuecenter') : 'InHouse';

    // Dashboard 3 Pivot Logic: Group by Date, separate lines for each Channel
    const otherRows = rows.filter(r => Number(getField(r, 'revenuecenterid')) !== 10033);
    const uniqueChannels = [...new Set(otherRows.map(r => getField(r, 'revenuecenter')))];
    const allUniqueChannels = [...new Set(rows.map(r => getField(r, 'revenuecenter')))];

    // Dashboard 3: Revenue trend by channel
    const dashboard3ChartData = useMemo(() => {
        const aggregated = otherRows.reduce((acc, current) => {
            const dateStr = getField(current, 'shiftdate');

            // Extract date portion handling timezone correctly
            let date = 'Unknown';
            if (dateStr) {
                if (typeof dateStr === 'string' && dateStr.includes('T')) {
                    const d = new Date(dateStr);
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    date = `${year}-${month}-${day}`;
                } else if (dateStr instanceof Date) {
                    const year = dateStr.getFullYear();
                    const month = String(dateStr.getMonth() + 1).padStart(2, '0');
                    const day = String(dateStr.getDate()).padStart(2, '0');
                    date = `${year}-${month}-${day}`;
                } else {
                    const strDate = String(dateStr);
                    date = strDate.includes('T') ? strDate.split('T')[0] : (strDate.includes(' ') ? strDate.split(' ')[0] : strDate);
                }
            }

            const channel = getField(current, 'revenuecenter') || 'Unknown';
            if (!acc[date]) {
                const dayOfWeek = getField(current, 'dayofweek') || '';
                acc[date] = { shiftdate: date, dayofweek: dayOfWeek };
            }
            acc[date][channel] = (acc[date][channel] || 0) + Number(getField(current, 'paysum') || 0);
            return acc;
        }, {});
        return Object.values(aggregated).map(item => ({
            ...item,
            shiftdateWithDay: item.dayofweek ? `${item.shiftdate} (${item.dayofweek})` : formatDateWithDay(item.shiftdate)
        })).sort((a, b) => a.shiftdate.localeCompare(b.shiftdate));
    }, [otherRows]);

    // Dashboard 3b: Check count trend by channel
    const dashboard3CheckCountData = useMemo(() => {
        const aggregated = otherRows.reduce((acc, current) => {
            const dateStr = getField(current, 'shiftdate');

            // Extract date portion handling timezone correctly
            let date = 'Unknown';
            if (dateStr) {
                if (typeof dateStr === 'string' && dateStr.includes('T')) {
                    const d = new Date(dateStr);
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    date = `${year}-${month}-${day}`;
                } else if (dateStr instanceof Date) {
                    const year = dateStr.getFullYear();
                    const month = String(dateStr.getMonth() + 1).padStart(2, '0');
                    const day = String(dateStr.getDate()).padStart(2, '0');
                    date = `${year}-${month}-${day}`;
                } else {
                    const strDate = String(dateStr);
                    date = strDate.includes('T') ? strDate.split('T')[0] : (strDate.includes(' ') ? strDate.split(' ')[0] : strDate);
                }
            }

            const channel = getField(current, 'revenuecenter') || 'Unknown';
            if (!acc[date]) {
                const dayOfWeek = getField(current, 'dayofweek') || '';
                acc[date] = { shiftdate: date, dayofweek: dayOfWeek };
            }
            acc[date][channel] = (acc[date][channel] || 0) + Number(getField(current, 'checkcount') || 0);
            return acc;
        }, {});
        return Object.values(aggregated).map(item => ({
            ...item,
            shiftdateWithDay: item.dayofweek ? `${item.shiftdate} (${item.dayofweek})` : formatDateWithDay(item.shiftdate)
        })).sort((a, b) => a.shiftdate.localeCompare(b.shiftdate));
    }, [otherRows]);

    // Dashboard 3c: Average Bill trend by channel (ALL CHANNELS)
    const dashboard3AvgBillData = useMemo(() => {
        const aggregated = rows.reduce((acc, current) => {
            const dateStr = getField(current, 'shiftdate');

            // Extract date portion handling timezone correctly
            let date = 'Unknown';
            if (dateStr) {
                if (typeof dateStr === 'string' && dateStr.includes('T')) {
                    const d = new Date(dateStr);
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    date = `${year}-${month}-${day}`;
                } else if (dateStr instanceof Date) {
                    const year = dateStr.getFullYear();
                    const month = String(dateStr.getMonth() + 1).padStart(2, '0');
                    const day = String(dateStr.getDate()).padStart(2, '0');
                    date = `${year}-${month}-${day}`;
                } else {
                    const strDate = String(dateStr);
                    date = strDate.includes('T') ? strDate.split('T')[0] : (strDate.includes(' ') ? strDate.split(' ')[0] : strDate);
                }
            }

            const channel = getField(current, 'revenuecenter') || 'Unknown';
            if (!acc[date]) {
                const dayOfWeek = getField(current, 'dayofweek') || '';
                // We store meta data to construct rows later
                acc[date] = { meta: { shiftdate: date, dayofweek: dayOfWeek }, channels: {} };
            }
            if (!acc[date].channels[channel]) {
                acc[date].channels[channel] = { paysum: 0, checkcount: 0 };
            }
            acc[date].channels[channel].paysum += Number(getField(current, 'paysum') || 0);
            acc[date].channels[channel].checkcount += Number(getField(current, 'checkcount') || 0);
            return acc;
        }, {});

        return Object.values(aggregated).map(item => {
            const row = {
                shiftdate: item.meta.shiftdate,
                dayofweek: item.meta.dayofweek,
                shiftdateWithDay: item.meta.dayofweek ? `${item.meta.shiftdate} (${item.meta.dayofweek})` : formatDateWithDay(item.meta.shiftdate)
            };
            Object.keys(item.channels).forEach(channel => {
                const { paysum, checkcount } = item.channels[channel];
                row[channel] = checkcount > 0 ? Math.round(paysum / checkcount) : null;
            });
            return row;
        }).sort((a, b) => a.shiftdate.localeCompare(b.shiftdate));
    }, [rows]);

    const dashboard3TableData = aggregateByDateChannel(otherRows);

    const EXECUTIVE_COLORS = ['#4338ca', '#059669', '#d97706', '#2563eb', '#dc2626', '#7c3aed', '#db2777', '#0891b2', '#ea580c', '#1e293b'];

    const renderComboChart = (data, title, description, filterControl) => (
        <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #f3f4f6', marginBottom: '2rem' }}>
            <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', margin: 0 }}>{title}</h3>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>{description}</p>
                </div>
                {filterControl}
            </div>
            <div style={{ height: '400px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="shiftdateWithDay" tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" orientation="left" stroke="#4338ca" tick={{ fontSize: 11 }} tickFormatter={(val) => val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : val.toLocaleString()} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="right" orientation="right" stroke="#059669" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="avgBill" orientation="right" stroke="#d97706" tick={{ fontSize: 11 }} tickFormatter={(val) => val.toLocaleString()} axisLine={false} tickLine={false} />
                        <Tooltip
                            formatter={(value, name) => [name === 'Revenue' ? formatNumber(value) : formatNumber(value), name]}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        <Bar yAxisId="left" dataKey="paysum" fill="#4338ca" radius={[6, 6, 0, 0]} name="Revenue" barSize={40} />
                        <Line yAxisId="right" type="monotone" dataKey="checkcount" stroke="#059669" strokeWidth={3} dot={{ r: 6, fill: '#059669', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8 }} name="Check Count" />
                        <Line yAxisId="avgBill" type="monotone" dataKey="averageBill" stroke="#d97706" strokeWidth={3} dot={{ r: 6, fill: '#d97706', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8 }} name="Average Bill" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );

    // Special chart for InHouse Performance with Average Bill
    const renderInHouseChart = (data, title, description) => (
        <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #f3f4f6', marginBottom: '2rem' }}>
            <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', margin: 0 }}>{title}</h3>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>{description}</p>
            </div>
            <div style={{ height: '400px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="shiftdateWithDay" tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" orientation="left" stroke="#4338ca" tick={{ fontSize: 11 }} tickFormatter={(val) => val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : val.toLocaleString()} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="right" orientation="right" stroke="#059669" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="avgBill" orientation="right" stroke="#d97706" tick={{ fontSize: 11 }} tickFormatter={(val) => val.toLocaleString()} axisLine={false} tickLine={false} />
                        <Tooltip
                            formatter={(value, name) => [name === 'Revenue' ? formatNumber(value) : formatNumber(value), name]}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        <Bar yAxisId="left" dataKey="paysum" fill="#4338ca" radius={[6, 6, 0, 0]} name="Revenue" barSize={40} />
                        <Line yAxisId="right" type="monotone" dataKey="checkcount" stroke="#059669" strokeWidth={3} dot={{ r: 6, fill: '#059669', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8 }} name="Check Count" />
                        <Line yAxisId="avgBill" type="monotone" dataKey="averageBill" stroke="#d97706" strokeWidth={3} dot={{ r: 6, fill: '#d97706', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8 }} name="Average Bill" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {renderComboChart(dashboard1Data, '1. Summary of All Channels', 'Total Revenue (Bar), Check Count (Line), and Average Bill (Line) aggregated by Shift Date.', <ChannelFilter channels={allUniqueChannels} hidden={hidden1} onToggle={(c) => setHidden1(prev => toggleHidden(prev, c))} />)}

            {/* InHouse Performance - Full Width with Average Bill */}
            {dashboard2Data.length > 0 && renderInHouseChart(dashboard2Data, '2. InHouse Performance', `Revenue, Check Count, and Average Bill trends for Revenue Center ${inHouseName}.`)}

            {/* Other Channels - Side by Side */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
                {/* Other Channels - Check Count Trend */}
                {dashboard3CheckCountData.length > 0 && (
                    <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #f3f4f6' }}>
                        <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', margin: 0 }}>3. Other Channels Check Count Trend</h3>
                                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>Check count tracking across all channels (excluding {inHouseName}). Each line represents a unique channel.</p>
                            </div>
                            <ChannelFilter channels={uniqueChannels} hidden={hidden3} onToggle={(c) => setHidden3(prev => toggleHidden(prev, c))} />
                        </div>
                        <div style={{ height: '400px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={dashboard3CheckCountData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                    <XAxis dataKey="shiftdateWithDay" tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        itemSorter={(item) => -item.value}
                                        formatter={(value) => formatNumber(value)}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                    {uniqueChannels.filter(c => !hidden3.has(c)).map((channel, index) => (
                                        <Line
                                            key={channel}
                                            type="monotone"
                                            dataKey={channel}
                                            stroke={EXECUTIVE_COLORS[index % EXECUTIVE_COLORS.length]}
                                            strokeWidth={3}
                                            dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                                            activeDot={{ r: 6 }}
                                            name={channel}
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* Other Channels - Revenue Trend */}
                {dashboard3ChartData.length > 0 && (
                    <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #f3f4f6' }}>
                        <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', margin: 0 }}>4. Other Channels Revenue Trend</h3>
                                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>Revenue tracking across all channels (excluding {inHouseName}). Each line represents a unique channel.</p>
                            </div>
                            <ChannelFilter channels={uniqueChannels} hidden={hidden4} onToggle={(c) => setHidden4(prev => toggleHidden(prev, c))} />
                        </div>
                        <div style={{ height: '400px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={dashboard3ChartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                    <XAxis dataKey="shiftdateWithDay" tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : val.toLocaleString()} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        itemSorter={(item) => -item.value}
                                        formatter={(value) => formatNumber(value)}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                    {uniqueChannels.filter(c => !hidden4.has(c)).map((channel, index) => (
                                        <Line
                                            key={channel}
                                            type="monotone"
                                            dataKey={channel}
                                            stroke={EXECUTIVE_COLORS[index % EXECUTIVE_COLORS.length]}
                                            strokeWidth={3}
                                            dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                                            activeDot={{ r: 6 }}
                                            name={channel}
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* Other Channels - Average Bill Trend */}
                {dashboard3AvgBillData.length > 0 && (
                    <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #f3f4f6' }}>
                        <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', margin: 0 }}>5. All Channels Average Bill Trend</h3>
                                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>Average bill amount (paysum/checkcount) by Revenue Center by Date.</p>
                            </div>
                            <ChannelFilter channels={allUniqueChannels} hidden={hidden5} onToggle={(c) => setHidden5(prev => toggleHidden(prev, c))} />
                        </div>
                        <div style={{ height: '400px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={dashboard3AvgBillData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                    <XAxis dataKey="shiftdateWithDay" tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => val.toLocaleString()} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        itemSorter={(item) => -item.value}
                                        formatter={(value) => formatNumber(value)}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                    {allUniqueChannels.filter(c => !hidden5.has(c)).map((channel, index) => (
                                        <Line
                                            key={channel}
                                            type="monotone"
                                            dataKey={channel}
                                            stroke={EXECUTIVE_COLORS[index % EXECUTIVE_COLORS.length]}
                                            strokeWidth={3}
                                            dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                                            activeDot={{ r: 6 }}
                                            name={channel}
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const CustomXAxisTick = ({ x, y, payload }) => {
    const parts = (payload.value || '').split(' ');
    if (parts.length < 3) return null;
    const [updateDate, time, shiftDate, percentage] = parts;

    return (
        <g transform={`translate(${x},${y})`}>
            {/* Time line */}
            <text x={0} y={0} dy={12} textAnchor="middle" fill="#111827" style={{ fontSize: '11px', fontWeight: 800 }}>{time}</text>
            {/* Update Date line */}
            <text x={0} y={0} dy={26} textAnchor="middle" fill="#6b7280" style={{ fontSize: '10px', fontWeight: 600 }}>{updateDate}</text>
            {/* Shift Date line */}
            <text x={0} y={0} dy={40} textAnchor="middle" fill="#9ca3af" style={{ fontSize: '9px', fontWeight: 600 }}>S:{shiftDate}</text>
            {/* Percentage line */}
            {percentage && (
                <text x={0} y={0} dy={54} textAnchor="middle" fill="#4f46e5" style={{ fontSize: '10px', fontWeight: 800 }}>{percentage}</text>
            )}
        </g>
    );
};

const SHIFT_BG_COLORS = [
    'rgba(240, 249, 255, 0.4)', // Light blue
    'rgba(240, 253, 244, 0.4)', // Light green
    'rgba(255, 251, 235, 0.4)', // Light yellow
    'rgba(254, 242, 242, 0.4)', // Light red
    'rgba(245, 243, 255, 0.4)', // Light purple
];

const OnlineSalesRevenueSnapshotDashboard = ({ data, loading, params, onRefresh }) => {
    if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Loading snapshot data...</div>;

    // For this dashboard, we now show combined total from all statuses
    // const [filterStatus, setFilterStatus] = useState('both'); 


    const processedData = useMemo(() => {
        if (!data || !Array.isArray(data)) return [];

        // Data is now pre-aggregated and filtered in the backend query
        let filtered = data.filter(item => item && item.data);

        const aggregated = filtered.reduce((acc, currentItem) => {
            const item = currentItem.data;
            const updateTime = item.update_time;
            if (!updateTime) return acc;

            const tDate = new Date(updateTime);
            if (isNaN(tDate.getTime())) return acc;

            const year = tDate.getFullYear();
            const month = String(tDate.getMonth() + 1).padStart(2, '0');
            const day = String(tDate.getDate()).padStart(2, '0');
            const date = `${year}-${month}-${day}`;

            const hh = String(tDate.getHours()).padStart(2, '0');
            const mm = String(tDate.getMinutes()).padStart(2, '0');
            const time = `${hh}:${mm}`;
            
            // Format shiftdate consistently
            let shiftDate = item.shiftdate;
            if (shiftDate) {
                const sDate = new Date(shiftDate);
                if (!isNaN(sDate.getTime())) {
                    const sYear = sDate.getFullYear();
                    const sMonth = String(sDate.getMonth() + 1).padStart(2, '0');
                    const sDay = String(sDate.getDate()).padStart(2, '0');
                    shiftDate = `${sYear}-${sMonth}-${sDay}`;
                }
            } else {
                shiftDate = 'Unknown';
            }

            // X-axis labeling: unique points per date, time, AND shiftdate
            const key = `${date} ${time} ${shiftDate}`;

            if (!acc[key]) {
                acc[key] = { 
                    label: key, 
                    displayDate: date,
                    displayTime: time, 
                    shiftDate: shiftDate,
                    totalCheckNumber: 0,
                    restaruantCount: 0
                };
            }
            
            acc[key].totalCheckNumber += Number(item.total_check || 0);
            acc[key].restaruantCount = Math.max(acc[key].restaruantCount, Number(item.restaruantcount || 0));

            return acc;
        }, {});

        const sortedResult = Object.values(aggregated).sort((a, b) => a.label.localeCompare(b.label));

        // Calculate percentage of total_check relative to the last snapshot of that shiftdate
        const lastValueByShift = {};
        sortedResult.forEach(item => {
            lastValueByShift[item.shiftDate] = Math.max(lastValueByShift[item.shiftDate] || 0, item.totalCheckNumber);
        });

        return sortedResult.map(item => {
            const finalVal = lastValueByShift[item.shiftDate] || 0;
            const pct = finalVal > 0 ? ((item.totalCheckNumber / finalVal) * 100).toFixed(2) : '0.00';
            return {
                ...item,
                percentage: `${pct}%`,
                label: `${item.label} ${pct}%`
            };
        });
    }, [data]);

    const referenceAreas = useMemo(() => {
        if (!processedData || processedData.length === 0) return [];
        const areas = [];
        let currentShift = processedData[0].shiftDate;
        let startIndex = 0;

        for (let i = 1; i <= processedData.length; i++) {
            const shift = i < processedData.length ? processedData[i].shiftDate : null;
            if (shift !== currentShift) {
                areas.push({
                    shiftDate: currentShift,
                    x1: processedData[startIndex].label,
                    x2: processedData[i - 1].label
                });
                if (i < processedData.length) {
                    currentShift = shift;
                    startIndex = i;
                }
            }
        }
        return areas;
    }, [processedData]);

    if (processedData.length === 0) {
        return (
            <div style={{ padding: '4rem 2rem', textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '16px', border: '2px dashed #e5e7eb' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>No Data Found</h3>
                <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>There is no snapshot data recorded for the selected shifts/times.</p>
                <button
                    onClick={() => onRefresh && onRefresh()}
                    style={{ padding: '0.5rem 1.5rem', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                >
                    Refresh Data
                </button>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #f3f4f6' }}>
                <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', margin: 0 }}>Total Check Number Over Time</h3>
                        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>Snapshot of combined check counts (Checks + Voids) for all statuses</p>
                    </div>
                </div>
                <div style={{ height: '400px', overflowX: 'auto', overflowY: 'hidden', border: '1px solid #f3f4f6', borderRadius: '8px' }}>
                    <div style={{ minWidth: Math.max(800, processedData.length * 60), height: '100%', padding: '1rem 0' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={processedData} margin={{ bottom: 70 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                            {referenceAreas.map((area, index) => (
                                <ReferenceArea 
                                    key={index} 
                                    x1={area.x1} 
                                    x2={area.x2} 
                                    fill={SHIFT_BG_COLORS[index % SHIFT_BG_COLORS.length]} 
                                    strokeOpacity={0}
                                />
                            ))}
                            <XAxis 
                                dataKey="label" 
                                tick={<CustomXAxisTick />} 
                                axisLine={false} 
                                tickLine={false}
                                interval={0}
                                height={80}
                            />
                            <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(val) => val.toLocaleString()} axisLine={false} tickLine={false} />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                formatter={(value, name) => [value.toLocaleString(), name]}
                                labelFormatter={(value) => {
                                    const parts = (value || '').split(' ');
                                    if (parts.length < 4) return value;
                                    const [updateDate, time, shiftDate, percentage] = parts;
                                    return (
                                        <div style={{ fontWeight: 700, color: '#111827', borderBottom: '1px solid #f3f4f6', marginBottom: '8px', paddingBottom: '4px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>Time: {time}</span>
                                                <span style={{ color: '#4f46e5', fontSize: '12px' }}>{percentage}</span>
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#6b7280' }}>Update Date: {updateDate}</div>
                                            <div style={{ fontSize: '11px', color: '#6b7280' }}>Shift Date: {shiftDate}</div>
                                        </div>
                                    );
                                }}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                            <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey="totalCheckNumber"
                                stroke="#4f46e5"
                                strokeWidth={3}
                                dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                                activeDot={{ r: 6 }}
                                name="Total Check Number (Checks + Voids)"
                            />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

const OnlineSalesDashboard = ({ summary, loading, onRefresh }) => {
    console.log('[DEBUG] OnlineSalesDashboard summary prop:', summary);
    if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Loading summary dashboard...</div>;

    // Check if summary is completely missing (backend didn't send it)
    if (summary === undefined) {
        return (
            <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: '#fff5f5', color: '#c53030', borderRadius: '16px', border: '1px solid #feb2b2', marginBottom: '2rem' }}>
                <h3 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: '0.5rem' }}>⚠️ Backend Sync Issue</h3>
                <p style={{ marginBottom: '1rem' }}>The backend API returned data but missed the dashboard "summary" object.</p>
                <p style={{ fontWeight: 600 }}>Please RESTART your backend server (Close the terminal running the API and run <code>npm start</code> again).</p>
                <button
                    onClick={() => onRefresh && onRefresh()}
                    style={{ marginTop: '1.5rem', padding: '0.5rem 1.5rem', backgroundColor: '#c53030', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                >
                    Check Again
                </button>
            </div>
        );
    }

    if (!summary || summary.noData || (summary.restaurants === 0 && summary.paysum === 0)) {
        return (
            <div style={{ padding: '4rem 2rem', textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '16px', border: '2px dashed #e5e7eb' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>No Data Found</h3>
                <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>There is no online sales data recorded for the selected shift date.</p>
                <button
                    onClick={() => onRefresh && onRefresh()}
                    style={{ padding: '0.5rem 1.5rem', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                >
                    Refresh Data
                </button>
            </div>
        );
    }

    const stats = summary;
    const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];

    const Card = ({ title, value, subValue, color, icon }) => (
        <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '16px', borderLeft: `6px solid ${color}`, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>{title}</span>
                <span style={{ fontSize: '1.25rem' }}>{icon}</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#111827' }}>{value}</div>
            {subValue && <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>{subValue}</div>}
        </div>
    );

    const RankTable = ({ title, data, type }) => {
        const getField = (row, key) => row[key] !== undefined ? row[key] : row[key.toUpperCase()];

        return (
            <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #f3f4f6', flex: 1, minWidth: '300px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {type === 'high' ? '🚀' : '⚠️'} {title}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {Array.isArray(data) && data.length > 0 ? data.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #f3f4f6' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: type === 'high' ? '#10b981' : '#ef4444', width: '20px' }}>{idx + 1}.</span>
                                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>{getField(item, 'restaurantname') || getField(item, 'name') || 'Unknown'}</span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>{formatNumber(getField(item, 'paysum'))}</div>
                                <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{getField(item, 'checkcount') || 0} checks</div>
                            </div>
                        </div>
                    )) : <div style={{ textAlign: 'center', color: '#9ca3af', padding: '1rem' }}>No ranking data</div>}
                </div>
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginBottom: '1rem' }}>
            {/* KPI Section */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
                <Card title="RESTAURANTS" value={stats.restaurants ?? 0} icon="🏪" color="#4f46e5" />
                <Card title="OPENED SHIFTS" value={stats.restaurantsOpened ?? 0} icon="✅" color="#10b981" />
                <Card title="CLOSED SHIFTS" value={stats.restaurantsClosed ?? 0} icon="🔒" color="#ef4444" />
                <Card title="PAYSUM" value={formatNumber(stats.paysum ?? 0)} subValue="Total Revenue" icon="💰" color="#10b981" />
                <Card title="CHECKCOUNT" value={formatNumber(stats.checkcount ?? 0)} icon="📄" color="#f59e0b" />
                <Card title="ORDERNUMBER" value={formatNumber(stats.ordernumber ?? 0)} icon="🛒" color="#3b82f6" />
                <Card title="CHECKCOUNTVOID" value={formatNumber(stats.checkcountvoid ?? 0)} icon="🚫" color="#ef4444" />
            </div>

            {/* Ranking Section */}
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <RankTable title="Top 5 Highest Revenue" data={stats.highest5} type="high" />
                <RankTable title="Top 5 Lowest Revenue" data={stats.lowest5} type="low" />
            </div>

            {/* Charts Section */}
            {stats.revenueCenterData && stats.revenueCenterData.length > 0 && (() => {
                // Process data to group small slices: Top 9 + Other (if > 10 total)
                const processChartData = (key) => {
                    const validData = stats.revenueCenterData
                        .filter(item => (item[key] || 0) >= 0) // Keep 0s if they are part of the set, but usually filtered in the view
                        .sort((a, b) => (b[key] || 0) - (a[key] || 0));

                    if (validData.length === 0) return [];

                    // If we have more than 10 records, show top 9 and group the rest into "Other"
                    if (validData.length > 10) {
                        const mainItems = validData.slice(0, 9);
                        const restItems = validData.slice(9);
                        const otherSum = restItems.reduce((acc, curr) => ({
                            ...acc,
                            [key]: (acc[key] || 0) + (curr[key] || 0)
                        }), { revenuecenter: 'Other' });
                        return [...mainItems, otherSum];
                    }

                    // If 10 or fewer, show everything as is
                    return validData;
                };

                const revenueData = processChartData('paysum');
                const voidAmountData = processChartData('paysumvoid');
                const checkCountData = processChartData('checkcount');
                const checkVoidData = processChartData('checkcountvoid');

                const renderPie = (data, dataKey, title) => {
                    const total = data.reduce((acc, curr) => acc + (curr[dataKey] || 0), 0);
                    const isCurrency = dataKey.includes('paysum');
                    const executiveColors = ['#4338ca', '#059669', '#d97706', '#2563eb', '#dc2626', '#7c3aed', '#db2777', '#0891b2', '#ea580c'];

                    return (
                        <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -2px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6', flex: '1 1 650px', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '480px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f3f4f6', paddingBottom: '1rem' }}>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#111827', margin: 0 }}>{title}</h3>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#6b7280', backgroundColor: '#f9fafb', padding: '0.25rem 0.75rem', borderRadius: '20px' }}>
                                    Total: {formatNumber(total)}
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2rem', flex: 1 }}>
                                {/* Pie Chart Area with Center Label */}
                                <div style={{ height: '320px', flex: '1.2', minWidth: '300px', position: 'relative' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={data}
                                                dataKey={dataKey}
                                                nameKey="revenuecenter"
                                                cx="50%"
                                                cy="50%"
                                                outerRadius={110}
                                                innerRadius={75}
                                                stroke="none"
                                                paddingAngle={3}
                                                label={false}
                                            >
                                                {data.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={executiveColors[index % executiveColors.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                                formatter={(value) => [formatNumber(value), isCurrency ? 'Amount' : 'Count']}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    {/* Center Text for Donut */}
                                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>
                                            {isCurrency && total > 1000000 ? (total / 1000000).toFixed(1) + 'M' : formatNumber(total)}
                                        </div>
                                    </div>
                                </div>

                                {/* Detailed Table Area */}
                                <div style={{ flex: '1', minWidth: '280px', backgroundColor: '#f9fafb', padding: '1.25rem', borderRadius: '12px' }}>
                                    <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'separate', borderSpacing: '0 0.5rem' }}>
                                        <thead>
                                            <tr style={{ color: '#6b7280', textAlign: 'left' }}>
                                                <th style={{ padding: '0 0.5rem', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>Channel</th>
                                                <th style={{ padding: '0 0.5rem', textAlign: 'right', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>Value</th>
                                                <th style={{ padding: '0 0.5rem', textAlign: 'right', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>%</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.map((item, idx) => {
                                                const val = item[dataKey] || 0;
                                                const pct = total > 0 ? (val / total * 100).toFixed(1) : 0;
                                                return (
                                                    <tr key={idx} style={{ backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                                        <td style={{ padding: '0.6rem 0.5rem', borderRadius: '8px 0 0 8px', color: '#374151', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                                                            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', backgroundColor: executiveColors[idx % executiveColors.length], marginRight: '10px' }}></span>
                                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }} title={item.revenuecenter}>{item.revenuecenter}</span>
                                                        </td>
                                                        <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#111827' }}>{formatNumber(val)}</td>
                                                        <td style={{ padding: '0.6rem 0.5rem', borderRadius: '0 8px 8px 0', textAlign: 'right', color: '#4338ca', fontWeight: 700 }}>{pct}%</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    );
                };

                return (
                    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', flexDirection: 'column' }}>
                        {/* Financial Charts Row */}
                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                            {revenueData.length > 0 && renderPie(revenueData, 'paysum', 'Revenue by Chanel')}
                            {voidAmountData.length > 0 && renderPie(voidAmountData, 'paysumvoid', 'Void Amount by Chanel')}
                        </div>

                        {/* Operational Charts Row */}
                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                            {checkCountData.length > 0 && renderPie(checkCountData, 'checkcount', 'Check by Chanel')}
                            {checkVoidData.length > 0 && renderPie(checkVoidData, 'checkcountvoid', 'Check void by Chanel')}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

const LatencyDashboard = ({ data, params }) => {
    const showP99 = params?.showP99 === true;
    // Format data for chart
    const chartData = (data || []).map(item => {
        const actual = item.data || item;
        return {
            ...actual,
            upload_date: actual.upload_date ? new Date(actual.upload_date).toLocaleDateString() : 'N/A',
            avg_latency_ms: parseFloat(actual.avg_latency_ms) || 0,
            p95_latency_ms: parseFloat(actual.p95_latency_ms) || 0,
            p99_latency_ms: parseFloat(actual.p99_latency_ms) || 0,
            upload_count: parseInt(actual.upload_count) || 0
        };
    });

    return (
        <div style={{ padding: '2rem', height: '500px', width: '100%', backgroundColor: '#fff', borderRadius: '12px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '2rem', color: '#111827', textAlign: 'center' }}>
                System Upload Latency Analysis
            </h2>
            <ResponsiveContainer width="100%" height="90%">
                <LineChart
                    data={chartData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis
                        dataKey="upload_date"
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        axisLine={{ stroke: '#e5e7eb' }}
                        tickLine={false}
                    />
                    <YAxis
                        label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft', offset: 0, style: { fill: '#6b7280', fontSize: 12, fontWeight: 500 } }}
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        axisLine={{ stroke: '#e5e7eb' }}
                        tickLine={false}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#fff',
                            borderRadius: '12px',
                            border: '1px solid #e5e7eb',
                            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                        }}
                        itemStyle={{ fontSize: '12px', fontWeight: 500 }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Line
                        type="monotone"
                        dataKey="avg_latency_ms"
                        name="Avg Latency"
                        stroke="#4f46e5"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                    <Line
                        type="monotone"
                        dataKey="p95_latency_ms"
                        name="P95 Latency"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                    <Line
                        type="monotone"
                        dataKey="p99_latency_ms"
                        name="P99 Latency"
                        stroke="#a855f7"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#a855f7', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                        hide={!showP99}
                    />
                    <Line type="monotone" dataKey="upload_count" name="Upload Count" hide />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Ecode Using — Coupon usage hourly analytics (server "Ecode", read-only)
// ---------------------------------------------------------------------------

const ECODE_ACCENT = '#e30613';
const ECODE_PALETTE = ['#4f46e5', '#0ea5e9', '#10b981', '#a855f7', '#d97706', '#db2777', '#0891b2', '#65a30d', '#7c3aed', '#0d9488', '#c2410c', '#4d7c0f'];
const ECODE_LIVE_POLL_MS = 75000;

function ecodeFormatInt(n) {
    const v = Number(n) || 0;
    return Math.round(v).toLocaleString('en-US');
}

function ecodeFormatDDMM(dateStr) {
    const parts = String(dateStr).split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}`;
}

function EcodeKpiCard({ label, value, sub, accent }) {
    return (
        <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 6px rgba(0,0,0,.07)', padding: '14px 16px', borderTop: `3px solid ${accent}` }}>
            <div style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px', color: '#6b7280' }}>{label}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 900, fontSize: '28px', margin: '6px 0 2px', lineHeight: 1, color: '#111827' }}>{value}</div>
            <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600 }}>{sub}</div>
        </div>
    );
}

function EcodeDeltaBadge({ current, previous }) {
    const pct = previous ? ((current - previous) / previous * 100) : 0;
    const up = pct >= 0;
    return (
        <span style={{
            fontFamily: "'DM Mono', monospace", fontWeight: 600, padding: '1px 5px', borderRadius: '4px', fontSize: '10px',
            color: up ? '#16a34a' : ECODE_ACCENT,
            background: up ? 'rgba(22,163,74,.1)' : 'rgba(227,6,19,.08)'
        }}>
            {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
        </span>
    );
}

const EcodeUsingDashboard = () => {
    const [todayLive, setTodayLive] = useState(null); // { currentHour, hours:[{hour,couponUse}], baseline:[{hour,avgUse}], lastEtl }
    const [hourly, setHourly] = useState(null); // { days: [{date, isToday, hours:[24]}], nowHour }
    const [kpi, setKpi] = useState(null);
    const [heatmap, setHeatmap] = useState(null);
    const [dailyTrend, setDailyTrend] = useState(null);
    const [monthly, setMonthly] = useState(null);
    const [dayRange, setDayRange] = useState(7);
    const [hiddenDates, setHiddenDates] = useState(() => new Set());
    const [loadingLive, setLoadingLive] = useState(true);
    const [loadingStatic, setLoadingStatic] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchLive = useCallback((days) => {
        return Promise.all([getEcodeTodayLive(), getEcodeHourly(days), getEcodeKpi()])
            .then(([todayLiveRes, hourlyRes, kpiRes]) => {
                setTodayLive(todayLiveRes);
                setHourly(hourlyRes);
                setKpi(kpiRes);
                setError(null);
                setLastUpdated(new Date());
            })
            .catch(err => {
                console.error('[EcodeUsingDashboard] live fetch failed', err);
                setError(err.response?.data?.msg || err.message || 'Failed to load Ecode data');
            })
            .finally(() => setLoadingLive(false));
    }, []);

    // Static blocks (heatmap, daily-trend, monthly) — load once when page opens
    useEffect(() => {
        setLoadingStatic(true);
        Promise.all([getEcodeHeatmap(12), getEcodeDailyTrend(14), getEcodeMonthly()])
            .then(([heatmapRes, trendRes, monthlyRes]) => {
                setHeatmap(heatmapRes);
                setDailyTrend(trendRes);
                setMonthly(monthlyRes);
            })
            .catch(err => {
                console.error('[EcodeUsingDashboard] static fetch failed', err);
                setError(prev => prev || err.response?.data?.msg || err.message || 'Failed to load Ecode data');
            })
            .finally(() => setLoadingStatic(false));
    }, []);

    // Live blocks (Online block + KPI + hourly overlay) — fetch on mount/day-range change, then poll 60-90s
    useEffect(() => {
        setLoadingLive(true);
        setHiddenDates(new Set()); // reset legend toggles khi đổi cửa sổ ngày
        fetchLive(dayRange);
        const interval = setInterval(() => fetchLive(dayRange), ECODE_LIVE_POLL_MS);
        return () => clearInterval(interval);
    }, [dayRange, fetchLive]);

    const handleLegendClick = useCallback((entry) => {
        setHiddenDates(prev => {
            const next = new Set(prev);
            if (next.has(entry.dataKey)) next.delete(entry.dataKey); else next.add(entry.dataKey);
            return next;
        });
    }, []);

    const peak = useMemo(() => {
        if (!hourly) return { hour: 0, value: 0 };
        const today = hourly.days.find(d => d.isToday);
        if (!today) return { hour: 0, value: 0 };
        let peakH = 0, peakV = 0;
        today.hours.forEach((v, h) => { if (v !== null && v > peakV) { peakV = v; peakH = h; } });
        return { hour: peakH, value: peakV };
    }, [hourly]);

    const onlineChartData = useMemo(() => {
        if (!todayLive) return [];
        const baselineMap = new Map((todayLive.baseline || []).map(b => [b.hour, b.avgUse]));
        return (todayLive.hours || []).map(h => ({
            hour: String(h.hour).padStart(2, '0') + 'h',
            actual: h.couponUse,
            baseline: baselineMap.get(h.hour) ?? null,
            isCurrent: h.hour === todayLive.currentHour,
        }));
    }, [todayLive]);

    // lastEtl là chuỗi 'yyyy-mm-dd hh:mi' format sẵn từ SQL — đọc thẳng phần giờ:phút,
    // KHÔNG parse qua Date() để tránh bị áp thêm timezone offset (browser local vs server).
    const lastEtlLabel = todayLive?.lastEtl ? todayLive.lastEtl.split(' ')[1] : '--:--';

    const hourlyChartData = useMemo(() => {
        if (!hourly) return [];
        return Array.from({ length: 24 }, (_, h) => {
            const row = { hour: String(h).padStart(2, '0') + 'h' };
            hourly.days.forEach(d => { row[d.date] = d.hours[h]; });
            return row;
        });
    }, [hourly]);

    const heatmapGrid = useMemo(() => {
        if (!heatmap) return { rows: [], max: 0 };
        const byRow = new Map();
        heatmap.forEach(r => {
            const key = `${r.weekdayNo}::${r.weekdayName}`;
            if (!byRow.has(key)) byRow.set(key, { weekdayNo: r.weekdayNo, weekdayName: r.weekdayName, hours: new Array(24).fill(0) });
            const row = byRow.get(key);
            if (r.hour >= 0 && r.hour <= 23) row.hours[r.hour] = r.avgUse;
        });
        const rows = Array.from(byRow.values()).sort((a, b) => a.weekdayNo - b.weekdayNo);
        const max = Math.max(0, ...rows.flatMap(r => r.hours));
        return { rows, max };
    }, [heatmap]);

    const monthlyChartData = useMemo(() => {
        if (!monthly) return [];
        return monthly.map(m => ({ label: `T${m.month}`, totalUse: m.totalUse }));
    }, [monthly]);

    if (loadingLive && loadingStatic && !hourly && !heatmap && !todayLive) {
        return <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Đang tải dữ liệu Ecode...</div>;
    }

    if (error && !hourly && !heatmap && !todayLive) {
        return <div style={{ padding: '2rem', color: ECODE_ACCENT }}>⚠ Không tải được dữ liệu Ecode: {error}</div>;
    }

    const last7Avg = kpi ? Math.round(kpi.last7Total / 7) : 0;

    return (
        <div style={{ padding: '1.5rem', background: '#f3f4f6', borderRadius: '12px' }}>
            <style>{'@keyframes ecodePulse{0%,100%{opacity:1}50%{opacity:.3}}'}</style>
            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', padding: '0.6rem 1rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
                    ⚠ {error} — đang hiển thị dữ liệu gần nhất đã tải được.
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>
                    Coupon Usage — Hourly Analytics · Server Ecode
                </div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.7rem', color: '#9ca3af' }}>
                    {lastUpdated ? `Trang cập nhật ${lastUpdated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </div>
            </div>

            {/* KHỐI ONLINE — coupon theo giờ hôm nay (near-real-time) */}
            <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 6px rgba(0,0,0,.07)', padding: '16px', marginBottom: '1.5rem', borderTop: `3px solid ${ECODE_ACCENT}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800 }}>Coupon hôm nay theo giờ · Online</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: ECODE_ACCENT, animation: 'ecodePulse 1.6s infinite' }} />
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.68rem', color: '#6b7280' }}>
                            Cập nhật mỗi 15 phút · lần cuối {lastEtlLabel}
                        </span>
                    </div>
                </div>
                <div style={{ height: '260px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={onlineChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                            <defs>
                                <pattern id="ecodeHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                                    <rect width="6" height="6" fill="#fecaca" />
                                    <line x1="0" y1="0" x2="0" y2="6" stroke={ECODE_ACCENT} strokeWidth="2" />
                                </pattern>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '11px' }} />
                            <Legend verticalAlign="bottom" iconType="plainline" wrapperStyle={{ fontSize: '10px' }} />
                            <Bar dataKey="actual" name="Coupon giờ này" radius={[4, 4, 0, 0]}>
                                {onlineChartData.map((entry, idx) => (
                                    <Cell key={idx} fill={entry.isCurrent ? 'url(#ecodeHatch)' : ECODE_ACCENT} />
                                ))}
                            </Bar>
                            <Line type="monotone" dataKey="baseline" name="TB cùng giờ 7 ngày qua" stroke="#1f2937" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
                <div style={{ fontSize: '0.68rem', color: '#9a3412', marginTop: '6px' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, background: 'repeating-linear-gradient(45deg, #fecaca, #fecaca 2px, ' + ECODE_ACCENT + ' 2px, ' + ECODE_ACCENT + ' 4px)', marginRight: '4px', verticalAlign: 'middle' }} />
                    Cột giờ hiện tại (đang chạy) — dữ liệu chưa trọn giờ, chưa nên so sánh trực tiếp.
                </div>
            </div>

            {/* KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '1.5rem' }}>
                <EcodeKpiCard
                    label={`Coupon hôm nay (đến ${String(kpi?.nowHour ?? 0).padStart(2, '0')}h)`}
                    accent={ECODE_ACCENT}
                    value={ecodeFormatInt(kpi?.todayToNow)}
                    sub={kpi ? <><EcodeDeltaBadge current={kpi.todayToNow} previous={kpi.ydayToNow} /> vs cùng giờ hôm qua</> : ''}
                />
                <EcodeKpiCard
                    label="Giờ cao điểm hôm nay"
                    accent="#d97706"
                    value={ecodeFormatInt(peak.value)}
                    sub={`lúc ${String(peak.hour).padStart(2, '0')}:00`}
                />
                <EcodeKpiCard
                    label="Tổng 7 ngày gần nhất"
                    accent="#16a34a"
                    value={ecodeFormatInt(kpi?.last7Total)}
                    sub={`TB ${ecodeFormatInt(last7Avg)} / ngày`}
                />
                <EcodeKpiCard
                    label="So cùng thứ tuần trước"
                    accent="#2563eb"
                    value={ecodeFormatInt(kpi?.todayToNow)}
                    sub={kpi ? <><EcodeDeltaBadge current={kpi.todayToNow} previous={kpi.lastwkToNow} /> vs tuần trước</> : ''}
                />
            </div>

            {/* Hourly overlay chart — so sánh nhiều ngày */}
            <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 6px rgba(0,0,0,.07)', padding: '16px', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800 }}>Coupon theo giờ trong ngày</div>
                    <div style={{ display: 'inline-flex', background: '#f3f4f6', borderRadius: '7px', padding: '3px' }}>
                        {[5, 7, 14].map(n => (
                            <button
                                key={n}
                                onClick={() => setDayRange(n)}
                                style={{
                                    border: 'none',
                                    fontFamily: "'DM Mono', monospace", fontSize: '0.7rem', fontWeight: 500,
                                    padding: '4px 10px', borderRadius: '5px', cursor: 'pointer',
                                    color: dayRange === n ? ECODE_ACCENT : '#6b7280',
                                    background: dayRange === n ? '#fff' : 'none',
                                    boxShadow: dayRange === n ? '0 1px 6px rgba(0,0,0,.07)' : 'none'
                                }}
                            >
                                {n} ngày
                            </button>
                        ))}
                    </div>
                </div>
                <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: '8px' }}>
                    Nhấn vào tên ngày trong chú giải bên dưới để ẩn/hiện từng đường.
                </div>
                <div style={{ height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={hourlyChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '11px' }} />
                            <Legend
                                verticalAlign="bottom"
                                iconType="plainline"
                                wrapperStyle={{ fontSize: '10px', cursor: 'pointer' }}
                                onClick={handleLegendClick}
                                formatter={(value, entry) => (
                                    <span style={{
                                        opacity: hiddenDates.has(entry.dataKey) ? 0.35 : 1,
                                        textDecoration: hiddenDates.has(entry.dataKey) ? 'line-through' : 'none'
                                    }}>
                                        {value}
                                    </span>
                                )}
                            />
                            {(hourly?.days || []).map((d, idx) => (
                                <Line
                                    key={d.date}
                                    type="monotone"
                                    dataKey={d.date}
                                    name={ecodeFormatDDMM(d.date) + (d.isToday ? ' (hôm nay)' : '')}
                                    stroke={d.isToday ? ECODE_ACCENT : ECODE_PALETTE[idx % ECODE_PALETTE.length]}
                                    strokeWidth={d.isToday ? 3 : 1.5}
                                    strokeOpacity={d.isToday ? 1 : 0.55}
                                    strokeDasharray={d.isToday ? undefined : '4 3'}
                                    dot={false}
                                    connectNulls={false}
                                    activeDot={{ r: 4 }}
                                    hide={hiddenDates.has(d.date)}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '8px 10px', fontSize: '0.68rem', color: '#9a3412', marginTop: '10px' }}>
                    <b>Lưu ý:</b> giờ hiện tại trở đi của hôm nay được ẩn để tránh nhiễu do một số điểm bán cấu hình sai giờ.
                </div>
            </div>

            {/* Heatmap + Monthly */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '12px', marginBottom: '1.5rem' }}>
                <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 6px rgba(0,0,0,.07)', padding: '16px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: '12px' }}>Heatmap: Giờ × Thứ trong tuần</div>
                    {loadingStatic && !heatmap ? (
                        <div style={{ color: '#9ca3af', fontSize: '0.8rem', textAlign: 'center', padding: '2rem' }}>Đang tải...</div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '40px repeat(24, 1fr)', gap: '2px', fontFamily: "'DM Mono', monospace" }}>
                            <div></div>
                            {Array.from({ length: 24 }, (_, h) => (
                                <div key={h} style={{ fontSize: '7px', color: '#9ca3af', textAlign: 'center', paddingBottom: '2px' }}>{h}</div>
                            ))}
                            {heatmapGrid.rows.map(row => (
                                <React.Fragment key={row.weekdayNo}>
                                    <div style={{ fontSize: '8px', color: '#6b7280', display: 'flex', alignItems: 'center', fontWeight: 500 }}>{row.weekdayName}</div>
                                    {row.hours.map((v, h) => {
                                        const t = heatmapGrid.max > 0 ? v / heatmapGrid.max : 0;
                                        const bg = `rgb(${Math.round(238 - (238 - 79) * t)}, ${Math.round(242 - (242 - 70) * t)}, ${Math.round(255 - (255 - 229) * t)})`;
                                        return (
                                            <div
                                                key={h}
                                                title={`${row.weekdayName} ${String(h).padStart(2, '0')}:00 · TB ${ecodeFormatInt(v)}`}
                                                style={{ aspectRatio: '1', borderRadius: '3px', background: bg }}
                                            />
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 6px rgba(0,0,0,.07)', padding: '16px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: '12px' }}>Coupon theo tháng</div>
                    <div style={{ height: '220px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={monthlyChartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} tickFormatter={v => `${v / 1000}k`} />
                                <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '11px' }} formatter={v => ecodeFormatInt(v) + ' coupon'} />
                                <Bar dataKey="totalUse" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Daily trend + moving average */}
            <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 6px rgba(0,0,0,.07)', padding: '16px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: '12px' }}>Tổng coupon/ngày + Trung bình trượt 7 ngày</div>
                <div style={{ height: '250px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={(dailyTrend || []).map(d => ({ label: ecodeFormatDDMM(d.date), dailyUse: d.dailyUse, movingAvg7: d.movingAvg7 }))} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} tickFormatter={v => `${v / 1000}k`} />
                            <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '11px' }} formatter={v => ecodeFormatInt(v)} />
                            <Legend verticalAlign="bottom" iconType="plainline" wrapperStyle={{ fontSize: '10px' }} />
                            <Line type="monotone" dataKey="dailyUse" name="Coupon/ngày" stroke={ECODE_ACCENT} strokeWidth={2} dot={{ r: 2 }} />
                            <Line type="monotone" dataKey="movingAvg7" name="TB trượt 7 ngày" stroke="#1f2937" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Ecode Check — Tra cứu nhanh tình trạng sử dụng 1 coupon theo ecode (server Ecode)
// ---------------------------------------------------------------------------

function EcodeCheckCopyButton({ row }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        const text = `Ecode: ${row.COUPON_CODE ?? ''} | Store: ${row.STORE ?? ''} | Ngày: ${row.NGAY_SU_DUNG ?? ''} | Check: ${row.SO_CHECK ?? ''} | ${row.GHI_CHU ?? ''}`;
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <button
            onClick={handleCopy}
            title="Copy dòng này"
            style={{
                border: 'none', background: copied ? '#dcfce7' : '#f3f4f6', color: copied ? '#16a34a' : '#374151',
                borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap'
            }}
        >
            {copied ? '✅ Đã copy' : '📋 Copy'}
        </button>
    );
}

const EcodeCheckDashboard = () => {
    const [ecode, setEcode] = useState('');
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleEcodeChange = (e) => {
        const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 13);
        setEcode(digitsOnly);
    };

    const handleSearch = useCallback(() => {
        if (!ecode) return;
        setLoading(true);
        setError(null);
        getEcodeCheck(ecode)
            .then(data => setResults(Array.isArray(data) ? data : []))
            .catch(err => {
                console.error('[EcodeCheckDashboard] lookup failed', err);
                setError(err.response?.data?.msg || err.message || 'Tra cứu thất bại');
                setResults(null);
            })
            .finally(() => setLoading(false));
    }, [ecode]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSearch();
    };

    return (
        <div style={{ padding: '1.5rem', background: '#f3f4f6', borderRadius: '12px' }}>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, marginBottom: '0.75rem' }}>
                Coupon Check — Tra cứu tình trạng sử dụng theo Ecode · Server CRM
            </div>

            <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 6px rgba(0,0,0,.07)', padding: '16px', marginBottom: '1.5rem', borderTop: `3px solid ${ECODE_ACCENT}` }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: '10px' }}>Nhập Ecode</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <input
                        type="text"
                        inputMode="numeric"
                        value={ecode}
                        onChange={handleEcodeChange}
                        onKeyDown={handleKeyDown}
                        maxLength={13}
                        placeholder="Nhập tối đa 13 chữ số"
                        style={{
                            flex: '1 1 240px', padding: '8px 12px', borderRadius: '7px', border: '1px solid #e5e7eb',
                            fontFamily: "'DM Mono', monospace", fontSize: '0.9rem'
                        }}
                    />
                    <button
                        onClick={handleSearch}
                        disabled={!ecode || loading}
                        style={{
                            border: 'none', borderRadius: '7px', padding: '8px 18px', fontWeight: 700, fontSize: '0.85rem',
                            color: '#fff', background: (!ecode || loading) ? '#d1d5db' : ECODE_ACCENT,
                            cursor: (!ecode || loading) ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {loading ? 'Đang tra cứu...' : 'Tra cứu'}
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', padding: '0.6rem 1rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
                    ⚠ {error}
                </div>
            )}

            {results && (
                results.length === 0 ? (
                    <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 6px rgba(0,0,0,.07)', padding: '2rem', textAlign: 'center', color: '#6b7280', fontSize: '0.85rem' }}>
                        Không có dữ liệu trả về.
                    </div>
                ) : (
                    <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 1px 6px rgba(0,0,0,.07)', overflowX: 'auto' }}>
                        <table style={{ minWidth: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead style={{ backgroundColor: '#f9fafb' }}>
                                <tr>
                                    {['STORE', 'NGAY_SU_DUNG', 'SO_CHECK', 'MA_CODE', 'COUPON_ID', 'COUPON_CODE', 'FLAGS', 'GHI_CHU', ''].map((col, i) => (
                                        <th key={col || `copy-${i}`} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                                            {col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((row, idx) => (
                                    <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{row.STORE ?? ''}</td>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{row.NGAY_SU_DUNG ?? ''}</td>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{row.SO_CHECK ?? ''}</td>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{row.MA_CODE ?? ''}</td>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{row.COUPON_ID ?? ''}</td>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', fontFamily: "'DM Mono', monospace" }}>{row.COUPON_CODE ?? ''}</td>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{row.FLAGS ?? ''}</td>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{row.GHI_CHU ?? ''}</td>
                                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
                                            <EcodeCheckCopyButton row={row} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            )}
        </div>
    );
};

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ReportViewer caught an error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '2rem', color: 'red' }}>
                    <h2>Something went wrong.</h2>
                    <details style={{ whiteSpace: 'pre-wrap' }}>
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </details>
                </div>
            );
        }

        return this.props.children;
    }
}

// Helper to format numbers with thousands separator
// Excel-like Filter Popover Component
const FilterPopover = ({ colKey, uniqueValues = [], currentFilter, onApply, onClose }) => {
    const [type, setType] = useState((currentFilter && currentFilter.type) || 'text');
    const [textVal, setTextVal] = useState((currentFilter && currentFilter.type === 'text' && currentFilter.value) || '');
    const [selectedValues, setSelectedValues] = useState((currentFilter && currentFilter.type === 'multi' && currentFilter.values) || []);
    const [numericOp, setNumericOp] = useState((currentFilter && currentFilter.type === 'numeric' && currentFilter.operator) || '>');
    const [numVal1, setNumVal1] = useState((currentFilter && currentFilter.type === 'numeric' && currentFilter.value) || '');
    const [numVal2, setNumVal2] = useState((currentFilter && currentFilter.type === 'numeric' && currentFilter.value2) || '');
    const [searchTerm, setSearchTerm] = useState('');

    const filteredUnique = uniqueValues.filter(v => String(v).toLowerCase().includes(searchTerm.toLowerCase()));

    const handleApply = () => {
        let filterObj = null;
        if (type === 'text' && textVal) {
            filterObj = { type: 'text', value: textVal };
        } else if (type === 'multi' && selectedValues.length > 0) {
            filterObj = { type: 'multi', values: selectedValues };
        } else if (type === 'numeric' && numVal1 !== '') {
            filterObj = { type: 'numeric', operator: numericOp, value: numVal1, value2: numVal2 };
        }
        onApply(colKey, filterObj);
        onClose();
    };

    const handleClear = () => {
        onApply(colKey, null);
        onClose();
    };

    const toggleValue = (val) => {
        setSelectedValues(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
    };

    return (
        <div style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 1000,
            backgroundColor: 'white', border: '1px solid #d1d5db', borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            width: '240px', padding: '1rem', marginTop: '0.25rem', textAlign: 'left',
            textTransform: 'none', fontWeight: 'normal'
        }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '0.5rem' }}>
                <button onClick={() => setType('text')} style={{ flex: 1, fontSize: '0.75rem', padding: '0.25rem', backgroundColor: type === 'text' ? '#eef2ff' : 'transparent', border: '1px solid #e5e7eb', borderRadius: '4px', color: type === 'text' ? '#4f46e5' : '#4b5563', cursor: 'pointer' }}>Text</button>
                <button onClick={() => setType('multi')} style={{ flex: 1, fontSize: '0.75rem', padding: '0.25rem', backgroundColor: type === 'multi' ? '#eef2ff' : 'transparent', border: '1px solid #e5e7eb', borderRadius: '4px', color: type === 'multi' ? '#4f46e5' : '#4b5563', cursor: 'pointer' }}>Select</button>
                <button onClick={() => setType('numeric')} style={{ flex: 1, fontSize: '0.75rem', padding: '0.25rem', backgroundColor: type === 'numeric' ? '#eef2ff' : 'transparent', border: '1px solid #e5e7eb', borderRadius: '4px', color: type === 'numeric' ? '#4f46e5' : '#4b5563', cursor: 'pointer' }}>Num</button>
            </div>

            {type === 'text' && (
                <div>
                    <input type="text" placeholder="Search text..." value={textVal} onChange={(e) => setTextVal(e.target.value)} style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', border: '1px solid #d1d5db', borderRadius: '4px', marginBottom: '1rem' }} />
                </div>
            )}

            {type === 'multi' && (
                <div>
                    <input type="text" placeholder="Search values..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', border: '1px solid #d1d5db', borderRadius: '4px', marginBottom: '0.5rem' }} />
                    <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #f3f4f6', padding: '0.25rem' }}>
                        {filteredUnique.length === 0 ? <div style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center' }}>No values</div> : (
                            filteredUnique.map(v => (
                                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem', fontSize: '0.875rem', cursor: 'pointer' }} className="hover:bg-gray-50">
                                    <input type="checkbox" checked={selectedValues.includes(v)} onChange={() => toggleValue(v)} />
                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v || '(Blank)'}</span>
                                </label>
                            ))
                        )}
                    </div>
                </div>
            )}

            {type === 'numeric' && (
                <div>
                    <select value={numericOp} onChange={(e) => setNumericOp(e.target.value)} style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', border: '1px solid #d1d5db', borderRadius: '4px', marginBottom: '0.5rem' }}>
                        <option value="=">Equals</option>
                        <option value=">">Greater than</option>
                        <option value="<">Less than</option>
                        <option value=">=">Greater or equal</option>
                        <option value="<=">Less or equal</option>
                        <option value="between">Between</option>
                    </select>
                    <input type="number" placeholder="Value..." value={numVal1} onChange={(e) => setNumVal1(e.target.value)} style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', border: '1px solid #d1d5db', borderRadius: '4px', marginBottom: '0.5rem' }} />
                    {numericOp === 'between' && (
                        <input type="number" placeholder="And..." value={numVal2} onChange={(e) => setNumVal2(e.target.value)} style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', border: '1px solid #d1d5db', borderRadius: '4px', marginBottom: '0.5rem' }} />
                    )}
                </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button onClick={handleClear} style={{ flex: 1, padding: '0.5rem', fontSize: '0.75rem', backgroundColor: 'white', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer' }}>Clear</button>
                <button onClick={handleApply} style={{ flex: 1, padding: '0.5rem', fontSize: '0.75rem', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Apply</button>
            </div>
        </div>
    );
};

const formatNumber = (num) => {
    if (num === null || num === undefined || num === '') return '';
    const n = Number(num);
    if (isNaN(n)) return num;
    // Attempt to detect if it's an integer-like float (close to integer) or large number
    // Requirement: No decimals
    return Math.round(n).toLocaleString('en-US');
};

const ReportViewerContent = ({ reportMeta }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [params, setParams] = useState({});
    const [extraData, setExtraData] = useState({});
    const isDashboard = reportMeta?.isDashboard;

    // Dynamic Options State: {paramName: [ {label, value} ] }
    const [dynamicOptions, setDynamicOptions] = useState({});

    // Advanced Table States
    const [totalRecords, setTotalRecords] = useState(0);
    const [isServerSide, setIsServerSide] = useState(false);

    // Advanced Table States
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);
    const [sortConfig, setSortConfig] = useState(null); // {key, direction: 'asc' | 'desc' }
    const [filters, setFilters] = useState({}); // {colKey: 'value' }
    const [tempFilters, setTempFilters] = useState({}); // Temporary filter values before applying
    const [showFilters, setShowFilters] = useState(false); // Toggle for column filters
    const [reportColumns, setReportColumns] = useState([]); // Store server-provided columns


    // Grouping State
    const [groupBy, setGroupBy] = useState([]); // Array of column keys
    const [expandedGroups, setExpandedGroups] = useState({}); // {groupKeyString: boolean }
    const [showGrouping, setShowGrouping] = useState(false); // Toggle for grouping zone
    const [showParams, setShowParams] = useState(false); // Toggle for parameters section
    const [exporting, setExporting] = useState(false); // Export loading state

    // Excel-like Filter States
    const [activePopover, setActivePopover] = useState(null); // column key
    const [uniqueValuesMap, setUniqueValuesMap] = useState({}); // {colKey: [uniqueValues] }

    // ...



    // Helper to format params for API (e.g., join arrays)
    const formatParamsForApi = (currentParams, meta) => {
        const apiParams = { ...currentParams };
        if (meta && meta.parameters) {
            meta.parameters.forEach(p => {
                if (p.type === 'checkbox-list' && Array.isArray(apiParams[p.name])) {
                    apiParams[p.name] = apiParams[p.name].join(',');
                }
            });
        }
        return apiParams;
    };

    // Reset state when report changes
    useEffect(() => {
        if (reportMeta) {
            const initialParams = {};
            // Initialize params and fetch dynamic options
            if (reportMeta.parameters) {
                reportMeta.parameters.forEach(p => {
                    initialParams[p.name] = p.defaultValue !== undefined ? p.defaultValue : '';

                    // Fetch dynamic options if sourceUrl exists
                    if (p.sourceUrl) {
                        // Use configured api instance which has baseURL setup
                        api.get(p.sourceUrl)
                            .then(res => {
                                setDynamicOptions(prev => ({
                                    ...prev,
                                    [p.name]: res.data
                                }));
                            })
                            .catch(err => console.error(`Failed to fetch options for ${p.name}`, err));
                    }
                });
            }
            setParams(initialParams);

            // Reset table state
            setCurrentPage(1);
            setSortConfig(null);
            setFilters({});
            setTempFilters({});
            setShowFilters(false);
            setGroupBy([]);
            setExpandedGroups({});
            setShowGrouping(false); // Reset grouping UI
            setData([]); // Clear old data immediately
            setIsServerSide(false);
            setTotalRecords(0);
            setUniqueValuesMap({});
            setActivePopover(null);

            // Auto-fetch if not waiting for user input?
            // Usually reports with date ranges should auto-fetch on load? Yes.
            const apiParams = formatParamsForApi(initialParams, reportMeta);

            setLoading(true);
            setError(null);
            getReportDetails(reportMeta.id, apiParams)
                .then((response) => {
                    handleResponse(response);
                })
                .catch((err) => {
                    console.error(err);
                    setError('Failed to load report data');
                    setLoading(false);
                });
        }
    }, [reportMeta]);

    const handleResponse = (response) => {
        console.log('[DEBUG] handleResponse received keys:', Object.keys(response || {}));
        console.log('[DEBUG] summary exists in response?', !!(response && response.summary));
        if (Array.isArray(response)) {
            // Legacy/Client-Side
            const validData = response.filter(item => item !== null && item !== undefined);
            setData(validData);
            setIsServerSide(false);
            setTotalRecords(validData.length);
            setReportColumns([]);
        } else if (response && response.data && typeof response.total === 'number') {
            // Server-Side
            const rawData = Array.isArray(response.data) ? response.data : [];
            const validData = rawData.filter(item => item !== null && item !== undefined);
            setData(validData);
            setIsServerSide(true);
            setTotalRecords(response.total);

            // Store dashboard-specific extra data
            setExtraData({
                kpis: response.kpis,
                slaDistribution: response.slaDistribution,
                topWorst: response.topWorst,
                summary: response.summary
            });

            if (response.columns && Array.isArray(response.columns)) {
                setReportColumns(response.columns);
            }

            // Refresh unique values: use server-provided map or calculate from current visible data
            if (response.uniqueValues && typeof response.uniqueValues === 'object') {
                setUniqueValuesMap(response.uniqueValues);
            } else if (validData.length > 0) {
                const newMap = {};
                const firstRow = validData[0].data || validData[0];
                const keys = Object.keys(firstRow);

                keys.forEach(key => {
                    const values = validData.map(item => {
                        const actual = item.data || item;
                        return String(actual[key] || '');
                    });
                    newMap[key] = [...new Set(values)].sort();
                });
                setUniqueValuesMap(newMap);
            }
        } else {
            // Fallback (e.g. mock data object without array?)
            setData([]);
            setTotalRecords(0);
            setIsServerSide(false);
            console.warn("Unexpected data format", response);
        }
        setLoading(false);
    };

    const fetchData = (pageOverride = null) => {
        if (!reportMeta) return;
        setLoading(true);
        setError(null);

        // Prepare params
        const apiParams = formatParamsForApi(params, reportMeta);

        // Add server-side params if we suspect or know it's server-side
        // Note: For initial fetch, we send them anyway. The backend ignores if not used.
        const pageToFetch = pageOverride || currentPage;

        apiParams.page = pageToFetch;
        apiParams.pageSize = itemsPerPage;
        if (sortConfig) {
            apiParams.sortBy = sortConfig.key;
            apiParams.sortOrder = sortConfig.direction;
        }
        if (filters && Object.keys(filters).length > 0) {
            apiParams.filters = filters;
        }
        if (groupBy.length > 0) {
            apiParams.groupBy = groupBy;
            apiParams.expandedGroups = expandedGroups;
        }

        getReportDetails(reportMeta.id, apiParams)
            .then((response) => {
                handleResponse(response);
                if (pageOverride) setCurrentPage(pageOverride);
            })
            .catch((err) => {
                console.error(err);
                setError('Failed to load report data');
                setLoading(false);
            });
    };

    // Trigger Fetch on Server-Side Params Change
    useEffect(() => {
        if (isServerSide && !loading) {
            fetchData();
        }
    }, [currentPage, itemsPerPage, sortConfig, filters, expandedGroups, groupBy]);

    // Debounce filters: update 'filters' from 'tempFilters' after typing stops
    useEffect(() => {
        const timer = setTimeout(() => {
            setFilters(tempFilters);
        }, 500); // 500ms debounce
        return () => clearTimeout(timer);
    }, [tempFilters]);


    const handleParamChange = (name, value, type) => {
        if (type === 'checkbox-list') {
            // For checkbox list, value is the option value being toggled
            setParams(prev => {
                const currentValues = Array.isArray(prev[name]) ? prev[name] : [];
                if (currentValues.includes(value)) {
                    return { ...prev, [name]: currentValues.filter(v => v !== value) };
                } else {
                    return { ...prev, [name]: [...currentValues, value] };
                }
            });
        } else if (type === 'checkbox') {
            // Single boolean checkbox
            setParams(prev => ({ ...prev, [name]: !prev[name] }));
        } else {
            setParams(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSelectAll = (name, allValues) => {
        console.log(`[ReportViewer] Select All for ${name}`, allValues);
        setParams(prev => ({
            ...prev,
            [name]: allValues
        }));
    };

    const handleUnselectAll = (name) => {
        console.log(`[ReportViewer] Clear for ${name}`);
        setParams(prev => ({
            ...prev,
            [name]: []
        }));
    };

    const handleParamKeyDown = (e) => {
        if (e.key === 'Enter') {
            fetchData(1);
        }
    };

    // --- Export Logic ---
    const handleExport = async () => {
        if (!reportMeta || exporting) return;
        setExporting(true);

        try {
            let dataToExport = [];

            if (isServerSide) {
                // Fetch ALL data from backend for full export
                const apiParams = formatParamsForApi(params, reportMeta);
                apiParams.page = 1;
                apiParams.pageSize = 1000000; // Request a large number to ensure all data is fetched

                if (sortConfig) {
                    apiParams.sortBy = sortConfig.key;
                    apiParams.sortOrder = sortConfig.direction;
                }

                // Add the current filters used for the fetch
                if (filters && Object.keys(filters).length > 0) {
                    apiParams.filters = filters;
                }

                console.log(`[Export] Fetching full dataset for ${reportMeta.name}`);
                const response = await getReportDetails(reportMeta.id, apiParams);

                if (Array.isArray(response)) {
                    dataToExport = response;
                } else if (response && response.data) {
                    dataToExport = response.data;
                }
            } else {
                // Client-side report: processedData contains all filtered/sorted rows
                dataToExport = processedData;
            }

            if (!dataToExport || dataToExport.length === 0) {
                alert("No data to export");
                setExporting(false);
                return;
            }

            const now = new Date();
            const year = now.getFullYear();
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const month = monthNames[now.getMonth()];
            const day = String(now.getDate()).padStart(2, '0');
            const dateStr = `${year}.${month}.${day}`;
            const fileName = `${reportMeta.name} (Full Export ${dateStr}).xlsx`;

            // Unwrap internal Format {type: 'data', data: {... } }
            const finalData = dataToExport.map(item => {
                if (item && typeof item === 'object' && 'data' in item && (item.type === 'data' || item.type === undefined)) {
                    return item.data;
                }
                return item;
            });

            const ws = XLSX.utils.json_to_sheet(finalData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Report");
            XLSX.writeFile(wb, fileName);

        } catch (err) {
            console.error("Export failed:", err);
            alert("Export failed. Check console for details.");
        } finally {
            setExporting(false);
        }
    };

    // --- Table Logic ---

    // 1. Filter - Debounced
    const handleTempFilterChange = (key, value) => {
        setTempFilters(prev => ({
            ...prev,
            [key]: value
        }));
        // Always reset to page 1 when filtering, to support client-side filtering on current page
        setCurrentPage(1);
    };

    const applyFilters = useCallback(() => {
        setFilters(tempFilters);
        setCurrentPage(1); // Reset to page 1
        // Effect will trigger fetch if server-side
    }, [tempFilters]);

    const handleFilterKeyDown = (e) => {
        if (e.key === 'Enter') {
            applyFilters();
        }
    };

    // Auto-apply filters after user stops typing (500ms debounce)
    // Only for server-side reports - client-side uses tempFilters directly
    // Auto-apply filters logic removed to prevent API calls while typing.
    // User can press Enter to trigger server-side search if needed.
    /*
    useEffect(() => {
        if (!isServerSide) return; // Skip for client-side reports
    
        const timer = setTimeout(() => {
            if (JSON.stringify(tempFilters) !== JSON.stringify(filters)) {
                        applyFilters();
            }
        }, 500);
    
        return () => clearTimeout(timer);
    }, [tempFilters, filters, applyFilters, isServerSide]);
                    */

    // 2. Sort
    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
        // Effect will trigger fetch if server-side
    };

    // 3. Grouping Handlers
    const handleDragStart = (e, key) => {
        if (!showGrouping) return;
        e.dataTransfer.setData("key", key);
    };

    const handleDragOver = (e) => {
        if (!showGrouping) return;
        e.preventDefault();
    };

    const handleDrop = (e) => {
        if (!showGrouping) return;
        const key = e.dataTransfer.getData("key");
        if (key && !groupBy.includes(key)) {
            setGroupBy(prev => [...prev, key]);
            setCurrentPage(1);
        }
    };

    const removeGroup = (key) => {
        setGroupBy(prev => prev.filter(k => k !== key));
        setCurrentPage(1);
    };

    const toggleGroup = (groupKey) => {
        setExpandedGroups(prev => {
            const newState = {
                ...prev,
                [groupKey]: !prev[groupKey]
            };
            return newState;
        });
        // We need to trigger fetch, but newState above is inside callback.
        // Better to use Effect or separate state update + fetch? 
        // Or wait for effect? 
        // Effect [expandedGroups] can trigger fetch if isServerSide?
        // Let's add expandedGroups to the effect dependency list.
    };

    // --- Data Processing Pipeline ---
    const processedData = useMemo(() => {
        // We now allow client-side processing (filtering) even for server-side data (current page filtering)
        // if (isServerSide) { return data; } 

        // Client-Side Logic
        let processed = [...data];

        // A. Filtering
        const activeFilters = tempFilters;
        if (activeFilters && Object.keys(activeFilters).length > 0) {
            Object.keys(activeFilters).forEach(key => {
                const filter = activeFilters[key];
                if (!filter) return;

                if (typeof filter === 'string') {
                    const val = filter.toLowerCase().trim();
                    if (val) {
                        processed = processed.filter(item => {
                            const actualItem = item.data || item;
                            return String(actualItem[key] || '').toLowerCase().includes(val);
                        });
                    }
                } else if (typeof filter === 'object') {
                    const { type, operator, value, value2, values } = filter;
                    processed = processed.filter(item => {
                        const actualItem = item.data || item;
                        const itemValRaw = actualItem[key];

                        if (type === 'multi' && Array.isArray(values)) {
                            return values.includes(String(itemValRaw || ''));
                        } else if (type === 'numeric' && operator) {
                            const itemNum = parseFloat(itemValRaw);
                            const t1 = parseFloat(value);
                            const t2 = parseFloat(value2);
                            if (isNaN(itemNum)) return false;
                            switch (operator) {
                                case '=': return itemNum === t1;
                                case '>': return itemNum > t1;
                                case '<': return itemNum < t1;
                                case '>=': return itemNum >= t1;
                                case '<=': return itemNum <= t1;
                                case 'between': return itemNum >= t1 && itemNum <= t2;
                                default: return true;
                            }
                        } else if (type === 'text' && value) {
                            return String(itemValRaw || '').toLowerCase().includes(String(value).toLowerCase());
                        }
                        return true;
                    });
                }
            });
        }

        // B. Sorting
        if (groupBy.length > 0) {
            processed.sort((a, b) => {
                for (let groupKey of groupBy) {
                    const valA = a[groupKey] || '';
                    const valB = b[groupKey] || '';
                    if (valA < valB) return -1;
                    if (valA > valB) return 1;
                }
                if (sortConfig) {
                    const valA = a[sortConfig.key];
                    const valB = b[sortConfig.key];
                    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        } else if (sortConfig) {
            processed.sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];
                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return processed;
    }, [data, filters, tempFilters, sortConfig, groupBy, isServerSide]);

    // Flatten logic
    // Flatten logic
    // Flatten logic
    const displayedRows = useMemo(() => {
        // Warning: 'processedData' contains the filtered data (wrapper aware)
        if (isServerSide) {
            // Normalize server-side data: Ensure everything is wrapped in {type: 'data', data: ... } or is a group
            // Use processedData (which is filtered) instead of raw data
            return (processedData || []).map(item => {
                if (!item) return { type: 'data', data: {} }; // Safety
                if (item.type === 'group') return item;
                if (item.type === 'data') return item;
                // It's a raw data row
                return { type: 'data', data: item };
            });
        }

        // Client-Side Grouping Logic
        if (groupBy.length === 0) {
            return processedData.map(item => ({ type: 'data', data: item }));
        }

        const buildTree = (items, depth = 0) => {
            // ... existing client side buildTree ...
            if (depth >= groupBy.length) return items;
            const key = groupBy[depth];
            const groups = {};
            items.forEach(item => {
                const groupVal = String(item[key]);
                if (!groups[groupVal]) groups[groupVal] = [];
                groups[groupVal].push(item);
            });
            const result = [];
            Object.keys(groups || {}).forEach(groupVal => {
                const groupItems = groups[groupVal];
                const firstItem = groupItems && groupItems.length > 0 ? groupItems[0] : null;
                const fullGroupKey = groupBy.slice(0, depth + 1).map(k => String((firstItem || {})[k])).join('::');

                const children = buildTree(groupItems, depth + 1);
                const aggregates = {}; // ... calc aggregates ...
                if (firstItem) {
                    Object.keys(firstItem || {}).forEach(colKey => {
                        const isNumeric = groupItems.every(item => {
                            const val = item[colKey];
                            return !isNaN(parseFloat(val)) && isFinite(val);
                        });
                        if (isNumeric) {
                            const sum = groupItems.reduce((acc, curr) => {
                                const val = parseFloat(curr[colKey]);
                                return acc + (isNaN(val) ? 0 : val);
                            }, 0);
                            aggregates[colKey] = sum;
                        }
                    });
                }
                result.push({
                    type: 'group',
                    key: key,
                    value: groupVal,
                    depth: depth,
                    count: groupItems.length,
                    id: fullGroupKey,
                    children: children,
                    aggregates: aggregates
                });
            });
            return result;
        };

        const tree = buildTree(processedData);

        const flatten = (nodes) => {
            // ... existing client side flatten ...
            let list = [];
            nodes.forEach(node => {
                if (node.type === 'group') {
                    const expanded = !!expandedGroups[node.id];
                    list.push({ ...node, isExpanded: expanded });
                    if (expanded) {
                        list = list.concat(flatten(node.children));
                    }
                } else {
                    list.push({ type: 'data', data: node });
                }
            });
            return list;
        };

        return flatten(tree);

    }, [processedData, groupBy, expandedGroups, isServerSide, data]);

    // 4. Pagination
    // 4. Pagination
    // If server-side, displayedRows IS the page.
    const totalPages = isServerSide
        ? Math.ceil(totalRecords / itemsPerPage)
        : Math.ceil(displayedRows.length / itemsPerPage);

    const paginatedDisplayedRows = isServerSide
        ? displayedRows // For server-side, displayedRows is already the page slice (from data)
        : displayedRows.slice(
            (currentPage - 1) * itemsPerPage,
            currentPage * itemsPerPage
        );

    if (!reportMeta) {
        return (
            <div className="report-card" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <p>Select a report from the sidebar to view details</p>
            </div>
        );
    }

    // Determine columns from the first 'data' item we can find
    let sampleItem = null;
    if (data.length > 0) {
        const first = data[0];
        if (first.type === 'data') sampleItem = first.data;
        else if (first.type === 'group') {
            // If first is group, trying to find a data item is hard without traversing.
            // But usually if grouped, we might default to empty or wait for expansion?
            // Or we just check if it has 'data' prop?
            // Actually, simplest is to check if it's NOT a group wrapper?
            // If raw data: keys are columns.
            // If wrapped data: keys are in .data.
            // If group: no columns?

            // Let's rely on displayedRows?
            const firstRow = displayedRows.find(r => r.type === 'data');
            if (firstRow) sampleItem = firstRow.data;
        } else {
            // Raw item
            sampleItem = first;
        }
    }
    const baseColumns = (reportColumns.length > 0 ? reportColumns : (sampleItem ? Object.keys(sampleItem) : []))
        .filter(key => !['SOURCE_SQL_EXISTS', 'SOURCE_PG_EXISTS', 'MidservUid', 'PG_MIDSERVER_ID', 'RESTAURANT_ID', 'midserverid', 'restaurantid'].includes(key));
    const columns = (reportMeta.id === 'online_compare') ? ['RowNumber', ...baseColumns] : baseColumns;

    return (
        <div>
            <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>{reportMeta.name}</h1>
                    <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>{reportMeta.description}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        onClick={() => setShowParams(!showParams)}
                        style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: showParams ? '#eef2ff' : 'white',
                            color: showParams ? '#4f46e5' : '#4b5563',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        <span>{showParams ? '−' : '+'}</span> Filters
                    </button>

                    <button
                        onClick={() => setShowGrouping(!showGrouping)}
                        style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: showGrouping ? '#eef2ff' : 'white',
                            color: showGrouping ? '#4f46e5' : '#4b5563',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        <span>🗂</span> Group Data
                    </button>

                    <button
                        onClick={handleExport}
                        disabled={exporting}
                        style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: exporting ? '#9ca3af' : '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: exporting ? 'not-allowed' : 'pointer',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'background-color 0.2s'
                        }}
                    >
                        <span>{exporting ? '⌛' : '📥'}</span>
                        {exporting ? 'Generating...' : 'Export Excel'}
                    </button>
                </div>
            </div>

            {/* Parameters Section */}
            {/* Parameters Section */}
            {/* Parameters Section */}
            {/* Parameters Section */}
            {showParams && ((reportMeta.parameters && reportMeta.parameters.length > 0) || reportMeta.id === 'compare_masterdata') && (
                <div style={{
                    marginBottom: '1.5rem',
                    padding: '1.5rem',
                    backgroundColor: '#fff',
                    borderRadius: '12px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.5rem'
                }}>
                    {reportMeta.id === 'compare_masterdata' && (
                        <div style={{ padding: '0.5rem', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.9rem', color: '#6b7280', fontWeight: 500 }}>
                                Masterdata Control Center
                            </span>
                            <button
                                onClick={() => fetchData(1)}
                                style={{
                                    padding: '0.5rem 1.25rem',
                                    backgroundColor: '#4f46e5',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: '0.875rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                <span>↻</span> Refresh Data
                            </button>
                        </div>
                    )}

                    {reportMeta.parameters && reportMeta.parameters.length > 0 && (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: '1.5rem',
                            alignItems: 'start'
                        }}>
                            {reportMeta.parameters.map(param => {
                                const options = (dynamicOptions[param.name] || param.options || []);
                                return (
                                    <div key={param.name} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        <label style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            {param.label || param.name}
                                            {param.type === 'checkbox-list' && options.length > 0 && (
                                                <div style={{ fontSize: '0.75rem', fontWeight: 500 }}>
                                                    <span
                                                        onClick={() => handleSelectAll(param.name, options.map(o => o.value))}
                                                        style={{ color: '#4f46e5', cursor: 'pointer', marginRight: '0.75rem' }}>
                                                        Select All
                                                    </span>
                                                    <span
                                                        onClick={() => handleUnselectAll(param.name)}
                                                        style={{ color: '#ef4444', cursor: 'pointer' }}>
                                                        Clear
                                                    </span>
                                                </div>
                                            )}
                                        </label>

                                        {param.type === 'checkbox-list' ? (
                                            <div style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.5rem',
                                                height: '180px',
                                                overflowY: 'auto',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: '8px',
                                                padding: '0.75rem',
                                                backgroundColor: '#f9fafb'
                                            }}>
                                                {options.map(opt => (
                                                    <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.875rem', cursor: 'pointer', padding: '2px 0' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={(params[param.name] || []).includes(opt.value)}
                                                            onChange={() => handleParamChange(param.name, opt.value, 'checkbox-list')}
                                                            style={{ width: '16px', height: '16px', accentColor: '#4f46e5', cursor: 'pointer' }}
                                                        />
                                                        <span style={{ color: '#4b5563' }}>{opt.label}</span>
                                                    </label>
                                                ))}
                                                {!options.length && (
                                                    <span style={{ fontSize: '0.8rem', color: '#6b7280', padding: '0.25rem' }}>No options available</span>
                                                )}
                                            </div>
                                        ) : param.type === 'checkbox' ? (
                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={!!params[param.name]}
                                                    onChange={() => handleParamChange(param.name, null, 'checkbox')}
                                                    style={{ width: '20px', height: '20px', accentColor: '#4f46e5', cursor: 'pointer' }}
                                                />
                                            </div>
                                        ) : (
                                            <input
                                                type={param.type || 'text'}
                                                value={params[param.name] || ''}
                                                onChange={(e) => handleParamChange(param.name, e.target.value, param.type)}
                                                onKeyDown={handleParamKeyDown}
                                                style={{
                                                    padding: '0.6rem',
                                                    borderRadius: '6px',
                                                    border: '1px solid #d1d5db',
                                                    width: '100%',
                                                    fontSize: '0.9rem',
                                                    outline: 'none',
                                                    transition: 'border-color 0.2s'
                                                }}
                                                onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                                                onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {reportMeta.parameters && reportMeta.parameters.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid #f3f4f6' }}>
                            <button
                                onClick={() => fetchData(1)}
                                style={{
                                    padding: '0.75rem 2.5rem',
                                    backgroundColor: '#4f46e5',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: '0.95rem',
                                    boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)',
                                    transition: 'all 0.2s'
                                }}
                                onMouseOver={(e) => e.target.style.backgroundColor = '#4338ca'}
                                onMouseOut={(e) => e.target.style.backgroundColor = '#4f46e5'}
                            >
                                Apply Filter
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Drop Zone for Grouping */}
            {showGrouping && (
                <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    style={{
                        padding: '1rem',
                        marginBottom: '1rem',
                        border: '2px dashed #4f46e5',
                        borderRadius: '8px',
                        backgroundColor: '#eef2ff',
                        minHeight: '50px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                        transition: 'all 0.2s ease'
                    }}
                >
                    {groupBy.length === 0 ? (
                        <span style={{ color: '#4338ca', fontStyle: 'italic', fontSize: '0.875rem', fontWeight: 500 }}>
                            Drag a column header here to group by that column
                        </span>
                    ) : (
                        groupBy.map((key) => (
                            <div key={key} style={{
                                display: 'flex',
                                alignItems: 'center',
                                backgroundColor: 'white',
                                color: '#4338ca',
                                padding: '0.25rem 0.75rem',
                                borderRadius: '16px',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                border: '1px solid #c7d2fe'
                            }}>
                                <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                                <button
                                    onClick={() => removeGroup(key)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        marginLeft: '0.5rem',
                                        cursor: 'pointer',
                                        color: '#4338ca',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}

            <div className="report-card">
                {loading ? (
                    <div className="loading">Loading...</div>
                ) : error ? (
                    <div style={{ color: 'red' }}>{error}</div>
                ) : (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
                            {reportMeta.id !== 'general_online_sales' && (
                                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                    Showing {isServerSide ? `${(currentPage - 1) * itemsPerPage + 1}-${Math.min(currentPage * itemsPerPage, totalRecords)} of ${totalRecords}` : processedData.length} records {groupBy.length > 0 && `(Grouped by: ${groupBy.join(', ')})`}
                                </div>
                            )}

                            {reportMeta.id !== 'general_online_sales' && (
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <button
                                        onClick={() => setShowFilters(!showFilters)}
                                        style={{
                                            background: 'none',
                                            border: '1px solid #d1d5db',
                                            borderRadius: '4px',
                                            padding: '0.25rem 0.5rem',
                                            cursor: 'pointer',
                                            color: showFilters ? '#4f46e5' : '#6b7280',
                                            backgroundColor: showFilters ? '#eef2ff' : 'white'
                                        }}
                                        title="Toggle Column Filters"
                                    >
                                        🔍 Filter
                                    </button>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <label style={{ fontSize: '0.875rem' }}>Rows per page:</label>
                                        <select
                                            value={itemsPerPage}
                                            onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                                            style={{ padding: '0.25rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
                                        >
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ overflowX: 'auto', border: isDashboard ? 'none' : '1px solid #e5e7eb', borderRadius: '8px' }}>
                            {isDashboard ? (
                                reportMeta.id === 'latency_by_location' ? (
                                    <LocationDashboard data={data} params={params} extraData={extraData} />
                                ) : reportMeta.id === 'sales_analyze' ? (
                                    <SalesAnalyzeDashboard
                                        summary={extraData?.summary}
                                        loading={loading}
                                        onRefresh={() => fetchData(1)}
                                    />
                                ) : reportMeta.id === 'online_sales_revenue_snapshot' ? (
                                    <OnlineSalesRevenueSnapshotDashboard
                                        data={data}
                                        loading={loading}
                                        params={params}
                                        onRefresh={() => fetchData(1)}
                                    />
                                ) : reportMeta.id === 'general_online_sales' ? (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <OnlineSalesDashboard
                                            summary={extraData?.summary}
                                            loading={loading}
                                            onRefresh={() => fetchData(1)}
                                        />
                                    </div>
                                ) : reportMeta.id === 'ecode_using' ? (
                                    <EcodeUsingDashboard />
                                ) : reportMeta.id === 'ecode_check' ? (
                                    <EcodeCheckDashboard />
                                ) : (
                                    <LatencyDashboard data={data} params={params} />
                                )
                            ) : data.length > 0 ? (
                                <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
                                    <thead style={{ backgroundColor: '#f9fafb' }}>
                                        <tr>
                                            {columns.map((key) => (
                                                <th
                                                    key={key}
                                                    draggable={showGrouping}
                                                    onDragStart={(e) => handleDragStart(e, key)}
                                                    style={{
                                                        padding: '0.75rem',
                                                        position: (reportMeta?.id === 'compare_masterdata' && (key === 'CollectionID' || key === 'CollectionName')) ? 'sticky' : 'relative',
                                                        left: (reportMeta?.id === 'compare_masterdata' && (key === 'CollectionID' || key === 'CollectionName')) ? (key === 'CollectionID' ? 0 : '150px') : 'auto',
                                                        zIndex: (reportMeta?.id === 'compare_masterdata' && (key === 'CollectionID' || key === 'CollectionName')) ? 2 : 'auto',
                                                        backgroundColor: (reportMeta?.id === 'compare_masterdata' && (key === 'CollectionID' || key === 'CollectionName')) ? '#f9fafb' : '#f9fafb',
                                                        minWidth: '150px',
                                                        cursor: showGrouping ? 'grab' : 'default',
                                                        borderRight: (reportMeta?.id === 'compare_masterdata' && key === 'CollectionName') ? '2px solid #e5e7eb' : 'none'
                                                    }}
                                                >
                                                    {/* Column Label + Filter Icon */}
                                                    <div
                                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                                    >
                                                        <div
                                                            onClick={() => handleSort(key)}
                                                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', flex: 1 }}
                                                        >
                                                            <span style={{ fontWeight: 600 }}>{key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')}</span>
                                                            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                                                {sortConfig?.key === key ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                                                            </span>
                                                        </div>

                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActivePopover(activePopover === key ? null : key);
                                                            }}
                                                            style={{
                                                                background: filters[key] ? '#eef2ff' : 'transparent',
                                                                border: 'none',
                                                                borderRadius: '4px',
                                                                padding: '2px 4px',
                                                                cursor: 'pointer',
                                                                color: filters[key] ? '#4f46e5' : '#9ca3af'
                                                            }}
                                                            title="Filter"
                                                        >
                                                            <span style={{ fontSize: '0.875rem' }}>{filters[key] ? '⦿' : '▽'}</span>
                                                        </button>
                                                    </div>

                                                    {/* Filter Popover */}
                                                    {activePopover === key && (
                                                        <FilterPopover
                                                            colKey={key}
                                                            uniqueValues={uniqueValuesMap[key] || []}
                                                            currentFilter={filters[key]}
                                                            onApply={(k, f) => {
                                                                setFilters(prev => {
                                                                    const newF = { ...prev };
                                                                    if (f) newF[k] = f;
                                                                    else delete newF[k];
                                                                    return newF;
                                                                });
                                                                setTempFilters(prev => {
                                                                    const newF = { ...prev };
                                                                    if (f) newF[k] = f;
                                                                    else delete newF[k];
                                                                    return newF;
                                                                });
                                                            }}
                                                            onClose={() => setActivePopover(null)}
                                                        />
                                                    )}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedDisplayedRows.map((rowItem, index) => {
                                            if (rowItem.type === 'group') {
                                                return (
                                                    <tr key={`group-${rowItem.id}`} onClick={() => toggleGroup(rowItem.id)} style={{ cursor: 'pointer', backgroundColor: '#eff6ff', fontWeight: 600 }}>
                                                        {columns.map((col, idx) => {
                                                            if (idx === 0) {
                                                                return (
                                                                    <td key={idx} style={{ padding: '0.75rem', paddingLeft: `${rowItem.depth * 20 + 12}px` }}>
                                                                        <span style={{ color: '#6b7280', fontSize: '0.75rem', marginRight: '8px' }}>
                                                                            {(currentPage - 1) * itemsPerPage + index + 1}
                                                                        </span>
                                                                        <span>{rowItem.isExpanded ? '▼' : '►'} </span>
                                                                        {rowItem.key}: {rowItem.value} ({rowItem.count})
                                                                    </td>
                                                                );
                                                            } else {
                                                                // Show aggregate if available
                                                                const val = rowItem.aggregates && rowItem.aggregates[col];
                                                                return (
                                                                    <td key={idx} style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                                                                        {val !== undefined ? formatNumber(val) : ''}
                                                                    </td>
                                                                );
                                                            }
                                                        })}
                                                    </tr>
                                                );
                                            } else {
                                                const rowData = rowItem.data;
                                                return (
                                                    <tr key={`data-${index}`} style={{ borderBottom: '1px solid #e5e7eb', transition: 'background-color 0.2s' }} className="hover:bg-gray-50">
                                                        {columns.map((colKey, i) => {
                                                            let val = rowData[colKey];
                                                            const currentRowNumber = (currentPage - 1) * itemsPerPage + index + 1;
                                                            if (colKey === 'RowNumber') val = currentRowNumber;

                                                            let cellStyle = { padding: '0.75rem', fontSize: '0.875rem' };

                                                            // Online Data Compare Special Formatting
                                                            if (reportMeta.id === 'online_compare') {
                                                                if (colKey === 'RowNumber') {
                                                                    cellStyle.color = '#6b7280';
                                                                    cellStyle.fontSize = '0.75rem';
                                                                    cellStyle.textAlign = 'center';
                                                                }
                                                                // Color Coding for Differences
                                                                if (colKey === 'DIFF_CHECK' || colKey === 'DIFF_ORDER') {
                                                                    const numVal = parseFloat(val);
                                                                    if (numVal === 0) {
                                                                        cellStyle.color = '#10b981'; // Green
                                                                        cellStyle.fontWeight = '600';
                                                                    } else if (!isNaN(numVal)) {
                                                                        cellStyle.color = '#ef4444'; // Red
                                                                        cellStyle.fontWeight = '600';
                                                                    }
                                                                }

                                                                // Grey out missing sources
                                                                if (colKey.startsWith('SKY_') && rowData.SOURCE_SQL_EXISTS === false) {
                                                                    cellStyle.color = '#9ca3af';
                                                                    cellStyle.fontStyle = 'italic';
                                                                    cellStyle.backgroundColor = '#f9fafb';
                                                                }
                                                                if (colKey.startsWith('PG_') && rowData.SOURCE_PG_EXISTS === false) {
                                                                    cellStyle.color = '#9ca3af';
                                                                    cellStyle.fontStyle = 'italic';
                                                                    cellStyle.backgroundColor = '#f9fafb';
                                                                }

                                                                // Styling for COMPARE column
                                                                if (colKey === 'COMPARE') {
                                                                    if (val === 'Compared') {
                                                                        cellStyle.color = '#10b981'; // Green
                                                                        cellStyle.fontWeight = 'bold';
                                                                    } else if (val === 'No data SkyOnline') {
                                                                        cellStyle.color = '#ef4444'; // Red
                                                                        cellStyle.fontStyle = 'italic';
                                                                        cellStyle.fontWeight = '500';
                                                                    } else if (val === 'No data rkDtaFlow') {
                                                                        cellStyle.color = '#a855f7'; // Purple
                                                                        cellStyle.fontStyle = 'italic';
                                                                        cellStyle.fontWeight = '500';
                                                                    }
                                                                }
                                                            }

                                                            // Data Reconciliation Coloring
                                                            if (reportMeta.id === 'data_reconciliation') {
                                                                const suffix = colKey.replace(/^(MS|PG)_/, '');
                                                                const isCompareCol = ['checkcount', 'guestcount', 'prlistsum', 'discountsum', 'taxsumadded', 'paidsum'].some(k => k.toLowerCase() === suffix.toLowerCase());

                                                                if (isCompareCol) {
                                                                    const currentPrefix = colKey.substring(0, 3); // MS_ or PG_
                                                                    if (currentPrefix === 'MS_' || currentPrefix === 'PG_') {
                                                                        const partnerPrefix = currentPrefix === 'MS_' ? 'PG_' : 'MS_';
                                                                        const partnerKey = partnerPrefix + suffix;

                                                                        const val1 = rowData[colKey];
                                                                        const val2 = rowData[partnerKey];

                                                                        const n1 = parseFloat(val1);
                                                                        const n2 = parseFloat(val2);

                                                                        let isEqual = false;
                                                                        if (!isNaN(n1) && !isNaN(n2)) {
                                                                            isEqual = Math.abs(n1 - n2) < 0.01;
                                                                        } else {
                                                                            // Fallback for nulls or non-numeric
                                                                            isEqual = (val1 == val2) || (val1 === null && val2 === null);
                                                                        }

                                                                        if (isEqual) {
                                                                            cellStyle.color = '#10b981'; // Green Text
                                                                            cellStyle.fontWeight = '600';
                                                                        } else {
                                                                            cellStyle.color = '#ef4444'; // Red Text
                                                                            cellStyle.fontWeight = '600';
                                                                        }
                                                                    }
                                                                }
                                                            }

                                                            // Masterdata Comparison Styling
                                                            if (reportMeta.id === 'compare_masterdata') {
                                                                if (colKey.endsWith('_Status')) {
                                                                    if (val === 'OK') {
                                                                        cellStyle.color = '#10b981';
                                                                        cellStyle.fontWeight = '700';
                                                                    } else if (val === 'DIFF') {
                                                                        cellStyle.color = '#ef4444';
                                                                        cellStyle.fontWeight = '700';
                                                                        cellStyle.backgroundColor = '#fee2e2';
                                                                    }
                                                                }
                                                                if (colKey === 'CollectionID' || colKey === 'CollectionName') {
                                                                    cellStyle.fontWeight = '600';
                                                                    cellStyle.backgroundColor = '#f9fafb';
                                                                    cellStyle.position = 'sticky';
                                                                    cellStyle.left = colKey === 'CollectionID' ? 0 : '150px';
                                                                    cellStyle.zIndex = 1;
                                                                    if (colKey === 'CollectionName') {
                                                                        cellStyle.borderRight = '2px solid #e5e7eb';
                                                                    }
                                                                }
                                                                if (colKey === 'Ref_Version' || colKey === 'Ref_Count') {
                                                                    cellStyle.backgroundColor = '#f0f9ff';
                                                                    cellStyle.fontWeight = '600';
                                                                }
                                                            }

                                                            return (
                                                                <td key={colKey} style={cellStyle}>
                                                                    {/* Attempt to format if number */}
                                                                    {val === null || val === undefined ? (
                                                                        <span style={{ color: '#d1d5db' }}>—</span>
                                                                    ) : (
                                                                        !isNaN(parseFloat(val)) && isFinite(val) ? formatNumber(val) : val
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                );
                                            }
                                        })}
                                        {paginatedDisplayedRows.length === 0 && (
                                            <tr>
                                                <td colSpan={columns.length} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                                                    No records found.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            ) : (
                                <p style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>No data available for this report.</p>
                            )}
                        </div>

                        {/* Pagination Controls */}
                        {totalPages > 0 && !isDashboard && (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem', padding: '1rem 0', borderTop: '1px solid #f3f4f6' }}>
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    <button
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1}
                                        style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #d1d5db', borderRadius: '6px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', backgroundColor: 'white', color: '#4b5563' }}
                                        title="First Page"
                                    >
                                        «
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        style={{ padding: '0 0.75rem', height: '32px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', backgroundColor: 'white', color: '#4b5563', fontSize: '0.875rem' }}
                                    >
                                        Prev
                                    </button>
                                </div>

                                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                    {/* Page Numbers */}
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        let pageNum;
                                        if (totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if (currentPage <= 3) {
                                            pageNum = i + 1;
                                        } else if (currentPage >= totalPages - 2) {
                                            pageNum = totalPages - 4 + i;
                                        } else {
                                            pageNum = currentPage - 2 + i;
                                        }

                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => setCurrentPage(pageNum)}
                                                style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    border: '1px solid',
                                                    borderColor: currentPage === pageNum ? '#4f46e5' : '#d1d5db',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    backgroundColor: currentPage === pageNum ? '#4f46e5' : 'white',
                                                    color: currentPage === pageNum ? 'white' : '#4b5563',
                                                    fontWeight: currentPage === pageNum ? '600' : '400',
                                                    fontSize: '0.875rem',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                        style={{ padding: '0 0.75rem', height: '32px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', backgroundColor: 'white', color: '#4b5563', fontSize: '0.875rem' }}
                                    >
                                        Next
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={currentPage === totalPages}
                                        style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #d1d5db', borderRadius: '6px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', backgroundColor: 'white', color: '#4b5563' }}
                                        title="Last Page"
                                    >
                                        »
                                    </button>
                                </div>

                                <div style={{ height: '24px', width: '1px', backgroundColor: '#e5e7eb', margin: '0 0.5rem' }}></div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Jump to:</span>
                                    <select
                                        value={currentPage}
                                        onChange={(e) => setCurrentPage(Number(e.target.value))}
                                        style={{
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '6px',
                                            border: '1px solid #d1d5db',
                                            fontSize: '0.875rem',
                                            backgroundColor: 'white',
                                            cursor: 'pointer',
                                            outline: 'none'
                                        }}
                                    >
                                        {Array.from({ length: totalPages }, (_, i) => (
                                            <option key={i + 1} value={i + 1}>
                                                Page {i + 1}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

const ReportViewer = (props) => (
    <ErrorBoundary>
        <ReportViewerContent {...props} />
    </ErrorBoundary>
);

export default ReportViewer;
