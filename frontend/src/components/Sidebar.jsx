import React, { useState, useEffect } from 'react';
import { APP_CONFIG } from '../config';
import {
    Key, Settings2, BarChart3, Activity, Database, Ticket, SlidersHorizontal,
    LayoutDashboard, Server, ChevronDown, Pin, PinOff, Circle,
} from 'lucide-react';

// Static sections (Dashboard, System Check) are hardcoded here (not part of the
// backend-driven `reports` prop), but modeled the same way ({ group, items })
// so they can share the exact same collapsible-group rendering logic below.
// Rendered separately (Dashboard first, System Check last) — see render below.
const DASHBOARD_SECTION = {
    group: 'Dashboard',
    items: [
        { id: 'superset-dashboard', name: 'Dashboard' },
    ],
};

const SYSTEM_CHECK_SECTION = {
    group: 'System Check',
    items: [
        { id: 'sql-health-check', name: 'Report - SQL Healthy Check' },
        { id: 'connections-monitor', name: 'Connections Monitor' },
        { id: 'script-changelog', name: 'Script Change Logs' },
        { id: 'rk7-usage', name: 'RK7 Usage' },
        { id: 'ref-connection-log', name: 'Ref Connection Log' },
    ],
};

// Line icon (lucide, đơn sắc) cho từng NHÓM CHA — mục con không có icon,
// chỉ phân biệt bằng indent + guide dọc + typography (xem renderGroup).
const GROUP_ICONS = {
    'License': Key,
    'General': Settings2,
    'Sales Report': BarChart3,
    'Online data monitor': Activity,
    'Online Sales Data': Database,
    'Ecode Reports': Ticket,
    'Masterdata Control': SlidersHorizontal,
    'Dashboard': LayoutDashboard,
    'System Check': Server,
};

// Tìm nhóm (và nhóm con, nếu có) đang chứa report đang active — dùng để tự mở
// đúng nhóm đó khi mới vào trang / khi đổi báo cáo, theo cùng convention khoá
// group đang dùng khi render (xem groupKey/subKey trong renderGroup).
function findActiveGroupKeys(allGroups, reportId) {
    if (!reportId) return [];
    for (const group of allGroups) {
        for (const item of group.items) {
            if (item.type === 'sub-group') {
                if (item.items.some((sub) => sub.id === reportId)) {
                    return [group.group, `${group.group}::sub::${item.title}`];
                }
            } else if (item.id === reportId) {
                return [group.group];
            }
        }
    }
    return [];
}

