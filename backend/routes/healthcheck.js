'use strict';

const express = require('express');
const { randomUUID } = require('crypto');
const sql = require('mssql');
const { HEALTH_CHECK_QUERIES } = require('../services/healthcheck/queries');
const { evaluateStatus, getOverallStatus } = require('../services/healthcheck/thresholds');

const router = express.Router();

// ---------------------------------------------------------------------------
// Instance config — built from individual env vars (DB_* and CRM_*)
// ---------------------------------------------------------------------------

let _instances = null;

function getInstances() {
  if (_instances !== null) return _instances;

  const list = [];

  // Instance 1: general (RK7_VTI) — biến dùng chung với config/db.js
  if (process.env.DB_SERVER && process.env.DB_USER) {
    list.push({
      key: 'general',
      name: process.env.DB_DATABASE || 'Database 1',
      host: process.env.DB_SERVER,
      port: parseInt(process.env.DB_PORT || '1433', 10),
      database: process.env.DB_DATABASE || '',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
    });
  }

  // Instance 2: crm (R_KEEPER_7_CRM_VTI) — key phải là 'crm' để section-B queries chạy
  if (process.env.CRM_SERVER && process.env.CRM_USER) {
    list.push({
      key: 'crm',
      name: process.env.CRM_DATABASE || 'CRM Database',
      host: process.env.CRM_SERVER,
      port: parseInt(process.env.CRM_PORT || '1433', 10),
      database: process.env.CRM_DATABASE || '',
      user: process.env.CRM_USER,
      password: process.env.CRM_PASSWORD || '',
    });
  }

  _instances = list;
  return _instances;
}

function buildMssqlConfig(inst) {
  return {
    server: inst.host,
    port: Number(inst.port) || 1433,
    user: inst.user,
    password: inst.password,
    database: inst.database,
    options: {
      trustServerCertificate: true,
      encrypt: true,
    },
    connectionTimeout: 15000,
    requestTimeout: 30000,
  };
}

// ---------------------------------------------------------------------------
// Metric extraction  (query id → evaluated metrics array)
// ---------------------------------------------------------------------------

function extractMetrics(queryId, rows) {
  const metrics = [];

  function push(key, ev, customLabel) {
    metrics.push({
      key,
      label: customLabel !== undefined ? customLabel : ev.label,
      value: ev.value,
      displayValue: ev.displayValue,
      status: ev.status,
    });
  }

  switch (queryId) {
    case 'A0': break;

    case 'A1': {
      if (!rows.length) break;
      push('sql_server_cpu_percent', evaluateStatus('A1', 'sql_server_cpu_percent', rows[0].sql_server_cpu_percent, rows));
      break;
    }

    case 'A2': {
      if (!rows.length) break;
      push('page_life_expectancy_seconds', evaluateStatus('A2', 'page_life_expectancy_seconds', rows[0].page_life_expectancy_seconds, rows));
      break;
    }

    case 'A2b': break;

    case 'A3': {
      for (const row of rows) {
        const ev = evaluateStatus('A3', 'used_percent', Number(row.used_percent), [row]);
        push('used_percent', ev, `${row.logical_file_name} (${row.file_type})`);
      }
      break;
    }

    case 'A3b': {
      for (const row of rows) {
        const ev = evaluateStatus('A3b', 'used_percent', Number(row.used_percent), [row]);
        push('used_percent', ev, `Ổ ${row.volume_mount_point}`);
      }
      break;
    }

    case 'A4': {
      for (const row of rows) {
        // Pass [row] so evaluateStatus can read row.wait_type to pick the right threshold
        const ev = evaluateStatus('A4', 'percent_of_total_wait', Number(row.percent_of_total_wait), [row]);
        push('percent_of_total_wait', ev, row.wait_type);
      }
      break;
    }

    case 'A5': {
      if (!rows.length) {
        metrics.push({ key: 'active_sessions', label: 'Session đang chạy', value: 0, displayValue: '0 session', status: 'green' });
        break;
      }
      for (const row of rows) {
        const ev = evaluateStatus('A5', 'running_seconds', Number(row.running_seconds), rows);
        push('running_seconds', ev, `Session ${row.session_id} (${row.login_name || ''})`);
      }
      break;
    }

    case 'A6': {
      if (!rows.length) {
        metrics.push({ key: 'blocking_count', label: 'Blocking chain', value: 0, displayValue: 'Không có blocking', status: 'green' });
        break;
      }
      for (const row of rows) {
        const ev = evaluateStatus('A6', 'da_cho_bao_lau_giay', Number(row.da_cho_bao_lau_giay), rows);
        push('da_cho_bao_lau_giay', ev, `Session ${row.bi_chan_session_id} bị chặn bởi ${row.thu_pham_session_id}`);
      }
      break;
    }

    case 'A7': {
      for (const row of rows) {
        if (!row.enabled) continue;
        const ev = evaluateStatus('A7', 'last_run_status', row.last_run_status, [row]);
        push('last_run_status', ev, row.job_name);
      }
      break;
    }

    case 'A8': {
      for (const row of rows) {
        const pct = row.size_mb > 0 ? Math.round((row.used_mb / row.size_mb) * 1000) / 10 : 0;
        const ev = evaluateStatus('A8', 'used_percent', pct, [row]);
        push('used_percent', ev, row.file_name);
      }
      break;
    }

    case 'B1': {
      for (const row of rows) {
        const ev = evaluateStatus('B1', 'value_in_use', Number(row.value_in_use), [row]);
        push('value_in_use', ev, row.name);
      }
      break;
    }

    case 'B2': {
      for (const row of rows) {
        const ev = evaluateStatus('B2', 'used_percent', Number(row.used_percent), [row]);
        push('used_percent', ev, row.logical_name);
      }
      break;
    }

    case 'B3': break;
    case 'B4': break;

    case 'B5': {
      for (const row of rows) {
        const snippet = String(row.query_text || '').substring(0, 30);
        push('avg_elapsed_ms', evaluateStatus('B5', 'avg_elapsed_ms', Number(row.avg_elapsed_ms), [row]), `avg – ${snippet}`);
        push('max_elapsed_ms', evaluateStatus('B5', 'max_elapsed_ms', Number(row.max_elapsed_ms), [row]), `max – ${snippet}`);
      }
      break;
    }

    case 'B6': {
      for (const row of rows) {
        push('avg_elapsed_ms', evaluateStatus('B6', 'avg_elapsed_ms', Number(row.avg_elapsed_ms), [row]), `Avg elapsed (exec ×${row.execution_count})`);
        push('max_elapsed_ms', evaluateStatus('B6', 'max_elapsed_ms', Number(row.max_elapsed_ms), [row]), `Max elapsed (exec ×${row.execution_count})`);
      }
      break;
    }

    case 'B7': {
      const total = rows.reduce((sum, r) => sum + (Number(r.so_luong_ket_noi) || 0), 0);
      push('total_connections', evaluateStatus('B7', 'total_connections', total, rows));
      break;
    }

    case 'B8': break;
    case 'B9': break;
  }

  return metrics;
}

