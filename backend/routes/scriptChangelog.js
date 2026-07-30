'use strict';

const express = require('express');
const router = express.Router();
const { getVtirefPool, VTIREF_SCHEMA } = require('../config/vtirefDb');

// @route   GET /api/script-changelog/scripts
// @desc    List all unique scripts with their latest version + change status
router.get('/scripts', async (req, res) => {
    try {
        const pool = getVtirefPool();
        const query = `
            WITH latest AS (
              SELECT DISTINCT ON (ident) *
              FROM ${VTIREF_SCHEMA}.script_changelog
              ORDER BY ident, captured_at DESC, id DESC
            ),
            version_counts AS (
              SELECT ident, COUNT(*) as version_count,
                     MIN(captured_at) as first_seen,
                     MAX(captured_at) as last_modified
              FROM ${VTIREF_SCHEMA}.script_changelog
              GROUP BY ident
            )
            SELECT
              l.ident,
              l.code,
              l.name,
              l.gen_description,
              l.change_type,
              v.last_modified,
              v.first_seen,
              v.version_count,
              CASE WHEN v.version_count > 1 THEN 'modified' ELSE 'original' END as status
            FROM latest l
            JOIN version_counts v ON v.ident = l.ident
            ORDER BY
              CASE WHEN v.version_count > 1 THEN 0 ELSE 1 END,
              v.last_modified DESC,
              l.name ASC;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('[ScriptChangelog] Failed to fetch scripts:', err);
        res.status(500).json({ message: 'Failed to fetch scripts' });
    }
});

// @route   GET /api/script-changelog/stats
// @desc    Summary stats for the dashboard header
router.get('/stats', async (req, res) => {
    try {
        const pool = getVtirefPool();
        const query = `
            SELECT
              COUNT(DISTINCT ident) as total_scripts,
              COUNT(DISTINCT ident) FILTER (WHERE ident IN (
                SELECT ident FROM ${VTIREF_SCHEMA}.script_changelog GROUP BY ident HAVING COUNT(*) > 1
              )) as modified_scripts,
              COUNT(DISTINCT ident) FILTER (WHERE ident IN (
                SELECT ident FROM ${VTIREF_SCHEMA}.script_changelog GROUP BY ident HAVING COUNT(*) = 1
              )) as original_scripts,
              MAX(captured_at) as last_scan_time
            FROM ${VTIREF_SCHEMA}.script_changelog;
        `;
        const result = await pool.query(query);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[ScriptChangelog] Failed to fetch stats:', err);
        res.status(500).json({ message: 'Failed to fetch stats' });
    }
});

// @route   GET /api/script-changelog/scripts/:ident
// @desc    Get the latest version of a specific script
router.get('/scripts/:ident', async (req, res) => {
    try {
        const pool = getVtirefPool();
        const query = `
            SELECT * FROM ${VTIREF_SCHEMA}.script_changelog
            WHERE ident = $1
            ORDER BY captured_at DESC, id DESC
            LIMIT 1;
        `;
        const result = await pool.query(query, [req.params.ident]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Script not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[ScriptChangelog] Failed to fetch script:', err);
        res.status(500).json({ message: 'Failed to fetch script' });
    }
});

// @route   GET /api/script-changelog/scripts/:ident/history
// @desc    Get all versions of a script for diff comparison
router.get('/scripts/:ident/history', async (req, res) => {
    try {
        const pool = getVtirefPool();
        const query = `
            SELECT id, ident, code, name, gen_description, script_text, script_hash, change_type, captured_at
            FROM ${VTIREF_SCHEMA}.script_changelog
            WHERE ident = $1
            ORDER BY captured_at ASC, id ASC;
        `;
        const result = await pool.query(query, [req.params.ident]);
        res.json(result.rows);
    } catch (err) {
        console.error('[ScriptChangelog] Failed to fetch history:', err);
        res.status(500).json({ message: 'Failed to fetch history' });
    }
});

module.exports = router;
