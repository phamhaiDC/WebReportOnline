'use strict';

// Đọc/parse trang /Connects và /BaseVersions của server RK7 (Reference Server
// hoặc Report Server) và dựng cây kết nối đệ quy kèm số liệu đồng bộ transaction
// (alias 'rk7'). Nguồn cấu hình: config/connection_check_sources.json —
// file đó chứa IP/thông tin nội bộ thật, không copy nguyên văn sang tài liệu/project khác.

const axios = require('axios');
const cheerio = require('cheerio');
const { createPinnedHttpsAgent } = require('./pinnedHttpsAgent');
const { RK7_SHARED_CERT_FINGERPRINT256 } = require('../config/rk7CertPin');

const DEFAULT_MAX_DEPTH = 6;
const REQUEST_TIMEOUT_MS = 10000;
const NOT_APPLICABLE = { status: 'not_applicable' };

// Pin theo fingerprint (xem config/rk7CertPin.js) thay vì rejectUnauthorized:false.
const agent = createPinnedHttpsAgent(RK7_SHARED_CERT_FINGERPRINT256);

// Ví dụ header thật: Reports Server 'VTI_REF_PROD' (PID: 13524, Version: 7.25.12 003 release)
const HEADER_RE = /Reports Server '(.+?)' \(PID: (\d+), Version: (.+?)\)/;

function parseConnectsHtml(html) {
  const $ = cheerio.load(html);
  const bodyText = $('body').text();
  const headerMatch = bodyText.match(HEADER_RE);
  const serverInfo = headerMatch
    ? { networkName: headerMatch[1], pid: headerMatch[2], version: headerMatch[3].trim() }
    : { networkName: null, pid: null, version: null };

  const connects = [];
  $('table tr').each((_, el) => {
    const tds = $(el).find('td');
    if (tds.length < 5) return;
    const networkName = $(tds[0]).text().trim();
    if (!networkName || networkName === 'NetworkNameText') return; // header row
    connects.push({
      networkName,
      remoteIp: $(tds[1]).text().trim(),
      additionalInfo: $(tds[2]).text().trim(),
      applicationKind: $(tds[3]).text().trim(),
      applicationVer: $(tds[4]).text().trim(),
    });
  });

  return { serverInfo, connects };
}

// Bảng /BaseVersions: Alias | Structure | Data (transactions) | DB File Path | Last modified | Sync stopped
function parseBaseVersionsHtml(html) {
  const $ = cheerio.load(html);
  const rows = [];
  $('table tr').each((_, el) => {
    const tds = $(el).find('td');
    if (tds.length < 6) return;
    const alias = $(tds[0]).text().trim();
    if (!alias || alias.toLowerCase() === 'alias') return; // header row
    const dataTransactionsRaw = $(tds[2]).text().trim().replace(/,/g, '');
    const dataTransactions = parseInt(dataTransactionsRaw, 10);
    rows.push({
      alias,
      structure: $(tds[1]).text().trim(),
      dataTransactions: Number.isNaN(dataTransactions) ? null : dataTransactions,
      dbFilePath: $(tds[3]).text().trim(),
      lastModified: $(tds[4]).text().trim(),
      syncStopped: $(tds[5]).text().trim().toLowerCase() === 'true',
    });
  });
  return { rows };
}

async function fetchConnects(entry) {
  const url = `https://${entry.ip}:${entry.port}/Connects`;
  const auth = Buffer.from(`${entry.user}:${entry.pass}`).toString('base64');
  const response = await axios.get(url, {
    headers: { Authorization: `Basic ${auth}` },
    httpsAgent: agent,
    timeout: REQUEST_TIMEOUT_MS,
  });
  return parseConnectsHtml(response.data);
}

// Chỉ quan tâm alias 'rk7' (so sánh không phân biệt hoa/thường); các alias khác
// (VD local_db) bị bỏ qua. Không tìm thấy dòng 'rk7' -> coi là 'no_data' (không lỗi).
async function fetchBaseVersion(entry) {
  const url = `https://${entry.ip}:${entry.port}/BaseVersions`;
  const auth = Buffer.from(`${entry.user}:${entry.pass}`).toString('base64');
  const response = await axios.get(url, {
    headers: { Authorization: `Basic ${auth}` },
    httpsAgent: agent,
    timeout: REQUEST_TIMEOUT_MS,
  });
  const { rows } = parseBaseVersionsHtml(response.data);
  const rk7Row = rows.find(r => r.alias.toLowerCase() === 'rk7');
  if (!rk7Row) {
    return { status: 'no_data' };
  }
  return {
    status: 'ok',
    structure: rk7Row.structure,
    dataTransactions: rk7Row.dataTransactions,
    lastModified: rk7Row.lastModified,
    syncStopped: rk7Row.syncStopped,
  };
}

