# Frontend — WebReportOnline

React 19 + Vite 7 SPA (single page app), không dùng router thư viện (React Router) — điều hướng trang được quản lý thủ công bằng state trong `App.jsx`.

## 1. Khởi động & cấu hình
- `src/main.jsx` render `<App />` vào DOM.
- `src/config.js` (`APP_CONFIG`) — tên app, logo, icon fallback, dùng chung cho Sidebar/Login.
- `src/services/api.js` — axios instance với `baseURL` được suy ra **động theo hostname trình duyệt** (`window.location.protocol + hostname + :5577/api`) — không hardcode domain, cho phép chạy trên nhiều môi trường (localhost, LAN IP) mà không cần build lại.

## 2. Luồng ứng dụng — `App.jsx`
- State gốc: `user`, `reports` (menu report lấy từ backend), `selectedReportId`, `connectionError`.
- **Session**: khi load, đọc `user` từ `localStorage`; không có refresh token, không hết hạn — session tồn tại vĩnh viễn cho tới khi Logout hoặc xoá localStorage thủ công.
- Khi có `user` → gọi `GET /api/reports` để build menu Sidebar; lỗi kết nối hiển thị banner đỏ kèm URL đang cố gọi tới (hữu ích để debug firewall/CORS).
- `findReport(id)` — duyệt đệ quy cấu trúc `group → items (item hoặc sub-group) → items` để tìm report được chọn theo `id`.
- Điều hướng theo `selectedReportId`:
  - `'sql-health-check'` → render `<HealthCheckPage />`
  - `'connections-monitor'` → render `<ConnectionsMonitorPage />`
  - còn lại → render `<ReportViewer reportMeta={selectedReport} />`
- Chưa đăng nhập → chỉ render `<Login />`.

## 3. Component `Login.jsx`
- Form email/password đơn giản, gọi `onLogin` (prop từ `App`) → `POST /api/auth/login`.
- Xử lý lỗi hiển thị message trả về từ backend (`response.data.message`).
- Không có "remember me", không có forgot-password, không có captcha/rate-limit ở FE.

## 4. Component `Sidebar.jsx`
- Sidebar có thể **pin/unpin**: mặc định pinned (mở rộng cố định 280px); khi unpin, thu gọn còn 60px và **mở rộng tạm khi hover chuột**.
- Render menu 2 cấp từ dữ liệu `reports` (group → item, hoặc group → sub-group → item).
- Mục **"System Check"** (health check + connections monitor) được gắn cứng trong code (không đến từ API `/api/reports`), luôn hiện ở cuối menu.
- Không xử lý logic chọn report — chỉ gọi callback `onSelectReport(id)` lên `App`.

## 5. Component `HealthCheckPage.jsx`
UI cho tính năng SQL Server Health Check (xem chi tiết backend ở [01-backend.md](./01-backend.md)):
- Chọn **instance** (`general`/`crm`, lấy từ `GET /api/healthcheck/instances`) và **section** (A/B, checkbox).
- Nút "Run Health Check" → `POST /api/healthcheck/run`.
- Kết quả hiển thị dạng **card gập/mở theo từng query** (`QueryCard`):
  - Card tự động **mở sẵn nếu status khác green** (ưu tiên hiển thị vấn đề).
  - Mỗi metric có `StatusPill` (chấm tròn màu + nhãn OK/WARN/CRIT) theo `green/yellow/red`.
  - Có khối "Raw data" dạng `<details>` để xem toàn bộ rows thô nếu cần soi sâu.
- Thanh tổng kết hiển thị overall status, tổng số query, tổng thời gian chạy, thời điểm chạy (`runAt`), `runId`.
- Không lưu lịch sử các lần chạy trước — mỗi lần Run ghi đè kết quả cũ trên UI (không có storage phía FE lẫn BE cho lịch sử).

