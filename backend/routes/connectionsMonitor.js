'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { buildTree, computeSummary, DEFAULT_MAX_DEPTH } = require('../services/connectionsMonitor');

const router = express.Router();
const CONFIG_PATH = path.join(__dirname, '../config/connection_check_sources.json');

function loadSources() {
  if (!fs.existsSync(CONFIG_PATH)) return [];
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// @route   GET /api/reports/connections-monitor/roots
// @desc    List configured root servers (Reference/Report Server) for the dropdown
router.get('/roots', (_req, res) => {
  try {
    const sources = loadSources();
    const roots = sources
      .filter(s => s.isRoot)
      .map(({ networkName, ip, port, label }) => ({ networkName, ip, port, label }));
    res.json(roots);
  } catch (err) {
    console.error('[connections-monitor] Failed to load roots:', err.message);
    res.status(500).json({ error: 'Failed to load root list' });
  }
});

// @route   POST /api/reports/connections-monitor/run
// @desc    Recursively walk /Connects starting from a configured root, returns a tree
router.post('/run', async (req, res) => {
  try {
    const { rootNetworkName, maxDepth } = req.body || {};
    if (!rootNetworkName) {
      return res.status(400).json({ error: 'rootNetworkName is required' });
    }

    const sources = loadSources();
    const rootEntry = sources.find(s => s.isRoot && s.networkName === rootNetworkName);
    if (!rootEntry) {
      return res.status(400).json({ error: `Root '${rootNetworkName}' not found in configuration` });
    }

    const sourcesByName = new Map(sources.map(s => [s.networkName, s]));
    const depth = Number.isInteger(maxDepth) && maxDepth > 0 ? maxDepth : DEFAULT_MAX_DEPTH;

    const root = await buildTree(rootEntry, depth, sourcesByName);
    const summary = computeSummary(root);

    res.json({ runAt: new Date().toISOString(), root, summary });
  } catch (err) {
    console.error('[connections-monitor] run failed:', err.message);
    res.status(500).json({ error: 'Failed to run connections monitor' });
  }
});

module.exports = router;
