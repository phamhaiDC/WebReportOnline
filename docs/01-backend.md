# Backend — WebReportOnline

Node.js / Express API, cổng mặc định **5577** (biến `PORT`).

## 1. Entrypoint — `backend/index.js`
- Khởi tạo Express app, bật `cors()` và `express.json()`.
- Gọi `connectDB()` khi start server để mở kết nối MSSQL + PostgreSQL (pool dùng chung toàn app, không tạo mới theo từng request — trừ health-check tự quản pool riêng, xem mục 4).
- Mount 4 router:
  - `/api/auth` → `routes/auth.js`
  - `/api/reports/connections-monitor` → `routes/connectionsMonitor.js` (mount **trước** `/api/reports` để tránh bị route `POST /:id` của `reports.js` nuốt mất)
  - `/api/reports` → `routes/reports.js`
  - `/api/healthcheck` → `routes/healthcheck.js`
- `GET /` trả text đơn giản để kiểm tra server sống.

## 2. Kết nối dữ liệu — `backend/config/db.js`
Hai kết nối được thiết lập lúc khởi động và export dùng chung (`sql`, `pgPool`):

| Kết nối | Driver | Biến môi trường | Ghi chú |
|---|---|---|---|
| MSSQL chính (RK7_VTI) | `mssql` | `DB_USER`, `DB_PASSWORD`, `DB_SERVER`, `DB_DATABASE`, `DB_PORT` | `encrypt: true`, `trustServerCertificate: true` (chấp nhận self-signed cert), `requestTimeout: 3,000,000 ms` (rất dài — phục vụ report nặng) |
| PostgreSQL (Cloud) | `pg` (`Pool`) | `PG_USER`, `PG_HOST`, `PG_DATABASE`, `PG_PASSWORD`, `PG_PORT` (default 5432) | |

`connectDB()` mở kết nối MSSQL global (`sql.connect`) và test PostgreSQL bằng `SELECT NOW()`. Lỗi kết nối chỉ log ra console, không crash app.

## 3. Auth — `backend/routes/auth.js`
`POST /api/auth/login` — xác thực **2 bước**, không dùng JWT/session, không hash password khi truyền đi:

1. **Tra cứu nhân viên theo email (SQL)**
   - Gọi table-valued function `dbo.f_getEmployeeByEmail(@Email)`.
   - 0 record → 401 "User not found or inactive".
   - >1 record → 500 "Data inconsistency error" (bảo vệ trước dữ liệu email trùng).
   - `STATUS !== 3` (không active) → 401.
2. **Xác thực mật khẩu qua RK7 API**
   - Gửi `POST` XML `<RK7Query><RK7CMD CMD="GetFunctions"/></RK7Query>` tới `RK7_API_URL` (mặc định trỏ tới `https://61.28.227.20:3988/rk7api/v0/xmlinterface.xml`), dùng **HTTP Basic Auth** với `username = Name` (tên nhân viên lấy từ SQL) và `password` = mật khẩu người dùng nhập (plain-text).
   - Bỏ qua chứng chỉ self-signed (`rejectUnauthorized: false`).
   - Timeout theo `RK7_API_TIMEOUT` (mặc định 30s).
3. **Đánh giá kết quả**: HTTP 200 + body chứa chuỗi `Status="Ok"` → coi là đăng nhập thành công.
4. Thành công trả về `{ success, user: { code, name, email } }`. Frontend lưu `user` vào `localStorage`, **không có token/refresh — phiên đăng nhập chỉ tồn tại phía client**.

## 4. Health Check engine — `backend/routes/healthcheck.js` + `services/healthcheck/`
Module kiểm tra sức khỏe SQL Server theo thời gian thực, độc lập với pool kết nối chính (tự mở/đóng `ConnectionPool` riêng mỗi lần chạy).

### Instance model
Đọc từ biến môi trường, dựng động 2 "instance" khả dụng:
- `general` — dùng chung config `DB_*` (RK7_VTI)
- `crm` — dùng config `CRM_*` (R_KEEPER_7_CRM_VTI)

