'use strict';

const https = require('https');
const tls = require('tls');

// Pin TLS đúng 1 certificate cụ thể (theo SHA-256 fingerprint), thay vì `rejectUnauthorized: false`
// (chấp nhận MỌI certificate — mở cửa MITM). Dùng cho các server nội bộ dùng cert tự ký/hết hạn mà
// ta không kiểm soát được (vd RK7 API — cert CN=rk7.local hết hạn từ 2014, cert này đi kèm sẵn trong
// phần mềm RK7 nên không tự đổi giữa các lần deploy).
//
// LƯU Ý: Node KHÔNG gọi `checkServerIdentity` khi rejectUnauthorized:false (đã verify thủ công),
// nên phải tự bắt sự kiện 'secureConnect' trên socket và so khớp fingerprint trước khi cho phép
// request đi tiếp — nếu lệch, hủy socket ngay (fail-closed), không âm thầm cho qua.
function createPinnedHttpsAgent(pinnedFingerprint256, agentOptions = {}) {
    class PinnedHttpsAgent extends https.Agent {
        createConnection(connectOpts, callback) {
            const socket = tls.connect({ ...connectOpts, rejectUnauthorized: false });

            socket.once('secureConnect', () => {
                const cert = socket.getPeerCertificate();
                const fingerprint = cert && cert.fingerprint256;

                if (!fingerprint || fingerprint !== pinnedFingerprint256) {
                    const err = new Error(
                        `[PinnedHttpsAgent] TLS certificate fingerprint KHÔNG khớp pin đã cấu hình — ` +
                        `khả năng bị MITM hoặc server đã đổi certificate hợp lệ (cần xác minh out-of-band ` +
                        `rồi cập nhật lại pin). expected=${pinnedFingerprint256} got=${fingerprint || '(none)'}`
                    );
                    socket.destroy(err);
                    if (typeof callback === 'function') callback(err);
                    return;
                }

                if (typeof callback === 'function') callback(null, socket);
            });

            socket.once('error', (err) => {
                if (typeof callback === 'function') callback(err);
            });

            return socket;
        }
    }

    return new PinnedHttpsAgent(agentOptions);
}

module.exports = { createPinnedHttpsAgent };
