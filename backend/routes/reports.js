const express = require('express');
const router = express.Router();
const { sql, pgPool } = require('../config/db');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { createPinnedHttpsAgent } = require('../services/pinnedHttpsAgent');
const { RK7_SHARED_CERT_FINGERPRINT256 } = require('../config/rk7CertPin');

// Dùng chung cho mọi request tới hạ tầng RK7 (masterdata_sources.json) — pin theo fingerprint
// thay vì rejectUnauthorized:false (xem config/rk7CertPin.js để biết vì sao dùng chung 1 fingerprint).
const rk7PinnedAgent = createPinnedHttpsAgent(RK7_SHARED_CERT_FINGERPRINT256);

// @route   GET /api/reports
// @desc    Get list of all available reports grouped by category
// @route   GET /api/params/:type
// @desc    Get dynamic parameters options
router.get('/params/:type', async (req, res) => {
    try {
        const type = req.params.type;
        let tableName = '';

        switch (type) {
            case 'restaurants': tableName = 'RESTAURANTS'; break;
            case 'concepts': tableName = 'RESTAURANTCONCEPTS'; break;
            case 'regions': tableName = 'RESTAURANTREGIONS'; break;
            case 'franchises': tableName = 'RESTAURANTFRANCHISES'; break;
            case 'collectionIds':
                try {
                    const configPath = path.join(__dirname, '../config/masterdata_sources.json');
                    if (!fs.existsSync(configPath)) return res.json([]);
                    const sources = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    const master = sources.find(s => s.isMaster) || sources[0];
                    if (!master) return res.json([]);

                    const auth = Buffer.from(`${master.user}:${master.pass}`).toString('base64');
                    const response = await axios.get(master.url, {
                        headers: { 'Authorization': `Basic ${auth}` },
                        httpsAgent: rk7PinnedAgent,
                        timeout: 5000
                    });

                    const $ = cheerio.load(response.data);
                    const options = [];
                    $('table tr').each((i, el) => {
                        const tds = $(el).find('td');
                        if (tds.length >= 2) {
                            const id = $(tds[0]).text().trim();
                            const name = $(tds[1]).text().trim();
                            if (id && id !== 'CollectionID' && id !== '') {
                                options.push({ value: id, label: `${id} - ${name}` });
                            }
                        }
                    });
                    return res.json(options.sort((a, b) => parseInt(a.value) - parseInt(b.value)));
                } catch (err) {
                    console.error('Failed to fetch collection IDs:', err.message);
                    return res.json([
                        { value: '10', label: '10 - Cashiers' },
                        { value: '13', label: '13 - Orders' },
                        { value: '131', label: '131 - Menu Items' }
                    ]);
                }
            default: return res.status(400).json({ msg: 'Invalid param type' });
        }

        console.log(`[API] Fetching params for ${type} from ${tableName}`);

        try {
            const query = `SELECT Name as label, GUIDSTRING as value FROM ${tableName} WHERE STATUS IN (2, 3)`;
            const result = await sql.query(query);
            res.json(result.recordset);
        } catch (dbErr) {
            console.error(`[API] Failed to fetch params for ${type}:`, dbErr);
            // Mock data fallback
            res.json([
                { label: `${type} 1 (Mock)`, value: 'GUID-001' },
                { label: `${type} 2 (Mock)`, value: 'GUID-002' }
            ]);
        }

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/reports
// @desc    Get list of all available reports grouped by category
router.get('/', async (req, res) => {
    try {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const formatDate = (date) => date.toISOString().split('T')[0];
        const todayStr = formatDate(today);
        const yesterdayStr = formatDate(yesterday);

        const twoDaysAgo = new Date(today);
        twoDaysAgo.setDate(today.getDate() - 2);
        const twoDaysAgoStr = formatDate(twoDaysAgo);

        const fiveDaysAgo = new Date(today);
        fiveDaysAgo.setDate(today.getDate() - 7);
        const fiveDaysAgoStr = formatDate(fiveDaysAgo);

        const tenDaysAgo = new Date(today);
        tenDaysAgo.setDate(today.getDate() - 10);
        const tenDaysAgoStr = formatDate(tenDaysAgo);
        const reports = [
            {
                group: 'License',
                items: [
                    {
                        id: 'license_expired_10',
                        name: 'License Expired',
                        description: 'List of licenses expiring within specified days',
                        parameters: [
                            { name: 'days', label: 'Days to Expire', type: 'number', defaultValue: 10 }
                        ]
                    }
                ]
            },
            {
                group: 'General',
                items: [
                    {
                        id: 'restaurant_list',
                        name: 'Restaurant List',
                        description: 'List of all restaurants with status',
                        parameters: [
                            {
                                name: 'status',
                                label: 'Status',
                                type: 'checkbox-list',
                                options: [
                                    { value: 3, label: 'Active' },
                                    { value: 2, label: 'Inactive' },
                                    { value: 1, label: 'Deleted' }
                                ],
                                defaultValue: [3]
                            }
                        ]
                    },
                    {
                        id: 'common_shift_info',
                        name: 'Common Shift Info',
                        description: 'Show shift status for restaurants',
                        parameters: [
                            { name: 'date', label: 'Date', type: 'date', defaultValue: todayStr },
                            {
                                name: 'closedStatus',
                                label: 'Status',
                                type: 'checkbox-list',
                                options: [
                                    { value: 'NOT CLOSE', label: 'Not Close' },
                                    { value: 'CLOSED', label: 'Closed' }
                                ],
                                defaultValue: ['NOT CLOSE', 'CLOSED']
                            }
                        ]
                    },
                    {
                        id: 'online_compare',
                        name: 'Online Data Compare',
                        description: 'Compare data between MSSQL (Sky) and PostgreSQL (Cloud)',
                        parameters: [
                            { name: 'shiftdate', label: 'Shift Date', type: 'date', defaultValue: todayStr }
                        ]
                    },
                    {
                        id: 'shift_closed_by_time',
                        name: 'Common shift closed by time',
                        description: 'Show closed shifts distribution by hour (PostgreSQL)',
                        parameters: [
                            { name: 'shiftdate', label: 'Shift Date', type: 'date', defaultValue: yesterdayStr }
                        ]
                    },
                    {
                        id: 'data_reconciliation',
                        name: 'Data reconciliation',
                        description: 'Compare data between MSSQL and PostgreSQL',
                        parameters: [
                            { name: 'shiftdate', label: 'Shift Date', type: 'date', defaultValue: yesterdayStr },
                            { name: 'showOnlyDifferent', label: 'Show only different', type: 'checkbox', defaultValue: true }
                        ]
                    }
                ]
            },
            {
                group: 'Sales Report',
                items: [
                    {
                        title: '1.1 Báo cáo doanh thu',
                        type: 'sub-group',
                        items: [
                            {
                                id: 'bo_101',
                                name: 'BO.101.Doanh thu theo ngày',
                                description: 'Report Sales By Shift',
                                parameters: [
                                    { name: 'dateFrom', label: 'From Date', type: 'date', defaultValue: yesterdayStr },
                                    { name: 'dateTo', label: 'To Date', type: 'date', defaultValue: todayStr },
                                    { name: 'restaurants', label: 'Restaurants', type: 'checkbox-list', sourceUrl: '/reports/params/restaurants', defaultValue: [] },
                                    { name: 'franchises', label: 'Franchises', type: 'checkbox-list', sourceUrl: '/reports/params/franchises', defaultValue: [] },
                                    { name: 'regions', label: 'Regions', type: 'checkbox-list', sourceUrl: '/reports/params/regions', defaultValue: [] },
                                    { name: 'concepts', label: 'Concepts', type: 'checkbox-list', sourceUrl: '/reports/params/concepts', defaultValue: [] }
                                ]
                            },
                            {
                                id: 'bo_104',
                                name: 'BO.104.Doanh thu theo chi tiết hóa đơn',
                                description: 'Report Sales By Invoice Details',
                                parameters: [
                                    { name: 'dateFrom', label: 'From Date', type: 'date', defaultValue: yesterdayStr },
                                    { name: 'dateTo', label: 'To Date', type: 'date', defaultValue: todayStr },
                                    { name: 'restaurants', label: 'Restaurants', type: 'checkbox-list', sourceUrl: '/reports/params/restaurants', defaultValue: [] },
                                    { name: 'franchises', label: 'Franchises', type: 'checkbox-list', sourceUrl: '/reports/params/franchises', defaultValue: [] },
                                    { name: 'regions', label: 'Regions', type: 'checkbox-list', sourceUrl: '/reports/params/regions', defaultValue: [] },
                                    { name: 'concepts', label: 'Concepts', type: 'checkbox-list', sourceUrl: '/reports/params/concepts', defaultValue: [] }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                group: 'Online data monitor',
                items: [
                    {
                        id: 'upload_latencies',
                        name: 'Latencies by date',
                        description: 'System upload performance and latencies (PostgreSQL)',
                        isDashboard: true,
                        parameters: [
                            { name: 'dateFrom', label: 'From Date', type: 'date', defaultValue: fiveDaysAgoStr },
                            { name: 'dateTo', label: 'To Date', type: 'date', defaultValue: todayStr },
                            { name: 'showP99', label: 'Show P99 Latency', type: 'checkbox', defaultValue: false }
                        ]
                    },
                    {
                        id: 'latency_by_location',
                        name: 'Latency by location',
                        description: 'SLA and Latency distribution by midserver (PostgreSQL)',
                        isDashboard: true,
                        parameters: [
                            { name: 'date1', label: 'Date', type: 'date', defaultValue: todayStr }
                        ]
                    }
                ]
            },
            {
                group: 'Online Sales Data',
                items: [
                    {
                        id: 'general_online_sales',
                        name: 'General Online sales',
                        description: 'Operational dashboard for online sales performance',
                        isDashboard: true,
                        parameters: [
                            { name: 'shiftdate', label: 'Shift Date', type: 'date', defaultValue: todayStr }
                        ]
                    },
                    {
                        id: 'sales_analyze',
                        name: 'Sales Analyze',
                        description: 'Sales performance analysis across dates and channels',
                        isDashboard: true,
                        parameters: [
                            { name: 'dateFrom', label: 'From Date', type: 'date', defaultValue: tenDaysAgoStr },
                            { name: 'dateTo', label: 'To Date', type: 'date', defaultValue: yesterdayStr }
                        ]
                    },
                    {
                        id: 'online_sales_revenue_snapshot',
                        name: 'Online Sales Revenue Snapshot',
                        description: 'Total check numbers over time, grouped by date and updated hour',
                        isDashboard: true,
                        parameters: [
                            { name: 'dateFrom', label: 'Shift Date From', type: 'date', defaultValue: twoDaysAgoStr },
                            { name: 'dateTo', label: 'Shift Date To', type: 'date', defaultValue: todayStr }
                        ]
                    }
                ]
            },
            {
                group: 'Ecode Reports',
                items: [
                    {
                        id: 'ecode_using',
                        name: 'Ecode Using',
                        description: 'Phân tích số lượng coupon sử dụng theo giờ, theo dõi online, so sánh nhiều ngày (server Ecode)',
                        isDashboard: true,
                        parameters: []
                    },
                    {
                        id: 'ecode_check',
                        name: 'Ecode Check',
                        description: 'Tra cứu nhanh tình trạng sử dụng 1 coupon theo mã ecode (server CRM)',
                        isDashboard: true,
                        parameters: []
                    },
                    {
                        id: 'ecode_change_log',
                        name: 'Ecode Change Log',
                        description: 'Lịch sử thay đổi FLAGS coupon theo ngày hoặc theo ecode (server CRM)',
                        isDashboard: true,
                        parameters: []
                    }
                ]
            },
            {
                group: 'Masterdata Control',
                items: [
                    {
                        id: 'compare_masterdata',
                        name: 'Compare Masterdata',
                        description: 'Compare masterdata versions across various servers',
                        parameters: [
                            {
                                name: 'collectionIds',
                                label: 'Collections to Compare',
                                type: 'checkbox-list',
                                sourceUrl: '/reports/params/collectionIds',
                                defaultValue: ['10', '13', '131', '132', '137', '14', '19', '21', '22', '52', '65', '66']
                            }
                        ]
                    }
                ]
            }
        ];
        res.json(reports);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/reports/:id
// @desc    Get report data by ID
// @route   GET /api/reports/:id
// @desc    Get report data by ID
// @route   POST /api/reports/:id
// @desc    Get report data by ID
router.post('/:id', async (req, res) => {
    try {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const formatDate = (date) => date.toISOString().split('T')[0];
        const todayStr = formatDate(today);
        const yesterdayStr = formatDate(yesterday);

        const twoDaysAgo = new Date(today);
        twoDaysAgo.setDate(today.getDate() - 2);
        const twoDaysAgoStr = formatDate(twoDaysAgo);

        const fiveDaysAgo = new Date(today);
        fiveDaysAgo.setDate(today.getDate() - 7);
        const fiveDaysAgoStr = formatDate(fiveDaysAgo);

        const tenDaysAgo = new Date(today);
        tenDaysAgo.setDate(today.getDate() - 10);
        const tenDaysAgoStr = formatDate(tenDaysAgo);

        // Helper to get value from object case-insensitively
        const getVal = (obj, key) => {
            if (!obj) return null;
            if (obj[key] !== undefined) return obj[key];
            const lowerKey = key.toLowerCase().replace(/_/g, '');
            const foundKey = Object.keys(obj).find(k => {
                const normalizedK = k.toLowerCase().replace(/_/g, '');
                return normalizedK === lowerKey;
            });
            return foundKey ? obj[foundKey] : null;
        };

        // Helper function for in-memory processing (Filtering -> Sorting -> Grouping -> Pagination)
        const processReportData = (inputData, params) => {
            // Filter out null/undefined records immediately
            let processed = (inputData || []).filter(item => item !== null && item !== undefined);

            // Extract columns from the first valid item (before filtering/grouping destroys the flat structure)
            const sampleItem = processed.length > 0 ? processed[0] : null;
            const columns = sampleItem ? Object.keys(sampleItem) : [];

            const { filters, sortBy, sortOrder, page = 1, pageSize = 50, groupBy = [], expandedGroups = {} } = params;

            // 0. Pre-calculate Unique Values for ALL columns (scan all rows to ensure we get all keys and values)
            const uniqueValues = {};
            if (processed.length > 0) {
                // Find all unique keys across all items
                const allKeys = new Set();
                processed.forEach(item => {
                    Object.keys(item).forEach(k => allKeys.add(k));
                });

                allKeys.forEach(key => {
                    if (['SOURCE_SQL_EXISTS', 'SOURCE_PG_EXISTS'].includes(key)) return;

                    const valueSet = new Set();
                    processed.forEach(item => {
                        const val = getVal(item, key);
                        valueSet.add(val === null || val === undefined ? '' : String(val));
                    });
                    uniqueValues[key] = [...valueSet].sort((a, b) => {
                        // Numeric sort if possible
                        const na = parseFloat(a);
                        const nb = parseFloat(b);
                        if (!isNaN(na) && !isNaN(nb)) return na - nb;
                        return String(a).localeCompare(String(b));
                    });
                });
            }

            // 1. Filter
            if (filters && Object.keys(filters).length > 0) {
                Object.keys(filters).forEach(key => {
                    const filter = filters[key];
                    if (!filter) return;

                    // Support both simple string and complex object
                    if (typeof filter === 'string') {
                        const val = filter.toLowerCase().trim();
                        if (val) {
                            processed = processed.filter(item => {
                                const itemValue = String(getVal(item, key) || '').toLowerCase();
                                return itemValue.includes(val);
                            });
                        }
                    } else if (typeof filter === 'object') {
                        const { type, operator, value, value2, values } = filter;

                        if (type === 'multi' && Array.isArray(values) && values.length > 0) {
                            processed = processed.filter(item => {
                                const itemValue = String(getVal(item, key) || '');
                                return values.includes(itemValue);
                            });
                        } else if (type === 'numeric' && operator) {
                            const target = parseFloat(value);
                            const target2 = parseFloat(value2);

                            processed = processed.filter(item => {
                                const itemValue = parseFloat(getVal(item, key));
                                if (isNaN(itemValue)) return false;

                                switch (operator) {
                                    case '=': return itemValue === target;
                                    case '>': return itemValue > target;
                                    case '<': return itemValue < target;
                                    case '>=': return itemValue >= target;
                                    case '<=': return itemValue <= target;
                                    case 'between': return itemValue >= target && itemValue <= target2;
                                    default: return true;
                                }
                            });
                        } else if (type === 'text' && value) {
                            const val = String(value).toLowerCase().trim();
                            processed = processed.filter(item => {
                                const itemValue = String(getVal(item, key) || '').toLowerCase();
                                return itemValue.includes(val);
                            });
                        }
                    }
                });
            }

            // 2. Sort (Base Data)
            // Always sort base data first, even if grouping, to ensuring consistent order within groups if not sorted by other means
            if (sortBy) {
                processed.sort((a, b) => {
                    const valA = a[sortBy] || '';
                    const valB = b[sortBy] || '';
                    if (valA < valB) return sortOrder === 'desc' ? 1 : -1;
                    if (valA > valB) return sortOrder === 'desc' ? -1 : 1;
                    return 0;
                });
            }

            // 3. Grouping Logic
            if (groupBy.length > 0) {
                // 3a. Build Tree (Full Tree of Groups)
                const buildTree = (items, depth = 0) => {
                    if (depth >= groupBy.length) return items;

                    const key = groupBy[depth];
                    const groups = {};

                    // Partition items into groups
                    items.forEach(item => {
                        const groupVal = String(item[key]);
                        if (!groups[groupVal]) groups[groupVal] = [];
                        groups[groupVal].push(item);
                    });

                    const result = [];
                    Object.keys(groups).forEach(groupVal => {
                        const groupItems = groups[groupVal];
                        // Full ID path for expanding/collapsing logic
                        const firstItem = groupItems[0];
                        const fullGroupKey = groupBy.slice(0, depth + 1).map(k => String(firstItem[k])).join('::');

                        // Recursively build children
                        // Note: We build children FULLY here.
                        const children = buildTree(groupItems, depth + 1);

                        // Calculate Aggregates
                        const aggregates = {};
                        if (groupItems.length > 0) {
                            Object.keys(groupItems[0]).forEach(colKey => {
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
                            children: children, // Full children tree
                            aggregates: aggregates
                        });
                    });

                    // Sort Groups (by Value Ascending for now, or match sortOrder if group key matches SortBy)
                    // If the user wants to sort groups, we might need more complex logic.
                    // For now, sorting by group value is a safe default.
                    result.sort((a, b) => (a.value > b.value ? 1 : -1));

                    return result;
                };

                const fullTree = buildTree(processed);

                // 3b. Paginate GROUPS (Top-Level)
                const totalGroups = fullTree.length;
                const skip = (page - 1) * pageSize;
                const pagedGroups = fullTree.slice(skip, skip + pageSize);

                // 3c. Flatten ONLY the Paged Groups
                const flatten = (nodes) => {
                    let list = [];
                    nodes.forEach(node => {
                        if (node.type === 'group') {
                            const isExpanded = !!expandedGroups[node.id];
                            list.push({ ...node, isExpanded, children: null }); // Remove children ref from flat node

                            if (isExpanded) {
                                if (Array.isArray(node.children) && node.children.length > 0 && !node.children[0].type) {
                                    // Data rows -> Wrap in "data" type for frontend normalization
                                    list = list.concat(node.children.map(item => ({ type: 'data', data: item })));
                                } else {
                                    // Nested groups
                                    list = list.concat(flatten(node.children));
                                }
                            }
                        } else {
                            // Should not trigger if input is strictly group nodes, but as safety:
                            list.push({ type: 'data', data: node });
                        }
                    });
                    return list;
                };

                const flatData = flatten(pagedGroups);

                return { data: flatData, total: totalGroups, columns, uniqueValues };
            }

            // 4. No Grouping -> Standard Row Pagination
            const total = processed.length;
            const skip = (page - 1) * pageSize;
            const isAllRows = params && params.includeAllRows;
            const dataSlice = isAllRows ? processed : processed.slice(skip, skip + pageSize);
            const data = dataSlice.map(item => ({ type: 'data', data: item })); // Normalize here too!

            return { data, total, columns, uniqueValues };
        };
        if (req.params.id === 'general_online_sales') {
            const shiftdate = req.body.shiftdate || todayStr;
            console.log(`[API-VERIFIED-V2] Executing general_online_sales for: ${shiftdate}`);

            try {
                const query = `
                    SELECT * 
                    FROM f_onlinesalerevenuetotal($1)
                `;

                const result = await pgPool.query(query, [shiftdate]);
                console.log(`[API] PG Query success. Rows: ${result.rows.length}`);

                // Fetch revenue center data for pie charts
                const rcQuery = `
                    SELECT * 
                    FROM f_onlinesalebyrevenuecenter($1)
                `;
                const rcResult = await pgPool.query(rcQuery, [shiftdate]);
                console.log(`[API] PG Revenue Center Query success. Rows: ${rcResult.rows.length}`);

                // Calculate Summary Statistics for ALL data
                const getField = (row, key) => row[key] !== undefined ? row[key] : row[key.toUpperCase()];

                const summary = {
                    restaurants: new Set(result.rows.map(r => getField(r, 'restaurantname') || getField(r, 'name') || getField(r, 'restaurant') || 'Unknown')).size,
                    restaurantsOpened: result.rows.filter(r => (getField(r, 'restaurantstatus') || '').toLowerCase() === 'opened').length,
                    restaurantsClosed: result.rows.filter(r => (getField(r, 'restaurantstatus') || '').toLowerCase() === 'closed').length,
                    checkcount: result.rows.reduce((acc, curr) => acc + Number(getField(curr, 'checkcount') || 0), 0),
                    ordernumber: result.rows.reduce((acc, curr) => acc + Number(getField(curr, 'ordernumber') || 0), 0),
                    checkcountvoid: result.rows.reduce((acc, curr) => acc + Number(getField(curr, 'checkcountvoid') || 0), 0),
                    paysum: result.rows.reduce((acc, curr) => acc + Number(getField(curr, 'paysum') || 0), 0),
                    lowest5: [...result.rows].sort((a, b) => Number(getField(a, 'paysum') || 0) - Number(getField(b, 'paysum') || 0)).slice(0, 5),
                    highest5: [...result.rows].sort((a, b) => Number(getField(b, 'paysum') || 0) - Number(getField(a, 'paysum') || 0)).slice(0, 5),
                    revenueCenterData: rcResult.rows.map(r => ({
                        revenuecenter: getField(r, 'revenuecenter'),
                        paysum: Number(getField(r, 'paysum') || 0),
                        paysumvoid: Number(getField(r, 'paysumvoid') || 0),
                        checkcount: Number(getField(r, 'checkcount') || 0),
                        checkcountvoid: Number(getField(r, 'checkcountvoid') || 0)
                    }))
                };

                // Ensure summary object always has values to prevent frontend blanks
                if (result.rows.length === 0 && rcResult.rows.length === 0) {
                    summary.noData = true;
                }

                const processed = processReportData(result.rows, req.body);
                const finalResponse = { ...processed, summary };
                return res.json(finalResponse);

            } catch (err) {
                console.error('[API] general_online_sales failed:', err);
                return res.status(500).json({ msg: 'Report execution failed' });
            }
        }

        if (req.params.id === 'sales_analyze') {
            try {
                let dateFrom = req.body.dateFrom;
                let dateTo = req.body.dateTo;

                // Strict default logic: Yesterday and 10 days ago (Requested by User)
                if (!dateTo && !dateFrom) {
                    dateTo = yesterdayStr;
                }

                if (!dateFrom) {
                    const targetToDate = dateTo || yesterdayStr;
                    const parts = targetToDate.split('-');
                    const toDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

                    const fromDate = new Date(toDate);
                    fromDate.setDate(toDate.getDate() - 9); // Total 10 days inclusive

                    const year = fromDate.getFullYear();
                    const month = String(fromDate.getMonth() + 1).padStart(2, '0');
                    const day = String(fromDate.getDate()).padStart(2, '0');
                    dateFrom = `${year}-${month}-${day}`;

                    if (!dateTo) dateTo = targetToDate;
                }

                // Old logic disabled (replaced by strict defaults above)
                if (false && (!dateFrom || !dateTo)) {
                    console.log('[API] No dates provided, querying for latest data...');

                    // Get the latest shiftdate from the database, limiting to yesterday (to avoid partial today data)
                    const latestDateQuery = `
                        SELECT MAX(shiftdate) as latest_date
                        FROM f_salerevenuebyrevenuecenter(
                            (CURRENT_DATE - INTERVAL '30 days')::date,
                            (CURRENT_DATE - INTERVAL '1 day')::date
                        )
                    `;

                    const latestResult = await pgPool.query(latestDateQuery);
                    const latestDate = latestResult.rows[0]?.latest_date;

                    if (latestDate) {
                        // Extract date string without timezone conversion
                        let latestDateStr;
                        if (typeof latestDate === 'string') {
                            latestDateStr = latestDate.split('T')[0];
                        } else if (latestDate instanceof Date) {
                            // Format date as YYYY-MM-DD without timezone conversion
                            const year = latestDate.getFullYear();
                            const month = String(latestDate.getMonth() + 1).padStart(2, '0');
                            const day = String(latestDate.getDate()).padStart(2, '0');
                            latestDateStr = `${year}-${month}-${day}`;
                        } else {
                            latestDateStr = String(latestDate).split('T')[0];
                        }

                        dateTo = dateTo || latestDateStr;

                        // Calculate 10 days before the latest date
                        const [year, month, day] = latestDateStr.split('-').map(num => parseInt(num, 10));
                        const fromDate = new Date(year, month - 1, day);
                        fromDate.setDate(fromDate.getDate() - 10);
                        const fromYear = fromDate.getFullYear();
                        const fromMonth = String(fromDate.getMonth() + 1).padStart(2, '0');
                        const fromDay = String(fromDate.getDate()).padStart(2, '0');
                        dateFrom = dateFrom || `${fromYear}-${fromMonth}-${fromDay}`;

                        console.log(`[API] Using latest data date: ${dateTo}, from: ${dateFrom}`);
                    } else {
                        // Fallback to calendar dates (Yesterday and 10 days ago) if no data found
                        dateFrom = dateFrom || tenDaysAgoStr;
                        dateTo = dateTo || yesterdayStr;
                        console.log(`[API] No data found, using calendar defaults: ${dateFrom} to ${dateTo}`);
                    }
                }

                console.log(`[API] Executing sales_analyze: ${dateFrom} to ${dateTo}`);

                const query = `
                    SELECT * 
                    FROM f_salerevenuebyrevenuecenter($1, $2)
                `;

                const result = await pgPool.query(query, [dateFrom, dateTo]);
                console.log(`[API] Sales Analyze success. Rows: ${result.rows.length}`);

                const processed = processReportData(result.rows, req.body);
                // We send summary with raw data for the dashboard to aggregate as needed
                const finalResponse = { ...processed, summary: { rows: result.rows } };
                return res.json(finalResponse);

            } catch (err) {
                console.error('[API] sales_analyze failed:', err);
                return res.status(500).json({ msg: 'Report execution failed' });
            }
        }

        if (req.params.id === 'online_sales_revenue_snapshot') {
            const dateFrom = req.body.dateFrom || twoDaysAgoStr;
            const dateTo = req.body.dateTo || todayStr;

            console.log(`[API] Executing online_sales_revenue_snapshot: ${dateFrom} to ${dateTo}`);

            try {
                const query = `
                    SELECT 
                        shiftdate,
                        date_trunc('minute', updatedatetime) AS update_time,
                        SUM(totalchecknumber + checkvoidnumber) AS total_check,
                        MAX(restaruantcount) AS restaruantcount
                    FROM online_sale_revenue_snapshot
                    WHERE shiftdate >= $1::date 
                      AND shiftdate <= $2::date
                    GROUP BY 
                        shiftdate,
                        date_trunc('minute', updatedatetime)
                    ORDER BY 
                        update_time ASC
                `;

                const result = await pgPool.query(query, [dateFrom, dateTo]);
                console.log(`[API] Online Sales Revenue Snapshot success. Rows: ${result.rows.length}`);

                const processed = processReportData(result.rows, { ...req.body, includeAllRows: true });
                return res.json(processed);
            } catch (err) {
                console.error('[API] online_sales_revenue_snapshot failed:', err);
                return res.status(500).json({ msg: 'Report execution failed' });
            }
        }

        if (req.params.id === 'upload_latencies') {
            const dateFrom = req.body.dateFrom || fiveDaysAgoStr;
            const dateTo = req.body.dateTo || todayStr;
            console.log(`[API] Executing upload_latencies dashboard: ${dateFrom} to ${dateTo}`);

            try {
                const query = `
                    SELECT *
                    FROM f_upload_latencies_by_range($1, $2)
                `;

                const result = await pgPool.query(query, [dateFrom, dateTo]);
                console.log(`[API] PG Latency Query success. Rows: ${result.rows.length}`);

                // Dashboards might not need full processReportData (pagination/grouping) 
                // but let's use it for the table fallback if needed.
                const processed = processReportData(result.rows, req.body);
                return res.json(processed);

            } catch (err) {
                console.error('[API] upload_latencies failed:', err);
                return res.status(500).json({ msg: 'Dashboard execution failed' });
            }
        }

        if (req.params.id === 'latency_by_location') {
            const date1 = req.body.date1 || todayStr;
            console.log(`[API] Executing Operational Latency Dashboard for: ${date1}`);

            try {
                // 1. Fetch System KPIs
                const kpiResult = await pgPool.query('SELECT * FROM public.f_latency_system_kpi($1)', [date1]);
                const kpis = kpiResult.rows[0] || { typical_experience_ms: 0, worst_outlier_p95_ms: 0, fleet_size: 0, total_uploads: 0 };

                // 2. Fetch SLA Distribution
                const slaResult = await pgPool.query('SELECT * FROM public.f_latency_sla_distribution($1)', [date1]);

                // 3. Fetch Top 20 Nodes
                const topResult = await pgPool.query('SELECT * FROM public.f_latency_top_nodes($1, 20)', [date1]);

                return res.json({
                    data: topResult.rows, // Backward compat for basic listing if needed
                    total: parseInt(kpis.fleet_size),
                    kpis: {
                        typical: Math.round(kpis.typical_experience_ms),
                        outlier: Math.round(kpis.worst_outlier_p95_ms),
                        fleetSize: parseInt(kpis.fleet_size),
                        totalUploads: parseInt(kpis.total_uploads)
                    },
                    slaDistribution: slaResult.rows.map(r => ({
                        level: r.sla_level,
                        count: parseInt(r.location_count),
                        color: r.color
                    })),
                    topWorst: topResult.rows
                });

            } catch (err) {
                console.error('[API] latency_by_location dashboard failed:', err);
                return res.status(500).json({ msg: 'Operational Dashboard execution failed' });
            }
        }

        if (req.params.id === 'shift_closed_by_time') {
            const shiftdate = req.body.shiftdate || todayStr;
            console.log(`[API] Executing shift_closed_by_time for: ${shiftdate}`);

            try {
                const query = `
                    SELECT 
                        shiftdate,
                        same_day_shift,
                        hour_of_day,
                        total_shifts,
                        total_shifts_cumulative 
                    FROM f_getClosedShiftByTime($1)
                `;

                const result = await pgPool.query(query, [shiftdate]);
                console.log(`[API] PG Query success. Rows: ${result.rows.length}`);

                const processed = processReportData(result.rows, req.body);
                return res.json(processed);

            } catch (err) {
                console.error('[API] shift_closed_by_time failed:', err);
                return res.status(500).json({ msg: 'Report execution failed' });
            }
        }

        if (req.params.id === 'compare_masterdata') {
            try {
                const configPath = path.join(__dirname, '../config/masterdata_sources.json');
                const sources = JSON.parse(fs.readFileSync(configPath, 'utf8'));

                const fetchData = async (source) => {
                    try {
                        const auth = Buffer.from(`${source.user}:${source.pass}`).toString('base64');
                        const response = await axios.get(source.url, {
                            headers: { 'Authorization': `Basic ${auth}` },
                            httpsAgent: rk7PinnedAgent,
                            timeout: 10000
                        });

                        const $ = cheerio.load(response.data);
                        const rows = [];
                        // References table structure (7 columns):
                        // 0:CollectionID, 1:CollectionName, 2:DataVersion, 3:Synchronyzing, 4:ItemsCount, 5:ItemClassName, 6:CollSyncStatus
                        $('table tr').each((i, el) => {
                            const tds = $(el).find('td');
                            if (tds.length >= 5) {
                                const id = $(tds[0]).text().trim();
                                if (id && id !== 'CollectionID') { // Skip header if it's in a td
                                    // Parse version (tds[2]) and count (tds[4]) as integers
                                    const rawVersion = $(tds[2]).text().trim().replace(/,/g, '');
                                    const rawCount = $(tds[4]).text().trim().replace(/,/g, '');

                                    const version = parseInt(rawVersion, 10);
                                    const count = parseInt(rawCount, 10);

                                    rows.push({
                                        CollectionID: id,
                                        CollectionName: $(tds[1]).text().trim(),
                                        DataVersion: isNaN(version) ? rawVersion : version,
                                        ItemsCount: isNaN(count) ? rawCount : count
                                    });
                                }
                            }
                        });
                        return { label: source.label, data: rows, success: true, isMaster: source.isMaster };
                    } catch (err) {
                        console.error(`Failed to fetch from ${source.label}:`, err.message);
                        return { label: source.label, data: [], success: false, error: err.message, isMaster: source.isMaster };
                    }
                };

                const results = await Promise.all(sources.map(fetchData));
                const masterSource = results.find(r => r.isMaster) || results[0];

                // Reformat data for table view: one row per CollectionID, then columns for each server comparison
                const comparisonData = [];
                const masterMap = new Map();
                masterSource.data.forEach(item => {
                    masterMap.set(item.CollectionID, item);
                });

                const allCollectionIDs = new Set();
                results.forEach(r => r.data.forEach(item => allCollectionIDs.add(item.CollectionID)));

                allCollectionIDs.forEach(id => {
                    const masterItem = masterMap.get(id) || {};
                    const row = {
                        CollectionID: id,
                        CollectionName: masterItem.CollectionName || (results.find(r => r.data.find(i => i.CollectionID === id))?.data.find(i => i.CollectionID === id)?.CollectionName) || 'N/A',
                        'Ref_Version': (masterItem.DataVersion !== undefined && masterItem.DataVersion !== null) ? masterItem.DataVersion : 'N/A',
                        'Ref_Count': (masterItem.ItemsCount !== undefined && masterItem.ItemsCount !== null) ? masterItem.ItemsCount : 'N/A'
                    };

                    results.forEach(r => {
                        if (r.isMaster) return;
                        const item = r.data.find(i => i.CollectionID === id);

                        const versionVal = (item && item.DataVersion !== undefined && item.DataVersion !== null) ? item.DataVersion : 'N/A';
                        const countVal = (item && item.ItemsCount !== undefined && item.ItemsCount !== null) ? item.ItemsCount : 'N/A';

                        row[`${r.label}_Version`] = versionVal;
                        row[`${r.label}_Count`] = countVal;

                        // Add comparison status
                        const masterVersion = masterItem.DataVersion;
                        const masterCount = masterItem.ItemsCount;

                        const versionsMatch = (item && item.DataVersion === masterVersion) || (!item && masterVersion === undefined);
                        const countsMatch = (item && item.ItemsCount === masterCount) || (!item && masterCount === undefined);

                        row[`${r.label}_Status`] = (versionsMatch && countsMatch) ? 'OK' : 'DIFF';
                    });

                    comparisonData.push(row);
                });

                // Filter by collectionIds BEFORE processing (paging/sorting)
                const defaultIds = ['10', '13', '131', '132', '137', '14', '19', '21', '22', '52', '65', '66'];
                let requestedIds = req.body.collectionIds;

                // If it's the initial call (req.body empty or missing collectionIds), use defaultIds
                if (requestedIds === undefined || requestedIds === null) {
                    requestedIds = defaultIds;
                } else if (typeof requestedIds === 'string' && requestedIds.trim() !== '') {
                    // Handle comma-separated string from frontend
                    requestedIds = requestedIds.split(',').map(s => s.trim());
                } else if (!Array.isArray(requestedIds)) {
                    // Safety for unexpected types
                    requestedIds = defaultIds;
                }

                let filteredComparisonData = comparisonData;
                // Only filter if requestedIds is an array and not empty (empty usually means "nothing selected" but we use it for "default subset")
                if (Array.isArray(requestedIds) && requestedIds.length > 0) {
                    filteredComparisonData = comparisonData.filter(row => {
                        const rowId = String(row.CollectionID).trim();
                        return requestedIds.includes(rowId);
                    });
                }

                const processedResult = processReportData(filteredComparisonData, req.body);
                return res.json(processedResult);
            } catch (err) {
                console.error('[API] compare_masterdata failed:', err);
                return res.status(500).json({ msg: 'Report execution failed' });
            }
        }

        if (req.params.id === 'license_expired_10') {
            const days = parseInt(req.body.days) || 10;
            console.log(`[API] Fetching License Report. days=${days}`);

            try {
                // Attempt real query
                const request = new sql.Request();
                request.input('days', sql.Int, days);
                console.log(`[API] Executing query: SELECT ... FROM [dbo].[f_GetLicenseExpired](${days})`);

                const result = await request.query('SELECT CODE,NAME,LICENSETYPE,EXPIREDDATE,EXPIREDINDAY FROM [dbo].[f_GetLicenseExpired](@days)');

                console.log(`[API] Query successful. Rows returned: ${result.recordset.length}`);
                return res.json(result.recordset);

            } catch (dbErr) {
                console.error('[API] Database query failed:', dbErr);
                console.log('[API] Falling back to Mock Data due to error');

                // Mock Data for fallback
                const mockLicenseData = [
                    { CODE: 'LIC001', NAME: 'Software A (MOCK)', LICENSETYPE: 'Subscription', EXPIREDDATE: '2023-12-31', EXPIREDINDAY: 5 },
                    { CODE: 'LIC002', NAME: 'Module B (MOCK)', LICENSETYPE: 'Perpetual', EXPIREDDATE: '2024-01-02', EXPIREDINDAY: 7 }
                ];
                return res.json(mockLicenseData);
            }
        }

        if (req.params.id === 'data_reconciliation') {
            const shiftdate = req.body.shiftdate || todayStr;
            console.log(`[API] Executing Data Reconciliation for: ${shiftdate}`);

            try {
                // 1. Fetch MSSQL Data
                const mssqlQuery = `SELECT * FROM dbo.f_getRevenuByDayForCompare(@shiftdate)`;
                const mssqlRequest = new sql.Request();
                mssqlRequest.input('shiftdate', sql.Date, shiftdate);
                const mssqlResult = await mssqlRequest.query(mssqlQuery);
                const mssqlData = mssqlResult.recordset;
                console.log(`[API] MSSQL Data fetched: ${mssqlData.length} rows`);

                // 2. Fetch PostgreSQL Data
                let pgData = [];
                try {
                    // Try with schema if user insists, or fallback to default search path
                    const pgQuery = `SELECT * FROM public.f_getRevenuByDayForCompare($1)`;
                    const pgResult = await pgPool.query(pgQuery, [shiftdate]);
                    pgData = pgResult.rows;
                } catch (pgErr) {
                    console.warn('[API] Failed with dbo schema, trying default search path...', pgErr.message);
                    try {
                        const pgQueryRetry = `SELECT * FROM f_getRevenuByDayForCompare($1)`;
                        const pgResultRetry = await pgPool.query(pgQueryRetry, [shiftdate]);
                        pgData = pgResultRetry.rows;
                    } catch (err2) {
                        console.error('[API] PG Retry failed:', err2);
                        throw err2; // Re-throw if both fail
                    }
                }
                console.log(`[API] PG Data fetched: ${pgData.length} rows`);

                if (mssqlData.length > 0) {
                    console.log('[API] MSSQL Sample Keys:', Object.keys(mssqlData[0]));
                }
                if (pgData.length > 0) {
                    console.log('[API] PG Sample Keys:', Object.keys(pgData[0]));
                }

                // 3. Comparison Logic
                // Helper to get value case-insensitively
                const getValCI = (row, key) => {
                    if (!row) return undefined;
                    if (row[key] !== undefined) return row[key];
                    const lowerKey = key.toLowerCase();
                    const foundKey = Object.keys(row).find(k => k.toLowerCase() === lowerKey);
                    return foundKey ? row[foundKey] : undefined;
                };

                // Map both lists by restaurantident
                const allIds = new Set();
                mssqlData.forEach(r => {
                    const id = getValCI(r, 'restaurantident');
                    if (id) allIds.add(id);
                });
                pgData.forEach(r => {
                    const id = getValCI(r, 'restaurantident');
                    if (id) allIds.add(id);
                });

                const comparisonResults = [];
                allIds.forEach(id => {
                    // Use loose equality for ID matching in case of string/number differences
                    const msRow = mssqlData.find(r => getValCI(r, 'restaurantident') == id) || {};
                    const pgRow = pgData.find(r => getValCI(r, 'restaurantident') == id) || {};

                    const row = {
                        restaurantident: id,
                        restaurantname: getValCI(msRow, 'restaurantname') || getValCI(pgRow, 'restaurantname') || 'Unknown',
                        shiftdate: shiftdate,

                        // Check Count
                        MS_checkcount: getValCI(msRow, 'checkcount'),
                        PG_checkcount: getValCI(pgRow, 'checkcount'),

                        // Guest Count
                        MS_guestcount: getValCI(msRow, 'guestcount'),
                        PG_guestcount: getValCI(pgRow, 'guestcount'),

                        // PrListSum
                        MS_prlistsum: getValCI(msRow, 'prlistsum'),
                        PG_prlistsum: getValCI(pgRow, 'prlistsum'),

                        // DiscountSum
                        MS_discountsum: getValCI(msRow, 'discountsum'),
                        PG_discountsum: getValCI(pgRow, 'discountsum'),

                        // TaxSumAdded
                        MS_taxsumadded: getValCI(msRow, 'taxsumadded'),
                        PG_taxsumadded: getValCI(pgRow, 'taxsumadded'),

                        // PaidSum
                        MS_paidsum: getValCI(msRow, 'paidsum'),
                        PG_paidsum: getValCI(pgRow, 'paidsum'),
                    };
                    comparisonResults.push(row);
                });

                // Filter: Show only different
                const showOnlyDifferent = req.body.showOnlyDifferent !== false; // Default true
                let finalResults = comparisonResults;

                if (showOnlyDifferent) {
                    finalResults = comparisonResults.filter(row => {
                        const msMissing = row.MS_checkcount === undefined || row.MS_checkcount === null;
                        const pgMissing = row.PG_checkcount === undefined || row.PG_checkcount === null;

                        if (msMissing || pgMissing) return true;

                        // Helper for numeric comparison
                        const isDiff = (val1, val2) => {
                            const n1 = parseFloat(val1);
                            const n2 = parseFloat(val2);
                            if (isNaN(n1) && isNaN(n2)) return false; // Both NaN = Equal
                            if (isNaN(n1) || isNaN(n2)) return true; // One NaN = Diff
                            return Math.abs(n1 - n2) > 0.01;
                        };

                        return isDiff(row.MS_checkcount, row.PG_checkcount) ||
                            isDiff(row.MS_discountsum, row.PG_discountsum) ||
                            isDiff(row.MS_taxsumadded, row.PG_taxsumadded) ||
                            isDiff(row.MS_paidsum, row.PG_paidsum);
                    });
                }

                // Explicit Column Order
                const customColumns = [
                    'restaurantident', 'restaurantname', 'shiftdate',
                    'MS_checkcount', 'PG_checkcount',
                    'MS_guestcount', 'PG_guestcount',
                    'MS_prlistsum', 'PG_prlistsum',
                    'MS_discountsum', 'PG_discountsum',
                    'MS_taxsumadded', 'PG_taxsumadded',
                    'MS_paidsum', 'PG_paidsum'
                ];

                const processed = processReportData(finalResults, req.body);
                processed.columns = customColumns;

                return res.json(processed);

            } catch (err) {
                console.error('[API] Data Reconciliation failed:', err);
                return res.status(500).json({ msg: 'Report execution failed' });
            }
        }





        if (req.params.id === 'restaurant_list') {
            const page = parseInt(req.body.page) || 1;
            const pageSize = parseInt(req.body.pageSize) || 50;
            const skip = (page - 1) * pageSize;

            console.log(`[API] Fetching Restaurant List (Page ${page}, Size ${pageSize})`);
            try {
                let statusFilter = req.body.status || '3';
                const statusArray = statusFilter.split(',').map(s => parseInt(s)).filter(n => !isNaN(n));
                const safeStatusString = statusArray.length > 0 ? statusArray.join(',') : '3';

                // Count Query
                const countQuery = `SELECT COUNT(*) as total FROM [dbo].[f_GetRestaurantsList]() WHERE STATUS IN (${safeStatusString})`;
                const countResult = await sql.query(countQuery);
                const total = countResult.recordset[0].total;

                // Data Query with Pagination
                const query = `
                    SELECT CODE, SIFR, NAME, SEITOCODE,
                    CASE STATUS
                        WHEN 3 THEN 'Active'
                        WHEN 2 THEN 'Inactive'
                        WHEN 1 THEN 'Deleted'
                        WHEN 0 THEN 'Draft'
                        ELSE 'NotDefine' 
                    END as Status 
                    FROM [dbo].[f_GetRestaurantsList]()
                    WHERE STATUS IN (${safeStatusString})
                    ORDER BY CODE
                    OFFSET ${skip} ROWS FETCH NEXT ${pageSize} ROWS ONLY
                `;
                console.log('[API] Executing Restaurant List Query');
                const result = await sql.query(query);
                return res.json({ data: result.recordset, total });

            } catch (err) {
                console.error('[API] Restaurant List Query Failed:', err);
                const mock = [
                    { CODE: 'R001', SIFR: '101', NAME: 'Downtown Grill', SEITOCODE: 'SG01', Status: 'Active' },
                    { CODE: 'R002', SIFR: '102', NAME: 'City Wok', SEITOCODE: 'SG02', Status: 'Inactive' }
                ];
                return res.json({ data: mock, total: mock.length });
            }
        }

        if (req.params.id === 'bo_101') {
            console.log(`[API] Fetching BO.101 Report`);
            try {
                const dateFrom = req.body.dateFrom;
                const dateTo = req.body.dateTo;
                const restaurantsStr = req.body.restaurants || '';
                const conceptsStr = req.body.concepts || '';
                const regionsStr = req.body.regions || '';
                const franchisesStr = req.body.franchises || '';

                const request = new sql.Request();
                request.input('DateFrom', sql.Date, dateFrom);
                request.input('DateTo', sql.Date, dateTo);

                const createGuidListTVP = (listStr) => {
                    const tvp = new sql.Table();
                    tvp.columns.add('GUIDSTRING', sql.NVarChar(38));
                    if (listStr) {
                        listStr.split(',').forEach(guid => {
                            if (guid.trim()) tvp.rows.add(guid.trim());
                        });
                    }
                    return tvp;
                };

                request.input('Restaurants', createGuidListTVP(restaurantsStr));
                request.input('Concepts', createGuidListTVP(conceptsStr));
                request.input('Regions', createGuidListTVP(regionsStr));
                request.input('Franchises', createGuidListTVP(franchisesStr));
                request.timeout = 30000000;

                const result = await request.execute('dbo.sp_BO101_Report_Sales_By_Shift');

                // Process in Node
                const processed = processReportData(result.recordset, req.body);
                console.log(`[API] BO.101 Success. Total: ${processed.total}, Returning: ${processed.data.length}`);
                return res.json(processed);

            } catch (err) {
                console.error('[API] BO.101 Failed:', err);
                return res.status(500).json({ msg: 'Report execution failed' });
            }
        }

        if (req.params.id === 'bo_104') {
            console.log(`[API] Fetching BO.104 Report`);
            try {
                const dateFrom = req.body.dateFrom;
                const dateTo = req.body.dateTo;
                const restaurantsStr = req.body.restaurants || '';
                const conceptsStr = req.body.concepts || '';
                const regionsStr = req.body.regions || '';
                const franchisesStr = req.body.franchises || '';

                const request = new sql.Request();
                request.input('DateFrom', sql.Date, dateFrom);
                request.input('DateTo', sql.Date, dateTo);

                const createGuidListTVP = (listStr) => {
                    const tvp = new sql.Table();
                    tvp.columns.add('GUIDSTRING', sql.NVarChar(38));
                    if (listStr) {
                        listStr.split(',').forEach(guid => {
                            if (guid.trim()) tvp.rows.add(guid.trim());
                        });
                    }
                    return tvp;
                };

                request.input('Restaurants', createGuidListTVP(restaurantsStr));
                request.input('Concepts', createGuidListTVP(conceptsStr));
                request.input('Regions', createGuidListTVP(regionsStr));
                request.input('Franchises', createGuidListTVP(franchisesStr));
                request.timeout = 30000000;

                const result = await request.execute('dbo.sp_RP_BO_104_Doanh_Thu_Theo_Chi_Tiet_Hoa_Don');

                // Process in Node
                const processed = processReportData(result.recordset, req.body);
                console.log(`[API] BO.104 Success. Total: ${processed.total}, Returning: ${processed.data.length}`);
                return res.json(processed);

            } catch (err) {
                console.error('[API] BO.104 Failed:', err);
                return res.status(500).json({ msg: 'Report execution failed' });
            }
        }


        if (req.params.id === 'common_shift_info') {
            console.log(`[API] Fetching Common Shift Info Report`);
            try {
                const date = req.body.date || new Date().toISOString().split('T')[0];
                const request = new sql.Request();
                request.input('date', sql.Date, date);

                let query = `SELECT * FROM [dbo].[GetCommonShiftInfoClosed](@date)`;

                // Handle CLOSED status filter
                const closedStatus = req.body.closedStatus;
                if (closedStatus) {
                    const allowed = ['NOT CLOSE', 'CLOSED'];
                    const statuses = closedStatus.split(',')
                        .map(s => s.trim())
                        .filter(s => allowed.includes(s))
                        .map(s => `'${s}'`)
                        .join(',');

                    if (statuses) {
                        query += ` WHERE CLOSED IN (${statuses})`;
                    }
                }

                console.log(`[API] Executing: ${query} with date='${date}'`);
                const result = await request.query(query);

                const processed = processReportData(result.recordset, req.body);
                console.log(`[API] Common Shift Info Success. Rows: ${processed.data.length}`);
                return res.json(processed);

            } catch (err) {
                console.error('[API] Common Shift Info Failed:', err);
                return res.status(500).json({ msg: 'Report execution failed' });
            }
        }

        if (req.params.id === 'online_compare') {
            console.log(`[API] Fetching Online Data Compare Report`);
            try {
                const shiftdate = req.body.shiftdate || new Date().toISOString().split('T')[0];

                // 1. Fetch from MSSQL (Sky)
                const msRequest = new sql.Request();
                msRequest.input('shiftdate', sql.Date, shiftdate);
                const msResult = await msRequest.query('SELECT * FROM dbo.f_getskyonlinedata(@shiftdate)');
                const msData = msResult.recordset;

                // 2. Fetch from PG (Cloud)
                let pgData = [];
                try {
                    const pgResult = await pgPool.query('SELECT * FROM f_getskyonlinedata($1)', [shiftdate]);
                    pgData = pgResult.rows;
                } catch (pgErr) {
                    console.error('[API] PostgreSQL Query failed, proceeding with empty PG data:', pgErr);
                }

                // (getVal is now global)

                // 3. Merge Data
                const pgMap = new Map();
                pgData.forEach(row => {
                    // Try to find restaurantid or restaurant_id in PG row
                    const rid = getVal(row, 'restaurantid');
                    const pgId = (rid !== undefined && rid !== null) ? String(rid).trim() : null;
                    if (pgId) pgMap.set(pgId, row);
                });

                console.log(`[API] Online Compare: SQL Rows=${msData.length}, PG Rows=${pgData.length}, PG Map Size=${pgMap.size}`);

                const combinedData = msData.map(msRow => {
                    const rid = getVal(msRow, 'restaurant_id');
                    const msId = (rid !== undefined && rid !== null) ? String(rid).trim() : null;
                    const pgRowData = msId ? (pgMap.get(msId) || null) : null;

                    const skyCheck = getVal(msRow, 'SKYCHECK');
                    const skyOrder = getVal(msRow, 'SKYORDER');
                    const pgCheck = pgRowData ? getVal(pgRowData, 'checknumber') : null;
                    const pgOrder = pgRowData ? getVal(pgRowData, 'ordernum') : null;

                    return {
                        RESTAURANT_ID: rid,
                        RESTAURANT_CODE: getVal(msRow, 'restaurant_code'),
						REGION: getVal(msRow, 'region') || (pgRowData ? getVal(pgRowData, 'region') : null) || 'Unknown',
                        RESTAURANT_NAME: getVal(msRow, 'restaurant_name'),
                        COMPARE: !!pgRowData ? "Compared" : "No data rkDtaFlow",
                        SOURCE_SQL_EXISTS: true,
                        SOURCE_PG_EXISTS: !!pgRowData,

                        SKY_CHECK: skyCheck,
                        SKY_ORDER: skyOrder,

                        PG_CHECK: pgCheck,
                        PG_ORDER: pgOrder,

                        DIFF_CHECK: (Number(skyCheck) || 0) - (Number(pgCheck) || 0),
                        DIFF_ORDER: (Number(skyOrder) || 0) - (Number(pgOrder) || 0),

                        PG_SHIFT_NUM: pgRowData ? getVal(pgRowData, 'shiftnum') : null,
                        PG_MIDSERVER_ID: pgRowData ? getVal(pgRowData, 'midserverid') : null
                    };
                });

                // Add rows from PG that are not in MSSQL
                const msIds = new Set(msData.map(r => {
                    const rid = getVal(r, 'restaurant_id');
                    return (rid !== undefined && rid !== null) ? String(rid).trim() : null;
                }).filter(id => id !== null));

                pgData.forEach(row => {
                    const rid = getVal(row, 'restaurantid');
                    const pgId = (rid !== undefined && rid !== null) ? String(rid).trim() : null;

                    if (pgId && !msIds.has(pgId)) {
                        const pgCheck = getVal(row, 'checknumber');
                        const pgOrder = getVal(row, 'ordernum');

                        combinedData.push({
                            RESTAURANT_ID: rid,
                            RESTAURANT_CODE: getVal(row, 'restaurantrkcode'),
							REGION: getVal(row, 'region') || 'Unknown',
                            RESTAURANT_NAME: getVal(row, 'restaurantname'),
                            COMPARE: "No data SkyOnline",
                            SOURCE_SQL_EXISTS: false,
                            SOURCE_PG_EXISTS: true,

                            SKY_CHECK: null,
                            SKY_ORDER: null,
                            PG_CHECK: pgCheck,
                            PG_ORDER: pgOrder,
                            DIFF_CHECK: 0 - (Number(pgCheck) || 0),
                            DIFF_ORDER: 0 - (Number(pgOrder) || 0),
                            PG_SHIFT_NUM: getVal(row, 'shiftnum'),
                            PG_MIDSERVER_ID: getVal(row, 'midserverid')
                        });
                    }
                });

                // Explicit Columns for consistency (matches frontend hidden logic)
                const columns = [
                    'RESTAURANT_ID', 'RESTAURANT_CODE', 'REGION','RESTAURANT_NAME', 'COMPARE',
                    'SOURCE_SQL_EXISTS', 'SOURCE_PG_EXISTS',
                    'SKY_CHECK', 'SKY_ORDER', 'PG_CHECK', 'PG_ORDER',
                    'DIFF_CHECK', 'DIFF_ORDER', 'PG_SHIFT_NUM', 'PG_MIDSERVER_ID'
                ];

                const processed = processReportData(combinedData, req.body);
                processed.columns = columns; // Ensure all technical columns are listed

                console.log(`[API] Online Compare Success. Total: ${processed.total}, Unique Statuses: ${JSON.stringify(processed.uniqueValues ? processed.uniqueValues.COMPARE : 'N/A')}`);
                return res.json(processed);

            } catch (err) {
                console.error('[API] Online Compare Failed:', err);
                return res.status(500).json({ msg: 'Report execution failed' });
            }
        }

        // Mock Data
        const mockData = {
            1: [
                { date: '2023-01-01', sales: 1200, orders: 45 },
                { date: '2023-01-02', sales: 1350, orders: 52 },
            ],
            2: [
                { item: 'Widget A', quantity: 50 },
                { item: 'Widget B', quantity: 20 },
            ],
            3: [
                { employee: 'John Doe', rating: 4.5 },
                { employee: 'Jane Smith', rating: 4.8 },
            ]
        };

        const data = mockData[req.params.id] || [];
        res.json(data);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