`GET /api/healthcheck/instances` trả danh sách instance (ẩn password).

### Chạy health check
`POST /api/healthcheck/run` — body `{ sections: ['A','B'], instanceKey }`:
- Section **A** = chỉ số chung SQL Server (chạy được trên mọi instance).
- Section **B** = chỉ số riêng cho CRM database (`target: 'crm'`), **tự động bị bỏ qua** nếu `instanceKey !== 'crm'`.
- Chạy tuần tự từng câu SQL (không song song, tránh tải server production) qua pool mở riêng, timeout kết nối 15s / request 30s.
- Mỗi query trả về `{ id, name, section, status, durationMs, rows, metrics, error }`.
- `overallStatus` của cả lần chạy = trạng thái tệ nhất trong toàn bộ metric (`red` > `yellow` > `green`).

### Danh sách query (`services/healthcheck/queries.js`)
17 câu kiểm tra, chia 2 nhóm:

**Section A — General (chạy trên mọi instance)**
| ID | Tên | Mục đích |
|---|---|---|
| A0 | Thông tin server & database | version, uptime, trạng thái DB |
| A1 | CPU hiện tại | % CPU SQL Server đang dùng (ring buffer) |
| A2 | Memory PLE | Page Life Expectancy |
| A2b | Memory usage | RAM đang dùng / quota |
| A3 | Database files | dung lượng, % dùng, autogrowth từng file DB |
| A3b | Volume stats | dung lượng ổ đĩa chứa DB |
| A4 | Wait stats | top 10 wait type (loại trừ wait hệ thống) |
| A5 | Active sessions | session đang chạy query (rỗng = tốt) |
| A6 | Blocking chain | session bị block (rỗng = tốt) |
| A7 | SQL Agent Jobs | lịch sử chạy job 20h gần nhất |
| A8 | TempDB | dung lượng/% dùng file tempdb |

**Section B — CRM-specific (chỉ chạy trên instance `crm`)**
| ID | Tên | Mục đích |
|---|---|---|
| B1 | Memory config | max/min server memory, MAXDOP, cost threshold |
| B2 | CRM file by filegroup | dung lượng theo filegroup |
| B3 | Top tables | 10 bảng lớn nhất |
| B4 | Zero read indexes | index ghi nhiều nhưng không đọc |
| B5 | Coupon perf | hiệu năng query liên quan coupon/thẻ (20h gần nhất) |
| B6 | Transaction insert perf | hiệu năng INSERT vào `CARD_TRANSACTIONS_BI` |
| B7 | Connections | thống kê kết nối theo host/app |
| B8 | Missing indexes | top 5 index thiếu, mức độ ảnh hưởng |
| B9 | Audit DELETE | lịch sử DELETE từ SQL Server Audit file (20h gần nhất) |

### Ngưỡng đánh giá (`services/healthcheck/thresholds.js`)
- Hàm `band(value, greenMax, yellowMax)` / `bandMin(...)` map giá trị số sang `green/yellow/red`.
- `evaluateStatus(queryId, metricKey, value, allRows)` xử lý logic đặc thù theo từng query (ví dụ A4 phân biệt ngưỡng theo `wait_type` là `PAGEIOLATCH*` hay `LCK_M_*`; B1 phân biệt theo tên config `max server memory` vs `cost threshold`).
- `getOverallStatus()` gộp nhiều kết quả về 1 trạng thái tệ nhất.
- Có sẵn bộ nhãn tiếng Việt cho từng metric (`METRIC_LABELS`) và format hiển thị theo đơn vị (`%`, `MB`, `GB`, `ms`, `s`).

## 5. Reports — `backend/routes/reports.js`
File lớn nhất backend (~1470 dòng), đảm nhiệm **toàn bộ danh mục report + logic thực thi từng report**. Không dùng router con theo từng report — router chính rẽ nhánh bằng `if (req.params.id === '...')`.