// Chevron xoay theo trạng thái mở/đóng — dùng chung cho header nhóm & nhóm con.
// Màu dịu (--sidebar-chevron-color) để không cạnh tranh với icon/tiêu đề nhóm.
function GroupChevron({ isOpen, size = 15 }) {
    return (
        <ChevronDown
            size={size}
            strokeWidth={2}
            style={{
                color: 'var(--sidebar-chevron-color)',
                flexShrink: 0,
                transition: 'transform 0.15s ease',
                transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
        />
    );
}

const Sidebar = ({ reports, selectedReportId, onSelectReport }) => {
    const [isPinned, setIsPinned] = useState(true);
    const [isHovered, setIsHovered] = useState(false);
    // Nhóm nào đang mở — mặc định TẤT CẢ thu gọn (Set rỗng). Nhiều nhóm có thể
    // mở độc lập cùng lúc; không dùng localStorage/sessionStorage.
    const [openGroups, setOpenGroups] = useState(() => new Set());

    const isExpanded = isPinned || isHovered;
    const allGroups = [DASHBOARD_SECTION, ...reports, SYSTEM_CHECK_SECTION];

    // Tự động mở (chỉ THÊM, không đóng nhóm khác) nhóm/nhóm-con đang chứa
    // report được chọn — chạy lại khi đổi báo cáo hoặc khi `reports` tải xong.
    useEffect(() => {
        const activeKeys = findActiveGroupKeys(allGroups, selectedReportId);
        if (activeKeys.length === 0) return;
        setOpenGroups((prev) => {
            const missing = activeKeys.filter((k) => !prev.has(k));
            if (missing.length === 0) return prev; // no-op: giữ nguyên reference, tránh render thừa
            const next = new Set(prev);
            missing.forEach((k) => next.add(k));
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedReportId, reports]);

    const toggleGroup = (key) => {
        setOpenGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const headerRowProps = (key, isOpen) => ({
        role: 'button',
        tabIndex: 0,
        'aria-expanded': isOpen,
        onClick: () => toggleGroup(key),
        onKeyDown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleGroup(key);
            }
        },
    });

    // Mục con: KHÔNG icon. Phân biệt cha/con bằng indent (do wrapper cha quy
    // định qua marginLeft/borderLeft) + màu/weight dịu hơn tiêu đề nhóm.
    // Ở chế độ sidebar thu hẹp (icon-rail, !isExpanded) vẫn cần một dấu hiệu
    // trung tính (không mang nghĩa) để giữ được click target — dùng chấm tròn nhỏ.
    const renderStandardItem = (report) => (
        <div
            key={report.id}
            className={`menu-item ${selectedReportId === report.id ? 'active' : ''}`}
            onClick={() => onSelectReport(report.id)}
            style={{
                justifyContent: isExpanded ? 'flex-start' : 'center',
                padding: isExpanded ? '0.55rem 1rem' : '0.75rem 0',
            }}
            title={!isExpanded ? report.name : ''}
        >
            {!isExpanded && <Circle size={6} fill="currentColor" style={{ color: 'var(--sidebar-chevron-color)', flexShrink: 0 }} />}
            {isExpanded && report.name}
        </div>
    );

    const renderGroup = (group, groupIndex) => {
        const groupKey = group.group;
        const isGroupOpen = openGroups.has(groupKey);
        const showItems = !isExpanded || isGroupOpen;
        const GroupIcon = GROUP_ICONS[group.group] || Circle;

        return (
            <div key={groupIndex} className="menu-group">
                {isExpanded ? (
                    <div
                        className="menu-group-title"
                        {...headerRowProps(groupKey, isGroupOpen)}
                        style={{
                            padding: '0.6rem 1rem', fontWeight: 600, color: 'var(--sidebar-group-title-color)', fontSize: '0.78rem',
                            textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            cursor: 'pointer', userSelect: 'none',
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <GroupIcon size={17} strokeWidth={1.75} style={{ color: 'var(--sidebar-group-title-color)', flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.group}</span>
                        </span>
                        <GroupChevron isOpen={isGroupOpen} />
                    </div>
                ) : (
                    <div style={{ height: '1px', background: 'var(--sidebar-divider-color)', margin: '0.5rem 1rem' }}></div>
                )}

                {showItems && (
                    <div
                        style={isExpanded ? {
                            marginLeft: '1.15rem',
                            paddingLeft: '0.75rem',
                            borderLeft: '1px solid var(--sidebar-guide-color)',
                        } : undefined}
                    >
                        {group.items.map((item) => {
                            if (item.type === 'sub-group') {
                                const subKey = `${groupKey}::sub::${item.title}`;
                                const isSubOpen = openGroups.has(subKey);
                                const showSubItems = !isExpanded || isSubOpen;

                                return (
                                    <div key={item.title} className="menu-subgroup">
                                        {isExpanded && (
                                            <div
                                                className="menu-subgroup-title"
                                                {...headerRowProps(subKey, isSubOpen)}
                                                style={{
                                                    padding: '0.5rem 1rem', fontWeight: 500, color: 'var(--sidebar-subgroup-title-color)', fontSize: '0.8rem',
                                                    whiteSpace: 'nowrap', overflow: 'hidden',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    cursor: 'pointer', userSelect: 'none',
                                                }}
                                            >
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
                                                <GroupChevron isOpen={isSubOpen} size={13} />
                                            </div>
                                        )}
                                        {showSubItems && (
                                            <div
                                                style={isExpanded ? {
                                                    marginLeft: '1rem',
                                                    paddingLeft: '0.65rem',
                                                    borderLeft: '1px solid var(--sidebar-guide-color)',
                                                } : undefined}
                                            >
                                                {item.items.map((report) => renderStandardItem(report))}
                                            </div>
                                        )}
                                    </div>
                                );
                            }
                            return renderStandardItem(item);
                        })}
                    </div>
                )}
            </div>
        );
    };

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
                            padding: '0.25rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        title={isPinned ? "Unpin Sidebar" : "Pin Sidebar"}
                    >
                        {isPinned ? <Pin size={18} strokeWidth={1.75} /> : <PinOff size={18} strokeWidth={1.75} />}
                    </button>
                )}
            </div>

            <div className="sidebar-menu">
                {renderGroup(DASHBOARD_SECTION, 'static-dashboard')}
                {reports.map((group, groupIndex) => renderGroup(group, groupIndex))}
                {renderGroup(SYSTEM_CHECK_SECTION, 'static-system-check')}
            </div>

            {/* Brand footer — logo + bản quyền công ty. Khi thu hẹp (icon-rail),
                xếp dọc logo + nút pin nhỏ (giữ nguyên hành vi pin cũ, chỉ đủ chỗ cho icon). */}
            <div
                className="sidebar-footer"
                style={{
                    borderTop: '1px solid var(--sidebar-divider-color)',
                    padding: isExpanded ? '0.85rem 1.25rem' : '0.75rem 0',
                    display: 'flex',
                    flexDirection: isExpanded ? 'row' : 'column',
                    alignItems: 'center',
                    justifyContent: isExpanded ? 'flex-start' : 'center',
                    gap: isExpanded ? '0.6rem' : '0.5rem',
                    flexShrink: 0,
                }}
            >
                <img
                    src="/DcorpLogoNew.jpg"
                    alt="Dcorp Technology Corporation"
                    title={!isExpanded ? 'Dcorp Technology Corporation' : undefined}
                    style={{ width: isExpanded ? '22px' : '20px', height: isExpanded ? '22px' : '20px', borderRadius: '5px', flexShrink: 0 }}
                />
                {isExpanded ? (
                    <div style={{ lineHeight: 1.35, overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--sidebar-item-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Dcorp Technology Corporation
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--sidebar-chevron-color)' }}>
                            © {new Date().getFullYear()} All rights reserved.
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => { setIsPinned(true); setIsHovered(true); }}
                        title="Pin Sidebar"
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255,255,255,0.3)',
                            cursor: 'pointer',
                            display: 'flex',
                            padding: 0,
                        }}
                    >
                        <PinOff size={14} strokeWidth={1.75} />
                    </button>
                )}
            </div>
        </div>
    );
};

export default Sidebar;
