const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { connectDB } = require('./config/db');
const reportsRoutes = require('./routes/reports');
const authRoutes = require('./routes/auth'); // Import auth routes

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5577;

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
connectDB();

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/reports/connections-monitor', require('./routes/connectionsMonitor'));
app.use('/api/reports/rk7-usage', require('./routes/rk7Usage'));
app.use('/api/ecode/coupon-usage', require('./routes/ecodeCouponUsage'));
app.use('/api/ecode/coupon-check', require('./routes/ecodeCouponCheck'));
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
