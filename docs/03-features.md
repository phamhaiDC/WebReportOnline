# Tính năng — WebReportOnline

Danh mục tính năng hiện có, lấy từ menu report động (`GET /api/reports`) + tính năng tĩnh (Health Check, Connections Monitor).

## 1. Đăng nhập
- Xác thực qua email + mật khẩu, kiểm tra chéo giữa SQL Server nội bộ (nhân viên active) và RK7 API (mật khẩu đúng theo hệ thống RK7).
- Không phân quyền theo vai trò — mọi user đăng nhập được đều thấy toàn bộ menu report.

## 2. Nhóm **License**
| Report | Mô tả | Nguồn dữ liệu |
|---|---|---|
| License Expired | Danh sách license sắp hết hạn trong N ngày (tham số `days`, mặc định 10) | MSSQL: `f_GetLicenseExpired(@days)` |

## 3. Nhóm **General**
| Report | Mô tả | Nguồn dữ liệu |
|---|---|---|
| Restaurant List | Danh sách nhà hàng theo trạng thái (Active/Inactive/Deleted), phân trang server-side | MSSQL: `f_GetRestaurantsList()` |
| Common Shift Info | Trạng thái ca (shift) theo ngày, lọc theo `NOT CLOSE`/`CLOSED` | MSSQL: `GetCommonShiftInfoClosed(@date)` |
| Online Data Compare | So sánh dữ liệu online giữa MSSQL (Sky) và PostgreSQL (Cloud) theo từng nhà hàng, tính lệch check/order | MSSQL + PostgreSQL: `f_getskyonlinedata` |
| Common shift closed by time | Phân bố số ca đóng theo giờ trong ngày | PostgreSQL: `f_getClosedShiftByTime($1)` |
| Data reconciliation | Đối soát doanh thu/số liệu ngày giữa MSSQL và PostgreSQL theo nhà hàng (check count, guest count, discount, tax, paid sum...), có tuỳ chọn chỉ hiện dòng lệch | MSSQL + PostgreSQL: `f_getRevenuByDayForCompare(@shiftdate)` |

## 4. Nhóm **Sales Report** (sub-group: "1.1 Báo cáo doanh thu")
| Report | Mã | Mô tả | Nguồn dữ liệu |
|---|---|---|---|
| BO.101 Doanh thu theo ngày | `bo_101` | Doanh thu theo ca, lọc theo khoảng ngày + nhà hàng/franchise/vùng/concept (multi-select) | MSSQL SP: `sp_BO101_Report_Sales_By_Shift` (dùng Table-Valued Parameter cho danh sách GUID) |
| BO.104 Doanh thu theo chi tiết hóa đơn | `bo_104` | Doanh thu chi tiết theo từng hóa đơn, cùng bộ filter như BO.101 | MSSQL SP: `sp_RP_BO_104_Doanh_Thu_Theo_Chi_Tiet_Hoa_Don` |

## 5. Nhóm **Online data monitor** (dashboard)
| Report | Mô tả | Nguồn dữ liệu |
|---|---|---|
| Latencies by date | Hiệu năng/độ trễ upload dữ liệu hệ thống theo thời gian, tuỳ chọn hiện P99 latency | PostgreSQL: `f_upload_latencies_by_range` |
| Latency by location | Dashboard SLA/độ trễ theo từng midserver: KPI tổng quan (typical/outlier latency, fleet size, total uploads), phân bố SLA, top 20 node tệ nhất | PostgreSQL: `f_latency_system_kpi`, `f_latency_sla_distribution`, `f_latency_top_nodes` |

## 6. Nhóm **Online Sales Data** (dashboard)
| Report | Mô tả | Nguồn dữ liệu |
|---|---|---|
| General Online sales | Dashboard vận hành: số nhà hàng mở/đóng, check count, order number, void, paysum, top 5 nhà hàng cao/thấp nhất, phân bổ theo revenue center | PostgreSQL: `f_onlinesalerevenuetotal`, `f_onlinesalebyrevenuecenter` |
| Sales Analyze | Phân tích doanh thu đa kênh trong khoảng ngày (mặc định 10 ngày gần nhất), nhiều biểu đồ có thể bật/tắt series/kênh | PostgreSQL: `f_salerevenuebyrevenuecenter` |
| Online Sales Revenue Snapshot | Theo dõi số check theo thời gian cập nhật (snapshot theo phút) trong khoảng ngày | PostgreSQL: bảng `online_sale_revenue_snapshot` |

## 7. Nhóm **Masterdata Control**
| Report | Mô tả | Nguồn dữ liệu |
|---|---|---|
| Compare Masterdata | So sánh phiên bản (`DataVersion`) và số lượng item (`ItemsCount`) của các Collection masterdata giữa 1 server "master" (chuẩn) và nhiều server RK7 vùng khác (Bắc/Trung/Nam), đánh dấu `OK`/`DIFF` cho từng cặp | Scrape HTML trang `/References` của từng server RK7 (Basic Auth), cấu hình tại `backend/config/masterdata_sources.json` |