## 5b. Component `ConnectionsMonitorPage.jsx`
UI cho tính năng Connections Monitor (xem chi tiết backend ở [01-backend.md](./01-backend.md), mục 6b):
- Chọn **root server** (`GET /api/reports/connections-monitor/roots`) và nhập **max depth** (mặc định 6).
- Nút "Run" → `POST /api/reports/connections-monitor/run`.
- **Summary bar** (`SummaryBar`) hiển thị ngay dưới dòng "Chạy lúc...": dòng 1 tổng số Report Server/Cash Server/Manager Station trong cây (field `summary` từ BE); dòng 2 cảnh báo No Config/Unreachable/Cycle/Max Depth (ẩn, hiện "✅ Không có vấn đề" nếu cả 4 đều = 0). Badge tái dùng đúng màu status trong tree để nhất quán.
- Kết quả hiển thị dạng **cây (tree view)** đệ quy (`TreeNode`):
  - Chỉ node `status: 'expanded'` có con mới có chevron mở/thu; `Manager Station`/`Cash Server` luôn là leaf không mở rộng.
  - Badge màu theo `status`: xanh dương (`expanded`), xám (`leaf`/`no_config`), đỏ (`unreachable`, kèm tooltip lỗi), cam (`cycle_detected`/`max_depth_reached`).
  - **Mặc định đóng (collapsed) toàn bộ** sau mỗi lần Run — chỉ root luôn hiển thị cố định hàng con cấp 1 (không thu được), các cấp sâu hơn người dùng tự bấm để mở, không có logic tự-mở-nếu-có-vấn-đề (Summary Bar đã đảm nhiệm việc báo tổng quan). Đổi root sang key theo `runAt` để toàn bộ trạng thái mở/đóng reset về mặc định mỗi lần chạy lại.
- Không lưu lịch sử các lần chạy — mỗi lần Run ghi đè kết quả cũ trên UI.

## 6. Component `ReportViewer.jsx` (trọng tâm — ~2800 dòng)
Đây là component lớn nhất, đóng vai trò **table/report engine dùng chung** cho phần lớn report, cộng thêm các **dashboard chuyên biệt** cho từng report có `isDashboard: true`.

### 6.1 Kiến trúc chung
- `ReportViewerContent` — component chính, nhận `reportMeta` (từ menu), tự fetch dữ liệu khi `reportMeta` hoặc `params` thay đổi.
- `ReportViewer` (export mặc định) — wrapper ngoài, dùng `key={reportMeta?.id}` để **buộc remount toàn bộ state** mỗi khi đổi sang report khác (tránh rò rỉ state giữa các report).
- Phân biệt 2 chế độ theo `reportMeta.isDashboard`:
  - **Bảng dữ liệu chuẩn** (table-based reports)
  - **Dashboard trực quan** (biểu đồ + KPI, dữ liệu do server tổng hợp sẵn ở field `summary`)

### 6.2 Form tham số (Parameters)
- Sinh động từ `reportMeta.parameters` — hỗ trợ các kiểu: `date`, `number`, `checkbox`, `checkbox-list` (đa chọn, có thể tải option động qua `sourceUrl`).
- Với `checkbox-list` có `sourceUrl`, FE tự gọi `GET /api/reports/params/:type` để lấy option (VD: danh sách nhà hàng, vùng, franchise, collectionId).
- Riêng report `compare_masterdata` có khối cấu hình tham số đặc thù (chọn CollectionID cần so sánh).
- Có phần thu gọn/mở rộng khối tham số (`showParams`).

