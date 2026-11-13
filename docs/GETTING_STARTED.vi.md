# Bắt đầu — chạy bot thử nghiệm đầu tiên

[← Tài liệu](README.md) · [English](GETTING_STARTED.md) · [Cấu hình](CONFIGURATION.md) · [Nơi triển khai](DEPLOYMENT.md)

Hướng dẫn này để chạy **một bot thử nghiệm**, **không phải** quy trình mở bán production. Không dùng token, database hay key sản phẩm thật trong môi trường thử nghiệm.

## 1. Chuẩn bị

Cần **Node.js 22+ (khuyến nghị 24)**, Git, terminal, **token bot mới** từ [@BotFather](https://t.me/BotFather), Telegram ID dạng số của quản trị viên và mật khẩu Web Admin ngẫu nhiên tối thiểu 16 ký tự (khuyến nghị 32+).

| Phương án | Database | Khi nào chọn |
| --- | --- | --- |
| **Cloudflare Workers** | **D1** | Đơn giản nhất để test; không cần VPS |
| **Node.js / Docker / Vercel** | **Turso/libSQL từ xa** | Muốn chạy ứng dụng trên host khác |

Source **chưa hỗ trợ trực tiếp** PostgreSQL/Neon/Supabase hoặc SQLite local. Xem [database thực sự được hỗ trợ](DATABASES.md) và [bảng yêu cầu host](MINIMUM_REQUIREMENTS.md).

## 2. Tải và kiểm tra source

```bash
git clone https://github.com/ePlus-DEV/telegram-sales-bot.git
cd telegram-sales-bot
npm install
npm run check
npm run staging:check-migrations
npm test
npm run docs:check
```

Các lệnh trên chỉ kiểm tra **offline**, không tự deploy, không tạo database trên cloud và không đăng ký webhook.

## 3. Khởi tạo database và deploy

### Phương án A — Cloudflare Workers + D1

```bash
npx wrangler login
npx wrangler d1 create eplus-telegram-sales-bot
```

Thay `REPLACE_WITH_YOUR_D1_DATABASE_ID` trong `wrangler.toml` bằng UUID D1 vừa tạo, giữ binding tên `DB`. Kiểm tra đúng **database thử nghiệm**, sau đó áp dụng migration **0001–0006**:

```bash
npm run db:migrate
```

Lưu secrets trong Cloudflare:

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ADMIN_DASHBOARD_PASSWORD
```

Khai báo thêm `ADMIN_TELEGRAM_ID` qua cấu hình biến môi trường. Nếu bán **hàng vật lý hợp lệ** bằng VietQR/SePay, đọc [bảng cấu hình](CONFIGURATION.md) để bổ sung biến ngân hàng. Sau đó:

```bash
npm run deploy
```

Truy cập `https://YOUR_WORKER.workers.dev/healthz` bằng URL được Cloudflare cấp.

### Phương án B — Node.js / Docker + Turso

Tạo **database Turso thử nghiệm mới**, lấy URL và auth token. Chỉ chạy migration khi đã xác nhận đúng database:

```bash
export TURSO_DATABASE_URL='libsql://YOUR_TEST_DB.turso.io'
export TURSO_AUTH_TOKEN='YOUR_PRIVATE_TEST_TOKEN'
npm run db:migrate:turso
```

Nếu dùng Windows PowerShell, thay `export` bằng `$env:TURSO_DATABASE_URL="..."` và `$env:TURSO_AUTH_TOKEN="..."`.

Chọn dịch vụ ở [Hướng dẫn triển khai](DEPLOYMENT.md), hoặc dùng [Deploy badges](DEPLOY_BUTTONS.md). Đặt URL/token Turso cùng các biến bot/Admin ở kho secrets của host. Docker sử dụng `PORT` (mặc định 3000) và cần HTTPS bên ngoài. **Docker không tự chạy migration hoặc lịch đối soát**; xem [Vận hành](OPERATIONS.md#scheduling-and-retries).

## 4. Đăng ký Telegram webhook thủ công

Sau khi HTTPS hoạt động, nhập **origin HTTPS thực tế** (không thêm `/telegram/webhook`):

```bash
export BOT_TOKEN='TOKEN_BOT_THU_NGHIEM'
export TELEGRAM_WEBHOOK_SECRET='BI_MAT_GIONG_VOI_HOST'
export PUBLIC_BASE_URL='https://TEN_HOST_THUC_TE'
npm run webhook:register
```

**Windows PowerShell:**

```powershell
$env:BOT_TOKEN = "TOKEN_BOT_THU_NGHIEM"
$env:TELEGRAM_WEBHOOK_SECRET = "BI_MAT_GIONG_VOI_HOST"
$env:PUBLIC_BASE_URL = "https://TEN_HOST_THUC_TE"
npm run webhook:register
```

Mỗi token Telegram chỉ có **một webhook đang hoạt động**. Tuyệt đối không dùng bot production để đăng ký sang preview hoặc InstaBox tạm thời.

## 5. Kiểm tra bot

1. Mở `/healthz` (HTTP 200 **chưa** chứng minh database/thanh toán hoạt động).
2. Nhắn `/start`, `/language`, `/catalog` cho bot thử nghiệm.
3. Mở `https://TEN_HOST_THUC_TE/admin`, đăng nhập, tạo sản phẩm mẫu và nhập **key giả**.
4. Kiểm tra đơn hàng, webhook không hợp lệ bị từ chối và người không có quyền không vào Admin được.
5. Nếu thử thanh toán vật lý, chỉ dùng thông tin thử nghiệm và xác minh riêng webhook xác thực của SePay.
6. Xem log, lịch xử lý đơn hết hạn và gửi lại thông báo nếu dùng Node/Docker.

**Chưa nên nhận tiền thật:** cần hoàn thành [kiểm thử staging](STAGING_VALIDATION.md), [luồng thanh toán](PAYMENTS.md) và [release gates](../ROADMAP.md#p0--release-blockers-deferred-execution-required-for-launch).

## Khắc phục nhanh

| Vấn đề | Cần kiểm tra |
| --- | --- |
| `/healthz` OK nhưng bot không trả lời | Token, URL `setWebhook`, secret, log |
| Lỗi thiếu bảng | UUID D1 / URL Turso, đủ migrations, đúng database |
| Admin trả 503 | Thiếu mật khẩu Admin hoặc ngắn hơn 16 ký tự |
| Không đăng nhập được | HTTPS, Host và `X-Forwarded-Proto`, cookie/CSRF |
| Thanh toán thành công nhưng không nhận key | Ledger/outbox và `/mykey ORDER_ID`, không giao key lặp |

[Hướng dẫn vận hành](OPERATIONS.md) · [Danh mục tài liệu](README.md)
