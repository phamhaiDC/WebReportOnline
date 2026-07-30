'use strict';

// Fingerprint SHA-256 dùng CHUNG cho toàn bộ fleet server RK7 (Reference Server, Report Server,
// Transit Server...). Đã verify thực tế ngày 2026-07-30 bằng kết nối TLS trực tiếp tới 5 host khác
// nhau (61.28.227.20:3988, 61.28.235.59:4502, 61.28.238.121:4504, 116.118.95.207:4031, :5021) —
// cả 5 đều trả về ĐÚNG 1 certificate giống hệt nhau (tự ký, CN=rk7.local, RSA 1024-bit + SHA1,
// hết hạn từ 2014). Kết luận: cert này đóng gói sẵn trong phần mềm RK7, không phải cert riêng
// từng máy — nên dùng chung 1 fingerprint pin cho mọi kết nối tới hạ tầng RK7:
//   - routes/auth.js (RK7 API lúc login)
//   - routes/reports.js (masterdata_sources.json: /params/collectionIds, report compare_masterdata)
//   - services/connectionsMonitor.js (connection_check_sources.json)
//
// Nếu một host cụ thể nào đó trả fingerprint KHÁC hằng số này, kết nối tới host đó sẽ tự động bị
// từ chối (đúng ý fail-closed) — cần điều tra riêng (có thể server đó cài bản RK7 khác/cert đã đổi),
// KHÔNG tự ý thêm ngoại lệ. Nếu vendor phát hành bản RK7 mới với cert khác, phải xác minh out-of-band
// rồi cập nhật lại hằng số này.
const RK7_SHARED_CERT_FINGERPRINT256 =
    'E3:86:05:4B:1B:BC:16:C3:F4:D5:4C:95:D0:3C:B1:CC:D9:7E:31:7B:0B:1A:E7:EC:62:21:79:A7:5A:44:7A:8B';

module.exports = { RK7_SHARED_CERT_FINGERPRINT256 };
