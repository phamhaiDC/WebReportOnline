const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');

// @route   GET /api/reports/rk7-usage/filtertypes
// @desc    List FILTERTYPE values that have data in dbo.v_object_usage, with row counts
router.get('/filtertypes', async (req, res) => {
    try {
        const result = await sql.query(`
            SELECT FILTERTYPE, MIN(ObjectTypeName) AS ObjectTypeName, COUNT(*) AS count
            FROM dbo.v_object_usage
            GROUP BY FILTERTYPE
            ORDER BY FILTERTYPE
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('[Rk7Usage] /filtertypes error:', err);
        res.status(500).json({ message: 'Failed to load filter types' });
    }
});

// @route   GET /api/reports/rk7-usage/usage?filtertype=NN
// @desc    Object Usage rows for a single FILTERTYPE, sorted by PRIORITY ascending
router.get('/usage', async (req, res) => {
    const filtertype = parseInt(req.query.filtertype, 10);
    if (Number.isNaN(filtertype)) {
        return res.status(400).json({ message: 'filtertype query param is required and must be an integer' });
    }
    try {
        const request = new sql.Request();
        request.input('filtertype', sql.Int, filtertype);
        const result = await request.query(`
            SELECT *
            FROM dbo.v_object_usage
            WHERE FILTERTYPE = @filtertype
            ORDER BY PRIORITY ASC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('[Rk7Usage] /usage error:', err);
        res.status(500).json({ message: 'Failed to load object usage data' });
    }
});

module.exports = router;