### 6.3 Bảng dữ liệu (chế độ không phải dashboard)
Tính năng bảng:
- **Sort** theo cột (click header, hỗ trợ toggle asc/desc).
- **Filter theo cột** qua `FilterPopover` — 3 kiểu: text (contains), multi-select (theo `uniqueValues` do BE trả), numeric (operator `=, >, <, >=, <=, between`).
- **Group theo nhiều cột** (đa cấp), có thể expand/collapse từng nhóm, mỗi nhóm hiển thị `count` và **aggregate tự động** (sum) cho các cột số.
- **Phân trang** — theo dòng khi không group, theo nhóm khi có group.
- **Export Excel** — dùng `xlsx`, xuất dữ liệu hiện tại ra file `.xlsx` (bỏ qua wrapper `{type, data}` để lấy dữ liệu gốc).
- Xử lý hiển thị đặc thù theo từng report id ngay trong tầng render cell, ví dụ:
  - `online_compare`: thêm cột `RowNumber`, tô màu diff (`DIFF_CHECK`/`DIFF_ORDER`), nhãn trạng thái so khớp (`Compared` / `No data SkyOnline` / `No data rkDtaFlow`).
  - `data_reconciliation`: tô màu cặp cột `MS_*` / `PG_*` khi lệch nhau.
  - `compare_masterdata`: cột `CollectionID`/`CollectionName` được **sticky** (ghim trái) khi cuộn ngang; tô màu `OK`/`DIFF` theo trạng thái so khớp version.

### 6.4 Các Dashboard chuyên biệt (`isDashboard: true`)
Mỗi dashboard là 1 component riêng trong cùng file, dùng **Recharts** để vẽ biểu đồ:

| Report id | Component | Nội dung |
|---|---|---|
| `latency_by_location` | `LocationDashboard` | Bản đồ/độ trễ theo địa điểm (SLA, top node tệ nhất, phân bố SLA), có chọn địa điểm để xem chi tiết |
| `sales_analyze` | `SalesAnalyzeDashboard` | Phân tích doanh thu đa kênh theo ngày, nhiều biểu đồ có thể ẩn/hiện từng series (`hidden1..5`), có `ChannelFilter` để bật/tắt kênh |
| `online_sales_revenue_snapshot` | `OnlineSalesRevenueSnapshotDashboard` | Số check theo thời gian cập nhật (snapshot theo phút), có `CustomXAxisTick` tùy biến trục X |
| `general_online_sales` | `OnlineSalesDashboard` | Dashboard vận hành tổng quan: số nhà hàng mở/đóng, check count, order number, top 5 cao/thấp nhất, phân bổ theo revenue center |
| `upload_latencies` | (bảng + biểu đồ latency chung, không có component riêng named) | Hiệu năng/độ trễ upload dữ liệu theo ngày |

- Với dashboard, `extraData`/`summary` do BE tính sẵn (aggregate, KPI, phân loại) — FE chủ yếu **trình bày**, hạn chế tính toán lại trên tập dữ liệu lớn.
- Có format số dùng chung (`formatNumber`) và các hàm parse ngày tránh lệch timezone khi hiển thị trục thời gian.

### 6.5 Trạng thái tải & lỗi
- `loading`/`error` cục bộ cho từng report; khi lỗi hiển thị message trả về từ backend (`msg`/`error` field).
- Không có retry tự động — người dùng cần bấm lại (đổi tham số / F5).

## 7. UI/Style
- Không dùng UI framework/component library (không MUI/AntD/Tailwind) — style viết trực tiếp bằng **inline style objects** trong JSX (kể cả các thành phần phức tạp như sticky column, popover filter).
- `App.css` / `index.css` chỉ định nghĩa layout khung (`.app-container`, `.sidebar`, `.main-content`) và các class dùng cho menu.
- Toàn bộ label tiếng Việt được viết trực tiếp trong JSX/JS, không có lớp i18n.

## 8. Điểm cần lưu ý khi trao đổi ở project khác
- `ReportViewer.jsx` đang gánh quá nhiều trách nhiệm (table engine dùng chung + 4-5 dashboard chuyên biệt + xử lý hiển thị đặc thù theo từng report id) trong 1 file ~2800 dòng — nếu bàn về refactor/tách module, đây là điểm nóng nhất.
- Không có test tự động (unit/e2e) ở cả FE lẫn BE.
- Không có TypeScript — toàn bộ props/response shape là ngầm định, dễ lệch khi đổi API.
