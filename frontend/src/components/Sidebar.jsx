import React, { useState } from 'react';
import { APP_CONFIG } from '../config';

const Sidebar = ({ reports, selectedReportId, onSelectReport }) => {
    const [isPinned, setIsPinned] = useState(true);
    const [isHovered, setIsHovered] = useState(false);

    const isExpanded = isPinned || isHovered;

    return (
        <div
            className={`sidebar ${isExpanded ? 'expanded' : 'collapsed'}`}
            onMouseEnter={() => !isPinned && setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{ width: isExpanded ? '280px' : '60px' }}
        >
            <div className="sidebar-header" style={{ justifyContent: isExpanded ? 'space-between' : 'center', padding: isExpanded ? '1.5rem' : '1.5rem 0.5rem' }}>
                {isExpanded ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <img src={APP_CONFIG.logo} alt="Logo" style={{ width: '32px', height: '32px', borderRadius: '6px' }} />
                        <span style={{ fontWeight: 800, fontSize: '1.2rem', color: '#fff', letterSpacing: '-0.02em' }}>
                            {APP_CONFIG.title.split(' ')[0]}<span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 400 }}>{APP_CONFIG.title.split(' ')[1] || ''}</span>
                        </span>
                    </div>
                ) : (
                    <img src={APP_CONFIG.logo} alt="Logo" style={{ width: '32px', height: '32px', borderRadius: '6px' }} />
                )}

                {isExpanded && (
                    <button
                        onClick={() => setIsPinned(!isPinned)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255,255,255,0.5)',
                            cursor: 'pointer',
                            fontSize: '1.2rem',
                            padding: '0.25rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        title={isPinned ? "Unpin Sidebar" : "Pin Sidebar"}
                    >
                        {isPinned ? '📌' : '📍'}
                    </button>
                )}
            </div>

            <div className="sidebar-menu">
                {reports.map((group, groupIndex) => (
                    <div key={groupIndex} className="menu-group">
                        {/* Group Title - Only show if expanded */}
                        {isExpanded && (
                            <div className="menu-group-title" style={{ padding: '0.75rem 1.5rem', fontWeight: 'bold', color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                {group.group}
                            </div>
                        )}
                        {!isExpanded && <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0.5rem 1rem' }}></div>}

                        {group.items.map((item) => {
                            // Sub-group handling
                            if (item.type === 'sub-group') {
                                return (
                                    <div key={item.title} className="menu-subgroup" style={{ marginBottom: '0.5rem' }}>
                                        {isExpanded && (
                                            <div className="menu-subgroup-title" style={{ padding: '0.25rem 1.5rem', fontWeight: 600, color: '#4b5563', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                                {item.title}
                                            </div>
                                        )}
                                        {item.items.map(report => (
                                            <div
                                                key={report.id}
                                                className={`menu-item ${selectedReportId === report.id ? 'active' : ''}`}
                                                onClick={() => onSelectReport(report.id)}
                                                style={{
                                                    paddingLeft: isExpanded ? '2.5rem' : '0',
                                                    justifyContent: isExpanded ? 'flex-start' : 'center',
                                                    padding: isExpanded ? '0.75rem 1.5rem 0.75rem 2.5rem' : '0.75rem 0'
                                                }}
                                                title={!isExpanded ? report.name : ''}
                                            >
                                                {!isExpanded && <span style={{ fontSize: '1.2rem' }}>📄</span>}
                                                {isExpanded && report.name}
                                            </div>
                                        ))}
                                    </div>
                                );
                            } else {
                                // Standard Item
                                const report = item;
                                return (
                                    <div
                                        key={report.id}
                                        className={`menu-item ${selectedReportId === report.id ? 'active' : ''}`}
                                        onClick={() => onSelectReport(report.id)}
                                        style={{
                                            justifyContent: isExpanded ? 'flex-start' : 'center',
                                            padding: isExpanded ? '0.75rem 1.5rem' : '0.75rem 0'
                                        }}
                                        title={!isExpanded ? report.name : ''}
                                    >
                                        {!isExpanded && <span style={{ fontSize: '1.2rem' }}>📄</span>}
                                        {isExpanded && report.name}
                                    </div>
                                );
                            }
                        })}
                    </div>
                ))}
                {/* DASHBOARD (Superset) — static section */}
                <div className="menu-group">
                    {isExpanded && (
                        <div className="menu-group-title" style={{ padding: '0.75rem 1.5rem', fontWeight: 'bold', color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                            Dashboard
                        </div>
                    )}
                    {!isExpanded && <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0.5rem 1rem' }}></div>}

                    <div
                        className={`menu-item ${selectedReportId === 'superset-dashboard' ? 'active' : ''}`}
                        onClick={() => onSelectReport('superset-dashboard')}
                        style={{
                            justifyContent: isExpanded ? 'flex-start' : 'center',
                            padding: isExpanded ? '0.75rem 1.5rem' : '0.75rem 0'
                        }}
                        title={!isExpanded ? 'Dashboard' : ''}
                    >
                        {!isExpanded && <span style={{ fontSize: '1.2rem' }}>📊</span>}
                        {isExpanded && 'Dashboard'}
                    </div>
                </div>
                {/* SYSTEM CHECK — static section */}
                <div className="menu-group">
                    {isExpanded && (
                        <div className="menu-group-title" style={{ padding: '0.75rem 1.5rem', fontWeight: 'bold', color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                            System Check
                        </div>
                    )}
                    {!isExpanded && <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0.5rem 1rem' }}></div>}

                    <div
                        className={`menu-item ${selectedReportId === 'sql-health-check' ? 'active' : ''}`}
                        onClick={() => onSelectReport('sql-health-check')}
                        style={{
                            justifyContent: isExpanded ? 'flex-start' : 'center',
                            padding: isExpanded ? '0.75rem 1.5rem' : '0.75rem 0'
                        }}
                        title={!isExpanded ? 'Report - SQL Healthy Check' : ''}
                    >
                        {!isExpanded && <span style={{ fontSize: '1.2rem' }}>🗄️</span>}
                        {isExpanded && 'Report - SQL Healthy Check'}
                    </div>

                    <div
                        className={`menu-item ${selectedReportId === 'connections-monitor' ? 'active' : ''}`}
                        onClick={() => onSelectReport('connections-monitor')}
                        style={{
                            justifyContent: isExpanded ? 'flex-start' : 'center',
                            padding: isExpanded ? '0.75rem 1.5rem' : '0.75rem 0'
                        }}
                        title={!isExpanded ? 'Connections Monitor' : ''}
                    >
                        {!isExpanded && <span style={{ fontSize: '1.2rem' }}>🔗</span>}
                        {isExpanded && 'Connections Monitor'}
                    </div>

                    <div
                        className={`menu-item ${selectedReportId === 'script-changelog' ? 'active' : ''}`}
                        onClick={() => onSelectReport('script-changelog')}
                        style={{
                            justifyContent: isExpanded ? 'flex-start' : 'center',
                            padding: isExpanded ? '0.75rem 1.5rem' : '0.75rem 0'
                        }}
                        title={!isExpanded ? 'Script Change Logs' : ''}
                    >
                        {!isExpanded && <span style={{ fontSize: '1.2rem' }}>📜</span>}
                        {isExpanded && 'Script Change Logs'}
                    </div>
                </div>
            </div>

            {/* Footer with Pin Button when collapsed (optional, keeping it simple for now) */}
            {!isExpanded && (
                <button
                    onClick={() => { setIsPinned(true); setIsHovered(true); }}
                    style={{
                        margin: '1rem auto',
                        background: 'none',
                        border: 'none',
                        color: 'rgba(255,255,255,0.3)',
                        cursor: 'pointer',
                        fontSize: '1rem'
                    }}
                >
                    📍
                </button>
            )}
        </div>
    );
};

export default Sidebar;