// Gọi /Connects và /BaseVersions song song cho cùng 1 node (chung ip/port/auth),
// tránh chạy tuần tự 2 request cho 1 node làm tăng gấp đôi thời gian xử lý node đó.
// Nếu /Connects lỗi, cả node coi như unreachable (baseVersion không còn ý nghĩa,
// caller sẽ set 'not_applicable'). Nếu chỉ /BaseVersions lỗi, node vẫn 'expanded'
// bình thường (đủ connects), chỉ riêng baseVersion mang status 'unreachable'.
async function fetchExpandedNode(entry) {
  const [connectsResult, baseVersionResult] = await Promise.allSettled([
    fetchConnects(entry),
    fetchBaseVersion(entry),
  ]);

  if (connectsResult.status === 'rejected') {
    throw connectsResult.reason;
  }

  const { serverInfo, connects } = connectsResult.value;
  const baseVersion = baseVersionResult.status === 'fulfilled'
    ? baseVersionResult.value
    : { status: 'unreachable', error: baseVersionResult.reason?.message || String(baseVersionResult.reason) };

  return { serverInfo, connects, baseVersion };
}

// Duyệt cây tuần tự (không song song giữa các node) để tránh dồn tải lên server
// RK7 production, cùng tinh thần với health-check engine hiện có (chạy tuần tự
// từng câu SQL). Trong phạm vi 1 node, /Connects và /BaseVersions vẫn được gọi
// song song với nhau (xem fetchExpandedNode) để không tăng gấp đôi thời gian.
// Nếu sau này cần tăng tốc hơn nữa, có thể đổi các vòng for-of dưới đây thành
// Promise.all theo từng tầng, kèm giới hạn concurrency (semaphore).
async function buildChildNode(connect, depth, maxDepth, visited, sourcesByName) {
  const base = {
    networkName: connect.networkName,
    remoteIp: connect.remoteIp,
    additionalInfo: connect.additionalInfo,
    applicationKind: connect.applicationKind,
    applicationVer: connect.applicationVer,
  };

  if (connect.applicationKind !== 'Report Server') {
    // Manager Station / Cash Server / bất kỳ giá trị lạ nào khác đều là leaf, không mở rộng.
    return { ...base, status: 'leaf', baseVersion: NOT_APPLICABLE, children: [] };
  }

  const entry = sourcesByName.get(connect.networkName);
  if (!entry) {
    return { ...base, status: 'no_config', baseVersion: NOT_APPLICABLE, children: [] };
  }

  const key = `${entry.ip}:${entry.port}`;

  // Check visited BEFORE depth: a node we've already seen is always a genuine
  // cycle (regardless of depth), while max_depth_reached must only ever apply
  // to a node's first appearance — this keeps the two statuses mutually
  // exclusive so summary counts never double-count or drop a real connection.
  if (visited.has(key)) {
    return { ...base, status: 'cycle_detected', ip: entry.ip, port: entry.port, baseVersion: NOT_APPLICABLE, children: [] };
  }

  if (depth >= maxDepth) {
    return { ...base, status: 'max_depth_reached', ip: entry.ip, port: entry.port, baseVersion: NOT_APPLICABLE, children: [] };
  }

  visited.add(key);

  try {
    const { serverInfo, connects, baseVersion } = await fetchExpandedNode(entry);
    const children = [];
    for (const child of connects) {
      children.push(await buildChildNode(child, depth + 1, maxDepth, visited, sourcesByName));
    }
    return {
      ...base,
      status: 'expanded',
      ip: entry.ip,
      port: entry.port,
      pid: serverInfo.pid,
      version: serverInfo.version,
      baseVersion,
      children,
    };
  } catch (err) {
    return {
      ...base,
      status: 'unreachable',
      ip: entry.ip,
      port: entry.port,
      error: err.message || String(err),
      baseVersion: NOT_APPLICABLE,
      children: [],
    };
  }
}