## 8. Tính năng hệ thống — SQL Server Health Check
Không thuộc menu report động — mục cố định "System Check" trong Sidebar.
- Chọn 1 trong các **instance SQL Server** đã cấu hình (`general` = RK7_VTI, `crm` = CRM database).
- Chọn chạy **Section A** (chỉ số chung: CPU, memory/PLE, dung lượng file/ổ đĩa, wait stats, session đang chạy, blocking, SQL Agent Jobs, TempDB) và/hoặc **Section B** (chỉ số riêng CRM: memory config, filegroup, top table, missing/zero-read index, hiệu năng query coupon & transaction insert, connections, audit DELETE) — Section B chỉ chạy được khi chọn instance `crm`.
- Kết quả từng chỉ số được gắn nhãn **OK / WARN / CRIT** theo ngưỡng định nghĩa sẵn, tổng hợp thành 1 trạng thái tổng (overall status).
- Chi tiết đầy đủ 17 câu kiểm tra và ngưỡng đánh giá: xem mục "Health Check engine" trong [Backend](./01-backend.md).

## 8b. Tính năng hệ thống — Connections Monitor
Không thuộc menu report động — mục cố định "System Check" trong Sidebar, cùng nhóm với SQL Server Health Check.
- Chọn 1 **root server** (RK7 Reference/Report Server) đã khai báo trong `backend/config/connection_check_sources.json`, có thể có nhiều root (VD PROD/UAT).
- Hệ thống gọi đệ quy `GET https://{ip}:{port}/Connects` (scrape HTML, Basic Auth) để dựng **cây phân cấp** các kết nối: server nào đang có Manager Station / Cash Server / Report Server nào kết nối vào.
- Chỉ node `Report Server` mới mở rộng tiếp được, và chỉ khi tên server đó có khai báo `ip`/`port` quản trị trong config — nếu không có, cây dừng lại ở đó (`no_config`), không phải lỗi.
- Có chống lặp vô hạn (`cycle_detected`), giới hạn độ sâu (`max_depth_reached`, mặc định 6), và không để 1 nhánh lỗi (`unreachable`) làm hỏng cả cây.
- Chi tiết đầy đủ: xem mục "Connections Monitor" trong [Backend](./01-backend.md).

## 8c. Tính năng hệ thống — RK7 Usage
Không thuộc menu report động — mục cố định "System Check" trong Sidebar, cùng nhóm với SQL Server Health Check và Connections Monitor.
- Hiển thị cấu hình **Object Usage (filter)** của hệ thống RK7, đọc trực tiếp từ view `dbo.v_object_usage` (instance `RK7_VTI`, dùng chung `config/db.js`).
- Sidebar trái liệt kê các **FilterType** đang có dữ liệu (tên loại + số dòng); chọn 1 FilterType để xem chi tiết bên phải.
- Nội dung bên phải sắp theo `PRIORITY` tăng dần; phân cấp dựa **hoàn toàn vào cột `PARENTOBJECT`** (không dùng chuỗi `ObjectParentName` để quyết định phân cấp) — `PARENTOBJECT <> 0` gom nhóm dưới header cha (`ObjectParentName`, thu gọn/mở rộng được), `PARENTOBJECT = 0` hiển thị ngang hàng.
- Cột mặc định: `ObjectName`, `PRIORITY`, `FILTER_RESTAURANT`, `FILTER_PERIOD`, `FILTER_STARTAT`, `FILTER_STOPAT`; toàn bộ cột `FILTER_*` còn lại ẩn mặc định, bật/tắt qua dropdown "Chọn cột". `FILTER_STARTAT`/`FILTER_STOPAT` là `datetime` (định dạng `dd/MM/yyyy HH:mm`, coi mốc rỗng Delphi `1899-12-30` là "—"); các `FILTER_*` khác là ID/bitmask, hiển thị raw ở v1.
- Có ô tìm kiếm theo `ObjectName` trong FilterType đang xem.
- Backend: `GET /api/reports/rk7-usage/filtertypes`, `GET /api/reports/rk7-usage/usage?filtertype=NN` (`backend/routes/rk7Usage.js`) — dùng `sql.Request().input(...)` tham số hóa, không tạo pool/connection mới, không thêm biến `.env`.

## 9. Tính năng ngang hàng (áp dụng cho hầu hết report dạng bảng)
Không phải "report" riêng nhưng là năng lực dùng chung xuyên suốt UI:
- Sort / filter (text, multi-select, numeric range) theo từng cột.
- Group nhiều cấp theo cột, tự tính aggregate (sum) cho cột số.
- Phân trang (theo dòng hoặc theo nhóm).
- Export ra file Excel (`.xlsx`) với dữ liệu đang hiển thị.
- Tham số lọc động (ngày, số, checkbox, checkbox-list với option tải từ API).

## 10. Bảng tổng hợp nguồn dữ liệu theo report
Giúp hình dung nhanh report nào phụ thuộc hệ nào khi bàn về mở rộng/migrate:

| Nguồn | Report sử dụng |
|---|---|
| Chỉ MSSQL | License Expired, Restaurant List, Common Shift Info, BO.101, BO.104 |
| Chỉ PostgreSQL | Common shift closed by time, Latencies by date, Latency by location, General Online sales, Sales Analyze, Online Sales Revenue Snapshot |
| Cả MSSQL + PostgreSQL (đối soát) | Online Data Compare, Data reconciliation |
| HTTP scrape server RK7 khác (ngoài DB) | Compare Masterdata, tham số `collectionIds`, Connections Monitor |
| RK7 XML API (auth) | Đăng nhập |
