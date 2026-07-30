const express = require('express');
const router = express.Router();
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
require('dotenv').config();

// Configuration variables
const SUPERSET_URL = process.env.SUPERSET_URL || 'https://superset-edu.dcorp.com.vn';
const SUPERSET_EMBED_ID = process.env.SUPERSET_EMBED_ID || '6b5a7f55-a79b-474e-8889-2d64671c9e7a';
const SUPERSET_SERVICE_USERNAME = process.env.SUPERSET_SERVICE_USERNAME || 'embed_service';
const SUPERSET_SERVICE_PASSWORD = process.env.SUPERSET_SERVICE_PASSWORD;

// Only letters/digits/underscore/dash allowed — this value is interpolated
// directly into a SQL RLS clause below, so it must never contain quotes or spaces.
const TENANT_ID_REGEX = /^[A-Za-z0-9_-]{1,50}$/;

// @route   GET /api/superset-guest-token
// @desc    Exchange the service account credentials for a Superset guest token
//          scoped to the embedded "Dashboard" report, so the frontend never
//          sees the service account password.
router.get('/', async (req, res) => {
    if (!SUPERSET_SERVICE_PASSWORD) {
        console.error('[Superset] SUPERSET_SERVICE_PASSWORD is not set');
        return res.status(500).json({ message: 'Superset service account is not configured' });
    }

    // TODO: replace with req.user.tenantId once the app has session/JWT auth wired up
    const tenantId = req.user?.tenantId || 'VTI';
    if (!TENANT_ID_REGEX.test(tenantId)) {
        console.error(`[Superset] Rejected invalid tenantId: ${tenantId}`);
        return res.status(400).json({ message: 'Invalid tenantId' });
    }

    try {
        // Shared cookie jar so the session cookie from step 2 (csrf_token) is
        // automatically attached to step 3 (guest_token) — Superset's CSRF
        // protection requires both the X-CSRFToken header AND its session cookie.
        const jar = new CookieJar();
        const client = wrapper(axios.create({ jar, withCredentials: true }));

        // Step 1: log in the service account to get an access token
        const loginResponse = await client.post(`${SUPERSET_URL}/api/v1/security/login`, {
            username: SUPERSET_SERVICE_USERNAME,
            password: SUPERSET_SERVICE_PASSWORD,
            provider: 'db',
            refresh: true
        });

        const accessToken = loginResponse.data.access_token;

        // Step 2: fetch a CSRF token (also populates the jar with the session cookie)
        const csrfResponse = await client.get(`${SUPERSET_URL}/api/v1/security/csrf_token/`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const csrfToken = csrfResponse.data.result;

        // Step 3: use the access token + CSRF token + session cookie to request a guest token
        const guestTokenResponse = await client.post(
            `${SUPERSET_URL}/api/v1/security/guest_token/`,
            {
                user: {
                    username: SUPERSET_SERVICE_USERNAME,
                    first_name: 'Embed',
                    last_name: 'User'
                },
                resources: [
                    { type: 'dashboard', id: SUPERSET_EMBED_ID }
                ],
                // TODO: bật lại RLS khi có nhiều tenant — thay bằng đúng tên cột
                // phân biệt khách trong dataset (VD store_code / RestaurantID)
                rls: []
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'X-CSRFToken': csrfToken
                }
            }
        );

        return res.json({ token: guestTokenResponse.data.token });

    } catch (err) {
        console.error('[Superset] Guest token request failed:', err.response?.data || err.message);
        return res.status(500).json({
            message: 'Failed to obtain Superset guest token'
        });
    }
});

module.exports = router;
