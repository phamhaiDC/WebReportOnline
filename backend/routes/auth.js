const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const axios = require('axios');
const https = require('https');
require('dotenv').config();

// Configuration variables
const RK7_API_URL = process.env.RK7_API_URL || 'https://61.28.227.20:3988/rk7api/v0/xmlinterface.xml';
//const RK7_API_URL = process.env.RK7_API_URL || 'https://61.28.235.59:4501/rk7api/v0/xmlinterface.xml';

//const RK7_API_URL = process.env.RK7_API_URL || 'https://10.251.14.4:6690/rk7api/v0/xmlinterface.xml';
const RK7_API_TIMEOUT = parseInt(process.env.RK7_API_TIMEOUT, 10) || 30000;

// Create axios instance with custom HTTPS agent to handle self-signed certificates
const httpsAgent = new https.Agent({
    rejectUnauthorized: false // Accept self-signed certificates
});

// @route   POST /api/auth/login
// @desc    Authenticate user via SQL validation and RK7 API
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    try {
        console.log(`[Auth] Login attempt for: ${email}`);

        // ============================================================
        // STEP 1: Validate Employee by Email (SQL)
        // ============================================================
        const request = new sql.Request();
        request.input('Email', sql.NVarChar(255), email);

        const sqlQuery = `SELECT * FROM dbo.f_getEmployeeByEmail(@Email)`;
        const sqlResult = await request.query(sqlQuery);

        console.log(`[Auth] SQL Result: ${sqlResult.recordset.length} record(s) found`);

        // Validation Rule 1: No record returned
        if (sqlResult.recordset.length === 0) {
            console.log(`[Auth] No employee found for email: ${email}`);
            return res.status(401).json({
                success: false,
                message: 'User not found or inactive'
            });
        }

        // Validation Rule 2: Multiple records returned (data inconsistency)
        if (sqlResult.recordset.length > 1) {
            console.error(`[Auth] Multiple records found for email: ${email}`);
            return res.status(500).json({
                success: false,
                message: 'Data inconsistency error. Please contact administrator.'
            });
        }

        // Get the employee record
        const employee = sqlResult.recordset[0];
        const { CODE, Name, EMPLOYEEEMAIL, STATUS } = employee;

        console.log(`[Auth] Employee found - CODE: ${CODE}, Name: ${Name}, STATUS: ${STATUS}`);

        // Validation Rule 3: STATUS must be 3 (active)
        if (STATUS !== 3) {
            console.log(`[Auth] Employee status is not active. STATUS: ${STATUS}`);
            return res.status(401).json({
                success: false,
                message: 'User account is not active'
            });
        }

        // ============================================================
        // STEP 2: Authenticate via HTTP POST (RK7 API)
        // ============================================================
        console.log(`[Auth] Authenticating with RK7 API for user: ${Name}`);

        const xmlRequestBody = `<?xml version="1.0" encoding="UTF-8"?>
<RK7Query>
    <RK7CMD CMD="GetFunctions"/>
</RK7Query>`;

        let apiResponse;
        try {
            apiResponse = await axios.post(RK7_API_URL, xmlRequestBody, {
                auth: {
                    username: Name,
                    password: password // Use plain password (no hashing)
                },
                headers: {
                    'Content-Type': 'text/plain'
                },
                timeout: RK7_API_TIMEOUT,
                httpsAgent: httpsAgent
            });
        } catch (apiError) {
            console.error(`[Auth] RK7 API request failed:`, apiError.message);

            // Handle specific HTTP errors
            if (apiError.response) {
                console.error(`[Auth] API Response Status: ${apiError.response.status}`);
                return res.status(401).json({
                    success: false,
                    message: 'Authentication failed'
                });
            }

            // Network or timeout error
            return res.status(500).json({
                success: false,
                message: 'Authentication service unavailable'
            });
        }

        // ============================================================
        // STEP 3: Login Result Evaluation
        // ============================================================
        console.log(`[Auth] RK7 API Response Status: ${apiResponse.status}`);
        console.log(`[Auth] RK7 API Response Data:`, apiResponse.data);

        // Check 1: HTTP status code = 200
        if (apiResponse.status !== 200) {
            console.log(`[Auth] Invalid API response status: ${apiResponse.status}`);
            return res.status(401).json({
                success: false,
                message: 'Authentication failed'
            });
        }

        // Check 2: Response body contains data
        if (!apiResponse.data) {
            console.log(`[Auth] API response body is empty`);
            return res.status(401).json({
                success: false,
                message: 'Authentication failed'
            });
        }

        // Check 3: Response contains Status="Ok"
        const responseString = typeof apiResponse.data === 'string'
            ? apiResponse.data
            : JSON.stringify(apiResponse.data);

        if (!responseString.includes('Status="Ok"')) {
            console.log(`[Auth] API response does not contain Status="Ok"`);
            return res.status(401).json({
                success: false,
                message: 'Authentication failed'
            });
        }

        // ============================================================
        // SUCCESS: All validations passed
        // ============================================================
        console.log(`[Auth] Login successful for: ${email}`);

        return res.json({
            success: true,
            user: {
                code: CODE,
                name: Name,
                email: EMPLOYEEEMAIL
            }
        });

    } catch (err) {
        console.error('[Auth] Server error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;

