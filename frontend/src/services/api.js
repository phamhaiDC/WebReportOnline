import axios from 'axios';

const api = axios.create({
    baseURL: `${window.location.protocol}//${window.location.hostname}:5577/api`,
});

export const getReports = async () => {
    const response = await api.get('/reports');
    return response.data;
};

export const getReportDetails = async (id, params = {}) => {
    const response = await api.post(`/reports/${id}`, params);
    return response.data;
};

export const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
};

export const rollCall = () => {
    // Keep alive or check connection
    return api.get('/');
};

export const getHealthCheckInstances = () => api.get('/healthcheck/instances').then(r => r.data);

export const runHealthCheck = (instanceKey, sections) =>
    api.post('/healthcheck/run', { instanceKey, sections }).then(r => r.data);

export const getConnectionsMonitorRoots = () =>
    api.get('/reports/connections-monitor/roots').then(r => r.data);

export const runConnectionsMonitor = (rootNetworkName, maxDepth) =>
    api.post('/reports/connections-monitor/run', { rootNetworkName, maxDepth }).then(r => r.data);

export const getEcodeTodayLive = () =>
    api.get('/ecode/coupon-usage/today-live').then(r => r.data);

export const getEcodeHourly = (days = 7) =>
    api.get('/ecode/coupon-usage/hourly', { params: { days } }).then(r => r.data);

export const getEcodeKpi = () =>
    api.get('/ecode/coupon-usage/kpi').then(r => r.data);

export const getEcodeHeatmap = (weeks = 12) =>
    api.get('/ecode/coupon-usage/heatmap', { params: { weeks } }).then(r => r.data);

export const getEcodeDailyTrend = (days = 14) =>
    api.get('/ecode/coupon-usage/daily-trend', { params: { days } }).then(r => r.data);

export const getEcodeMonthly = (year = new Date().getFullYear()) =>
    api.get('/ecode/coupon-usage/monthly', { params: { year } }).then(r => r.data);

export const getEcodeCheck = (ecode) =>
    api.get('/ecode/coupon-check', { params: { ecode } }).then(r => r.data);

export const getEcodeCaptcha = (signal) =>
    api.get('/ecode/captcha', { signal }).then(r => r.data);

export const toggleEcodeCouponFlag = ({ couponId, captchaId, captchaAnswer, expectedOldFlags }) =>
    api.post('/ecode/toggle-flag', { couponId, captchaId, captchaAnswer, expectedOldFlags }).then(r => r.data);

export const getEcodeCouponAudit = (couponId) =>
    api.get('/ecode/audit', { params: { couponId } }).then(r => r.data);

export const getEcodeAuditHistory = ({ days, ecode } = {}) =>
    api.get('/ecode/audit-history', { params: ecode ? { ecode } : { days } }).then(r => r.data);

export const getSupersetGuestToken = () =>
    api.get('/superset-guest-token').then(r => r.data);

export const getScriptChangelogScripts = () =>
    api.get('/script-changelog/scripts').then(r => r.data);

export const getScriptChangelogStats = () =>
    api.get('/script-changelog/stats').then(r => r.data);

export const getScriptChangelogScript = (ident) =>
    api.get(`/script-changelog/scripts/${ident}`).then(r => r.data);

export const getScriptChangelogHistory = (ident) =>
    api.get(`/script-changelog/scripts/${ident}/history`).then(r => r.data);

export const getRk7UsageFilterTypes = () =>
    api.get('/reports/rk7-usage/filtertypes').then(r => r.data);

export const getRk7Usage = (filtertype) =>
    api.get('/reports/rk7-usage/usage', { params: { filtertype } }).then(r => r.data);

export default api;
