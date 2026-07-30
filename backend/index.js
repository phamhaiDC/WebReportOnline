const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const { connectDB } = require('./config/db');
const reportsRoutes = require('./routes/reports');
const authRoutes = require('./routes/auth'); // Import auth routes

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5577;

// Origin frontend được phép gọi API — dev chạy local (vite, port 80 theo frontend/vite.config.js),
// production hiện tại là vtiinfo.dcorp.com.vn qua HTTP thuần (chưa bật HTTPS — khi bật, origin
// https:// bên dưới sẽ dùng được luôn, không cần sửa lại đoạn này).
const ALLOWED_ORIGINS = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
    'http://vtiinfo.dcorp.com.vn',
    'https://vtiinfo.dcorp.com.vn',
];

// Middleware
app.use(helmet({
    // API JSON thuần (không serve HTML) — CSP không có tác dụng thật ở đây, tắt cho khỏi nhiễu.
    contentSecurityPolicy: false,
    // Frontend (port 80) và backend (port 5577) khác origin nhau theo đúng thiết kế — nếu để mặc
    // định 'same-origin', Chrome sẽ tự chặn fetch cross-origin dù CORS header đã đúng (CORP là lớp
    // kiểm tra độc lập với CORS).
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
    origin(origin, callback) {
        // Không có Origin header (curl, gọi server-to-server, Postman...) — CORS chỉ áp dụng cho
        // trình duyệt nên không cần chặn ở đây; đây KHÔNG phải lớp xác thực, chỉ chặn web lạ đọc
        // response qua trình duyệt người dùng.
        if (!origin) return callback(null, true);
        const allowed = ALLOWED_ORIGINS.some((o) => (o instanceof RegExp ? o.test(origin) : o === origin));
        // Luôn callback(null, ...) — KHÔNG truyền Error, nếu không cors sẽ next(err) và rơi vào
        // default error handler của Express, lộ stack trace (đường dẫn file server) ra response.
        // allowed=false chỉ đơn giản là không gắn header Access-Control-Allow-Origin, khiến trình
        // duyệt tự chặn JS đọc response — server vẫn xử lý request bình thường phía dưới.
        callback(null, allowed);
    },
}));
app.use(express.json());

// Database Connection
connectDB();

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/reports/connections-monitor', require('./routes/connectionsMonitor'));
app.use('/api/reports/rk7-usage', require('./routes/rk7Usage'));
app.use('/api/reports/ref-connection-log', require('./routes/refConnectionLog'));
app.use('/api/ecode/coupon-usage', require('./routes/ecodeCouponUsage'));
app.use('/api/ecode/coupon-check', require('./routes/ecodeCouponCheck'));
app.use('/api/ecode', require('./routes/ecodeCouponFlag'));
app.use('/api/ecode', require('./routes/ecodeCouponAudit'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/healthcheck', require('./routes/healthcheck'));
app.use('/api/superset-guest-token', require('./routes/superset'));
app.use('/api/script-changelog', require('./routes/scriptChangelog'));

// Health Check
app.get('/', (req, res) => {
    res.send('WebReportOnline API is running');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`API accessible at http://0.0.0.0:${PORT}`);
});