// ---------------------------------------------------------------------------
// Run a single SQL query against an open pool
// ---------------------------------------------------------------------------

async function runQuery(pool, sqlText) {
  const t0 = Date.now();
  const result = await pool.request().query(sqlText);
  return {
    rows: result.recordset || [],
    durationMs: Date.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// POST /api/healthcheck/run
// Body: { sections: ['A','B']|['A']|['B'], instanceKey: string }
// ---------------------------------------------------------------------------

router.post('/run', async (req, res) => {
  const { sections = ['A', 'B'], instanceKey } = req.body || {};

  if (!instanceKey) {
    return res.status(400).json({ error: 'instanceKey is required' });
  }

  const instances = getInstances();
  const instance = instances.find(i => i.key === instanceKey);
  if (!instance) {
    return res.status(400).json({ error: `Instance '${instanceKey}' not configured in HC_INSTANCES` });
  }

  const requestedSections = Array.isArray(sections) ? sections : [sections];

  // Section B queries are CRM-specific; skip them for non-crm instances
  const queriesToRun = HEALTH_CHECK_QUERIES.filter(q => {
    if (!requestedSections.includes(q.section)) return false;
    if (q.target === 'crm' && instanceKey !== 'crm') return false;
    return true;
  });

  const runId = randomUUID();
  const runAt = new Date().toISOString();
  const t0Total = Date.now();
  const results = [];
  let pool = null;

  try {
    pool = new sql.ConnectionPool(buildMssqlConfig(instance));
    await pool.connect();
  } catch (connErr) {
    return res.status(500).json({
      error: `Cannot connect to '${instanceKey}' (${instance.host}): ${connErr.message}`,
    });
  }

  try {
    // Run queries sequentially to avoid overloading the production server
    for (const query of queriesToRun) {
      const t0 = Date.now();
      let rows = [];
      let error = null;

      try {
        const qr = await runQuery(pool, query.sql);
        rows = qr.rows;
      } catch (err) {
        error = err.message || String(err);
        console.error(`[healthcheck] ${query.id} failed on '${instanceKey}':`, error);
      }

      const durationMs = Date.now() - t0;
      const metrics = error ? [] : extractMetrics(query.id, rows);
      const status = error ? 'red' : getOverallStatus(metrics);

      results.push({
        id: query.id,
        name: query.name,
        section: query.section,
        status,
        durationMs,
        rows,
        metrics,
        error,
      });
    }
  } finally {
    try { await pool.close(); } catch (_) { /* ignore */ }
  }

  return res.json({
    runId,
    instanceKey,
    runAt,
    totalDurationMs: Date.now() - t0Total,
    overallStatus: getOverallStatus(results),
    results,
  });
});

// ---------------------------------------------------------------------------
// GET /api/healthcheck/instances
// Returns configured instances without passwords
// ---------------------------------------------------------------------------

router.get('/instances', (_req, res) => {
  const safe = getInstances().map(({ key, name, host, database }) => ({ key, name, host, database }));
  return res.json(safe);
});

module.exports = router;
