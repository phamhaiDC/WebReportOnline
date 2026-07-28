# WebReportOnline — Tổng quan Project

## Mục đích
WebReportOnline là ứng dụng web nội bộ để **xem báo cáo vận hành, đối soát dữ liệu và kiểm tra sức khỏe hệ thống** cho chuỗi nhà hàng sử dụng nền tảng **RK7 (r_keeper 7)**. Dữ liệu được lấy từ hai nguồn song song:
- **MSSQL** ("Sky" — hệ thống RK7 tại chỗ / on-prem)
- **PostgreSQL** ("Cloud" — hệ thống tổng hợp dữ liệu online)

Nhiều report có chức năng **so sánh chéo giữa hai nguồn** (reconciliation) để phát hiện lệch dữ liệu giữa on-prem và cloud.

## Kiến trúc tổng thể

```
┌─────────────┐   HTTPS/REST    ┌──────────────┐        ┌────────────┐
│  Frontend   │ ───────────────▶│   Backend    │───────▶│   MSSQL    │ (RK7_VTI, CRM)
│  (React +   │  axios (JSON)   │  (Express)   │───────▶│ PostgreSQL │ (Cloud/online data)
│   Vite)     │◀─────────────── │  Node.js     │───────▶│  RK7 API   │ (XML interface, auth)
└─────────────┘                 └──────────────┘───────▶│ RK7 Web    │ (References/masterdata HTML scrape)
                                                          └────────────┘
```

- **Frontend**: chạy độc lập (Vite dev server / static build), gọi backend qua REST API tại cổng **5577**.
- **Backend**: Express API, kết nối trực tiếp tới MSSQL + PostgreSQL, đồng thời gọi ra các server RK7 khác qua HTTP(S) (API XML để xác thực, HTML scraping để lấy masterdata).
- Không có lớp ORM — dùng SQL thô / gọi stored procedure / table-valued function trực tiếp.
- Không có hàng đợi (queue) hay cache layer; mọi request là đồng bộ, tính toán ngay trong request-response cycle.

## Công nghệ chính

| Layer | Stack |
|---|---|
| Frontend | React 19, Vite 7, Recharts (biểu đồ), xlsx (export Excel), axios |
| Backend | Node.js, Express 4, `mssql` driver, `pg` driver, `axios`, `cheerio` (HTML scraping), `cors`, `dotenv` |
| Database | Microsoft SQL Server (RK7 core + CRM instance riêng), PostgreSQL (dữ liệu online tổng hợp) |
| Auth | Xác thực 2 bước: tra cứu nhân viên qua SQL function + xác thực mật khẩu qua RK7 XML API |

## Cấu trúc thư mục

```
WebReportOnline/
├── backend/
│   ├── index.js                    # entrypoint Express app
│   ├── config/
│   │   ├── db.js                   # kết nối MSSQL + PostgreSQL
│   │   └── masterdata_sources.json # danh sách server RK7 để so sánh masterdata
│   ├── routes/
│   │   ├── auth.js                 # POST /api/auth/login
│   │   ├── reports.js              # GET/POST /api/reports/* (toàn bộ report + dashboard)
│   │   ├── healthcheck.js          # /api/healthcheck/* (health check SQL Server)
│   │   ├── connectionsMonitor.js   # /api/reports/connections-monitor/*
│   │   └── rk7Usage.js             # /api/reports/rk7-usage/* (RK7 Usage — Object Usage filter)
│   ├── .env                        # credentials thật — KHÔNG commit (đã thêm .gitignore)
│   └── .env.example                # template biến môi trường, không chứa giá trị thật
├── .gitignore
└── frontend/
    └── src/
        ├── App.jsx                 # điều phối auth + routing giữa các trang
        ├── config.js                # tên app, logo
        ├── services/api.js          # axios client gọi backend
        └── components/
            ├── Login.jsx
            ├── Sidebar.jsx
            ├── ReportViewer.jsx      # trang hiển thị report/dashboard chính (~2800 dòng)
            ├── HealthCheckPage.jsx   # trang health check SQL Server
            ├── ConnectionsMonitorPage.jsx
            └── RK7UsagePage.jsx      # trang RK7 Usage — Object Usage (filter)
```

## Cách chạy (dev)
```bash
# Backend
cd backend
cp .env.example .env   # điền giá trị thật (xin từ người quản lý hạ tầng), .env đã nằm trong .gitignore
npm install
npm run dev             # nodemon, mặc định cổng 5577

# Frontend (terminal khác)
cd frontend
npm install
npm run dev              # Vite dev server
```

## Các file chi tiết khác
- [Backend](./01-backend.md) — routes, kết nối DB, health-check engine, cấu hình
- [Frontend](./02-frontend.md) — kiến trúc component, luồng dữ liệu, UI
- [Tính năng](./03-features.md) — danh sách report/dashboard và nghiệp vụ đi kèm

## Lưu ý bảo mật khi mang tài liệu này sang project khác
- `backend/config/masterdata_sources.json` và `backend/.env` chứa **địa chỉ IP nội bộ, tài khoản/mật khẩu** của các server RK7/DB thật. Các file này **không nên copy nguyên văn** sang project/tài liệu khác — chỉ tham khảo cấu trúc (schema), không tham khảo giá trị.
- Endpoint `/api/auth/login` hiện dùng mật khẩu dạng plain-text khi gọi RK7 API (không hash) — cần lưu ý nếu tài liệu này dùng để bàn bạc về bảo mật/tái sử dụng ở nơi khác.
- **Đã phát hiện**: `backend/.env` (chứa credential thật) hiện đang được **commit trong git** (từ commit đầu tiên của repo), và trước bản cập nhật này repo **chưa có `.gitignore`** nào (kể cả `node_modules/` cũng đang bị track). Đã thêm `.gitignore` + `.env.example` ở bản cập nhật này để chặn commit mới, nhưng **lịch sử git cũ vẫn còn chứa credential thật** — nên cân nhắc xoay vòng (rotate) mật khẩu các instance DB/Superset và dọn lịch sử git nếu repo này từng hoặc sẽ được chia sẻ ra ngoài.
