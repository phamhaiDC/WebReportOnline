'use strict';

// Cache TTL đơn giản trong bộ nhớ, riêng cho các report Ecode.
// Dữ liệu nguồn chỉ đổi mỗi ~15' (nhịp ETL) nên cache ngắn (~60s) là đủ để giảm tải DB
// khi nhiều tab/polling cùng gọi API.
const store = new Map();

async function getOrSet(key, ttlMs, fetchFn) {
    const now = Date.now();
    const hit = store.get(key);
    if (hit && hit.expiresAt > now) {
        return hit.value;
    }

    const value = await fetchFn();
    store.set(key, { value, expiresAt: now + ttlMs });
    return value;
}

module.exports = { getOrSet };