async function buildTree(rootEntry, maxDepth, sourcesByName) {
  const depth = Number.isInteger(maxDepth) && maxDepth > 0 ? maxDepth : DEFAULT_MAX_DEPTH;
  const visited = new Set([`${rootEntry.ip}:${rootEntry.port}`]);

  const rootBase = {
    networkName: rootEntry.networkName,
    ip: rootEntry.ip,
    port: rootEntry.port,
  };

  let root;
  try {
    const { serverInfo, connects, baseVersion } = await fetchExpandedNode(rootEntry);
    const children = [];
    for (const child of connects) {
      children.push(await buildChildNode(child, 1, depth, visited, sourcesByName));
    }
    root = {
      ...rootBase,
      pid: serverInfo.pid,
      version: serverInfo.version,
      status: 'expanded',
      baseVersion,
      children,
    };
  } catch (err) {
    root = {
      ...rootBase,
      status: 'unreachable',
      error: err.message || String(err),
      baseVersion: NOT_APPLICABLE,
      children: [],
    };
  }

  applySyncStatus(root);
  return root;
}

// So sánh dataTransactions của mọi node (đã build xong, có đủ baseVersion) với
// baseline = dataTransactions của root. Chỉ chạy 1 lần, sau khi cây đã hoàn chỉnh
// (baseline chỉ biết được khi root đã có dữ liệu) — không lồng vào lúc gọi API.
function applySyncStatus(root) {
  const baseline = (root.baseVersion && root.baseVersion.status === 'ok')
    ? root.baseVersion.dataTransactions
    : null;

  function visit(node, isRootNode) {
    if (!node.baseVersion || node.baseVersion.status === 'not_applicable') {
      // leaf / no_config / cycle_detected / max_depth_reached / hoàn toàn unreachable — bỏ qua.
    } else if (isRootNode) {
      node.syncStatus = baseline !== null ? 'in_sync' : 'unknown';
    } else if (node.baseVersion.status === 'ok' && baseline !== null) {
      if (node.baseVersion.dataTransactions === baseline) {
        node.syncStatus = 'in_sync';
      } else {
        node.syncStatus = 'out_of_sync';
        node.diff = node.baseVersion.dataTransactions - baseline;
      }
    } else {
      node.syncStatus = 'unknown';
    }

    if (node.children) {
      node.children.forEach(child => visit(child, false));
    }
  }

  visit(root, true);
}

// Duyệt toàn bộ cây đã build (1 lần, đệ quy mọi cấp) để tổng hợp số liệu, không
// gọi thêm request nào. Root không tính vào các tổng — chỉ tính node con.
// cycle_detected không cộng vào totalReportServer (server đó đã được đếm ở lần
// xuất hiện đầu tiên); max_depth_reached luôn là lần xuất hiện đầu tiên (nhờ thứ
// tự kiểm tra visited-trước-depth ở buildChildNode) nên được cộng vào tổng.
function computeSummary(root) {
  const summary = {
    totalReportServer: 0,
    totalCashServer: 0,
    totalManagerStation: 0,
    noConfigCount: 0,
    unreachableCount: 0,
    cycleDetectedCount: 0,
    maxDepthReachedCount: 0,
    outOfSyncCount: 0,
    syncUnknownCount: 0,
  };

  function visit(node) {
    if (!node || !node.children) return;
    for (const child of node.children) {
      switch (child.applicationKind) {
        case 'Report Server':
          if (child.status === 'cycle_detected') {
            summary.cycleDetectedCount++;
          } else {
            summary.totalReportServer++;
            if (child.status === 'no_config') summary.noConfigCount++;
            else if (child.status === 'unreachable') summary.unreachableCount++;
            else if (child.status === 'max_depth_reached') summary.maxDepthReachedCount++;
          }
          break;
        case 'Cash Server':
          summary.totalCashServer++;
          break;
        case 'Manager Station':
          summary.totalManagerStation++;
          break;
        default:
          break; // giá trị applicationKind lạ — không tính vào tổng nào
      }

      if (child.syncStatus === 'out_of_sync') summary.outOfSyncCount++;
      else if (child.syncStatus === 'unknown') summary.syncUnknownCount++;

      visit(child);
    }
  }

  visit(root);
  return summary;
}

module.exports = {
  buildTree,
  computeSummary,
  parseConnectsHtml,
  parseBaseVersionsHtml,
  DEFAULT_MAX_DEPTH,
};