### `GET /api/reports/params/:type`
Cấp dữ liệu tham số động cho form lọc report:
- `restaurants` / `concepts` / `regions` / `franchises` → SELECT trực tiếp từ bảng MSSQL tương ứng (`RESTAURANTS`, `RESTAURANTCONCEPTS`, `RESTAURANTREGIONS`, `RESTAURANTFRANCHISES`), lọc `STATUS IN (2,3)`.
- `collectionIds` → gọi HTTP tới server RK7 "master" (đánh dấu `isMaster: true` trong `masterdata_sources.json`), scrape bảng HTML bằng `cheerio` để lấy danh sách CollectionID.
- Có fallback mock data khi DB lỗi (không throw 500 cho các case này, đảm bảo UI luôn hiển thị được select box).

### `GET /api/reports`
Trả về **cấu trúc menu report** (group → item / sub-group → item), định nghĩa tĩnh trong code (không lưu DB), mỗi item khai báo `id`, `name`, `description`, `parameters` (kiểu, default value, nguồn dữ liệu động qua `sourceUrl`). Các nhóm hiện có: `License`, `General`, `Sales Report` (có sub-group), `Online data monitor`, `Online Sales Data`, `Masterdata Control`.

### `POST /api/reports/:id`
Thực thi report theo `id`, mỗi report có nhánh xử lý riêng. Có một hàm dùng chung `processReportData(inputData, params)` xử lý:
1. **Filter** (theo cột, hỗ trợ filter dạng text / multi-select / numeric operator `=,>,<,>=,<=,between`)
2. **Sort**
3. **Group** (đa cấp, tính aggregate tự động cho cột số, hỗ trợ phân trang theo **nhóm** thay vì theo dòng, expand/collapse theo `expandedGroups`)
4. **Pagination** (khi không group)
5. Tính `uniqueValues` cho mọi cột (phục vụ filter dropdown ở FE)

Toàn bộ xử lý filter/sort/group/paginate diễn ra **trong Node.js, sau khi đã lấy hết dữ liệu về từ DB** (không đẩy xuống SQL) — phù hợp với data size vừa phải, không tối ưu cho tập dữ liệu rất lớn.

Danh sách report/dashboard cụ thể — xem [Tính năng](./03-features.md).

## 6. Cấu hình masterdata sources — `backend/config/masterdata_sources.json`
Danh sách 17 server RK7 (1 server "master" dùng làm chuẩn đối chiếu + các server sync vùng Bắc/Trung/Nam) dùng cho report **Compare Masterdata**. Mỗi entry gồm `label`, `url` (endpoint `/References` trả HTML), `user`/`pass` (Basic Auth), `isMaster`.
> File này chứa IP nội bộ thật — không nên copy nguyên văn sang tài liệu/project khác.

## 6b. Connections Monitor — `backend/routes/connectionsMonitor.js` + `services/connectionsMonitor.js`
Không thuộc menu report động — mục cố định "System Check" trong Sidebar (giống Health Check). Hiển thị cây phân cấp các kết nối tới một RK7 Reference/Report Server gốc, dựng bằng cách gọi đệ quy endpoint `GET https://{ip}:{port}/Connects` (Basic Auth, self-signed cert, scrape HTML bằng `cheerio` — cùng pattern với Compare Masterdata).

### Cấu hình — `backend/config/connection_check_sources.json`
Mỗi entry: `networkName` (tên server, dùng để khớp với `NetworkNameText` trả về trong `/Connects` của server cha), `ip`/`port` **quản trị thật** (không phải `remoteIp` nhìn từ server cha — có thể là NAT/LAN), `user`/`pass`, `isRoot` (server khởi đầu, có thể có nhiều root — VD PROD/UAT), `label`.
> File này chứa IP nội bộ thật — không nên copy nguyên văn sang tài liệu/project khác.

