'use strict';

const STATUS = { GREEN: 'green', YELLOW: 'yellow', RED: 'red' };

function band(value, greenMax, yellowMax) {
  if (value <= greenMax) return STATUS.GREEN;
  if (value <= yellowMax) return STATUS.YELLOW;
  return STATUS.RED;
}

function bandMin(value, greenMin, yellowMin) {
  if (value >= greenMin) return STATUS.GREEN;
  if (value >= yellowMin) return STATUS.YELLOW;
  return STATUS.RED;
}

const THRESHOLDS = {
  A1: {
    sql_server_cpu_percent: (v) => band(v, 59, 85),
  },
  A2: {
    page_life_expectancy_seconds: (v) => bandMin(v, 5001, 1000),
  },
  A3_file: {
    used_percent: (v) => band(v, 79, 92),
  },
  A3_volume: {
    used_percent: (v) => band(v, 74, 90),
  },
  A4: {
    pageiolatch_percent: (v) => band(v, 10, 20),
    lck_percent: (v) => band(v, 5, 15),
  },
  A5: {
    running_seconds: (v) => {
      if (v < 5) return STATUS.GREEN;
      if (v < 30) return STATUS.YELLOW;
      return STATUS.RED;
    },
  },
  A6: {
    da_cho_bao_lau_giay: (v) => {
      if (v < 10) return STATUS.YELLOW;
      return STATUS.RED;
    },
  },
  A7: {
    last_run_status: (v) => {
      if (v === 'Succeeded') return STATUS.GREEN;
      if (v === 'Retry' || v === 'Cancelled') return STATUS.YELLOW;
      return STATUS.RED;
    },
  },
  A8: {
    used_percent: (v) => band(v, 70, 90),
  },
  B1: {
    max_server_memory: (v) => {
      if (v === 53248) return STATUS.GREEN;
      if (v >= 2147483647) return STATUS.RED;
      return STATUS.YELLOW;
    },
    cost_threshold: (v) => bandMin(v, 50, 20),
  },
  B2: {
    used_percent: (v) => band(v, 80, 90),
  },
  B5: {
    avg_elapsed_ms: (v) => band(v, 20, 100),
    max_elapsed_ms: (v) => band(v, 200, 1000),
  },
  B6: {
    avg_elapsed_ms: (v) => band(v, 5, 50),
    max_elapsed_ms: (v) => band(v, 500, 2000),
  },
  B7: {
    total_connections: (v) => band(v, 300, 500),
  },
};

const METRIC_LABELS = {
  sql_server_cpu_percent: 'CPU SQL Server (%)',
  system_idle_percent: 'CPU hệ thống rảnh (%)',
  page_life_expectancy_seconds: 'PLE (giây)',
  ple_in_minutes: 'PLE (phút)',
  sql_memory_used_mb: 'RAM đang dùng (MB)',
  memory_used_percent_of_quota: 'RAM / quota (%)',
  used_percent: 'Đã dùng (%)',
  used_gb: 'Đã dùng (GB)',
  free_gb: 'Còn trống (GB)',
  size_gb: 'Tổng dung lượng (GB)',
  size_mb: 'Tổng dung lượng (MB)',
  used_mb: 'Đã dùng (MB)',
  wait_time_ms: 'Thời gian chờ (ms)',
  percent_of_total_wait: 'Tỉ lệ wait (%)',
  running_seconds: 'Đang chạy (giây)',
  wait_seconds: 'Đang chờ (giây)',
  da_cho_bao_lau_giay: 'Đã chờ (giây)',
  last_run_status: 'Trạng thái lần chạy cuối',
  avg_elapsed_ms: 'Trung bình thời gian (ms)',
  max_elapsed_ms: 'Tối đa thời gian (ms)',
  so_luong_ket_noi: 'Số kết nối',
  total_connections: 'Tổng kết nối',
  value_in_use: 'Giá trị đang dùng',
};

function formatDisplayValue(metricKey, value) {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'number') {
    if (metricKey.includes('percent') || metricKey === 'used_percent') return `${value}%`;
    if (metricKey.includes('_mb')) return `${value} MB`;
    if (metricKey.includes('_gb')) return `${value} GB`;
    if (metricKey.includes('_ms')) return `${value} ms`;
    if (metricKey.includes('_seconds') || metricKey.includes('_giay')) return `${value}s`;
    return String(value);
  }
  return String(value);
}