### Quy tắc dựng cây (`services/connectionsMonitor.js`)
- Chỉ node `applicationKind === 'Report Server'` mới có thể mở rộng; `Manager Station`/`Cash Server` (và mọi giá trị lạ khác) luôn là `leaf`.
- Report Server chỉ mở rộng được nếu `networkName` khớp entry trong config; không khớp → `no_config` (không phải lỗi, chỉ dừng lại).
- Chống lặp vô hạn bằng tập `visited` (theo `ip:port`) dùng chung xuyên suốt 1 lần chạy → gặp lại đánh dấu `cycle_detected`.
- Giới hạn độ sâu `maxDepth` (mặc định 6, truyền qua body request) → vượt quá đánh dấu `max_depth_reached`.
- Lỗi gọi `/Connects` cho 1 node (timeout, auth fail, network error) không làm hỏng cả cây — node đó đánh dấu `unreachable` kèm `error`, các nhánh khác tiếp tục chạy.
- Duyệt cây **tuần tự** (không song song) để tránh dồn tải server RK7 production — cùng tinh thần với Health Check engine (mục 4). Có thể đổi sang `Promise.all` theo từng tầng kèm giới hạn concurrency nếu cần tăng tốc sau này.
- Không lưu lịch sử các lần chạy — mỗi lần "Run" gọi realtime.

### Endpoint
- `GET /api/reports/connections-monitor/roots` — danh sách server có `isRoot: true` (ẩn `user`/`pass`), phục vụ dropdown chọn root ở FE.
- `POST /api/reports/connections-monitor/run` — body `{ rootNetworkName, maxDepth? }`, trả `{ runAt, root, summary }` với `root` là cây JSON đệ quy (`status`: `expanded`/`no_config`/`unreachable`/`leaf`/`cycle_detected`/`max_depth_reached`).

### Summary (`computeSummary`)
Duyệt cây kết quả 1 lần (không gọi thêm request) để tổng hợp `{ totalReportServer, totalCashServer, totalManagerStation, noConfigCount, unreachableCount, cycleDetectedCount, maxDepthReachedCount }`. Root không tính vào tổng — chỉ đếm node con, theo số lần xuất hiện thực tế (không dedupe). Node `cycle_detected` không cộng vào `totalReportServer` (đã đếm ở lần xuất hiện đầu); `no_config`/`unreachable`/`max_depth_reached` vẫn cộng vào `totalReportServer` vì là kết nối thật, chỉ không đi sâu thêm được. Để đảm bảo `max_depth_reached` không bao giờ trùng với `cycle_detected`, `buildChildNode` kiểm tra `visited` **trước** khi kiểm tra `maxDepth`.

## 7. Biến môi trường (`.env`, giá trị đã lược bỏ)
```
PORT=
DB_USER= / DB_PASSWORD= / DB_SERVER= / DB_DATABASE= / DB_PORT=      # MSSQL chính (RK7_VTI)
CRM_USER= / CRM_PASSWORD= / CRM_SERVER= / CRM_DATABASE= / CRM_PORT= # MSSQL CRM
PG_USER= / PG_PASSWORD= / PG_HOST= / PG_DATABASE= / PG_PORT=        # PostgreSQL
# (không set trong .env hiện tại, dùng default trong code)
RK7_API_URL=
RK7_API_TIMEOUT=
```

## 8. Điểm cần lưu ý khi trao đổi ở project khác
- Không có authentication middleware bảo vệ các route `/api/reports/*` và `/api/healthcheck/*` — bất kỳ ai gọi được API đều thực thi được report/health-check, kể cả chưa đăng nhập (đăng nhập chỉ là rào chắn ở UI, không phải ở API).
- Không có ORM/migration — schema DB được giả định có sẵn (nhiều function/SP được gọi trực tiếp: `f_getEmployeeByEmail`, `f_GetLicenseExpired`, `f_GetRestaurantsList`, `sp_BO101_Report_Sales_By_Shift`, `f_onlinesalerevenuetotal`, `f_latency_system_kpi`, v.v.).
- Một số route có timeout SQL cực lớn (30,000,000 ms) cho các report nặng (BO.101, BO.104) — cần cân nhắc khi bàn về khả năng chịu tải/concurrency.