/**
 * Evaluate the status of a single metric value.
 * Returns { status, value, displayValue, label }
 */
function evaluateStatus(queryId, metricKey, value, allRows) {
  const label = METRIC_LABELS[metricKey] || metricKey;
  const displayValue = formatDisplayValue(metricKey, value);

  // A5: empty rows = green; otherwise evaluate running_seconds per row
  if (queryId === 'A5') {
    if (!allRows || allRows.length === 0) {
      return { status: STATUS.GREEN, value, displayValue, label };
    }
    const fn = THRESHOLDS.A5.running_seconds;
    const status = fn(value);
    return { status, value, displayValue, label };
  }

  // A6: empty rows = green; otherwise evaluate da_cho_bao_lau_giay
  if (queryId === 'A6') {
    if (!allRows || allRows.length === 0) {
      return { status: STATUS.GREEN, value, displayValue, label };
    }
    const fn = THRESHOLDS.A6.da_cho_bao_lau_giay;
    const status = fn(value);
    return { status, value, displayValue, label };
  }

  // A7: only evaluate enabled jobs
  if (queryId === 'A7' && metricKey === 'last_run_status') {
    const fn = THRESHOLDS.A7.last_run_status;
    const status = fn(value);
    return { status, value, displayValue, label };
  }

  // A4: differentiate PAGEIOLATCH vs LCK wait types
  if (queryId === 'A4' && metricKey === 'percent_of_total_wait') {
    const row = allRows && allRows[0];
    if (row && row.wait_type) {
      if (row.wait_type.startsWith('PAGEIOLATCH')) {
        const status = THRESHOLDS.A4.pageiolatch_percent(value);
        return { status, value, displayValue, label };
      }
      if (row.wait_type.startsWith('LCK_M_')) {
        const status = THRESHOLDS.A4.lck_percent(value);
        return { status, value, displayValue, label };
      }
    }
    return { status: STATUS.GREEN, value, displayValue, label };
  }

  // A3: distinguish file vs volume context via metricKey alone (callers pass queryId 'A3' or 'A3b')
  if (queryId === 'A3' && metricKey === 'used_percent') {
    const status = THRESHOLDS.A3_file.used_percent(value);
    return { status, value, displayValue, label };
  }
  if (queryId === 'A3b' && metricKey === 'used_percent') {
    const status = THRESHOLDS.A3_volume.used_percent(value);
    return { status, value, displayValue, label };
  }

  // A8: calculate used_percent from used_mb/size_mb if raw percent not available
  if (queryId === 'A8' && metricKey === 'used_percent') {
    const status = THRESHOLDS.A8.used_percent(value);
    return { status, value, displayValue, label };
  }

  // B1: route by config name stored in allRows context
  if (queryId === 'B1' && metricKey === 'value_in_use') {
    const row = allRows && allRows[0];
    if (row && row.name) {
      if (row.name === 'max server memory (MB)') {
        const status = THRESHOLDS.B1.max_server_memory(value);
        return { status, value, displayValue, label };
      }
      if (row.name === 'cost threshold for parallelism') {
        const status = THRESHOLDS.B1.cost_threshold(value);
        return { status, value, displayValue, label };
      }
    }
    return { status: STATUS.GREEN, value, displayValue, label };
  }

  // B7: total_connections is derived by caller (SUM of so_luong_ket_noi)
  if (queryId === 'B7' && metricKey === 'total_connections') {
    const status = THRESHOLDS.B7.total_connections(value);
    return { status, value, displayValue, label };
  }

  // Generic lookup by queryId → metricKey
  const queryThresholds = THRESHOLDS[queryId];
  if (queryThresholds && typeof queryThresholds[metricKey] === 'function') {
    const status = queryThresholds[metricKey](value);
    return { status, value, displayValue, label };
  }

  // No threshold defined — neutral
  return { status: STATUS.GREEN, value, displayValue, label };
}

const STATUS_SEVERITY = { green: 0, yellow: 1, red: 2 };

/**
 * Given an array of { status } objects, returns the worst overall status.
 */
function getOverallStatus(results) {
  if (!results || results.length === 0) return STATUS.GREEN;
  let worst = STATUS.GREEN;
  for (const r of results) {
    if (STATUS_SEVERITY[r.status] > STATUS_SEVERITY[worst]) {
      worst = r.status;
    }
    if (worst === STATUS.RED) break;
  }
  return worst;
}

module.exports = { THRESHOLDS, evaluateStatus, getOverallStatus, STATUS };
