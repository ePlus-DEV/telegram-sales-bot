# Hướng dẫn bắt đầu — Telegram Sales Bot

[← README](../README.md) · [English](GETTING_STARTED.md) · [Triển khai](DEPLOYMENT.md) · [Cấu hình tối thiểu từng nền tảng](MINIMUM_REQUIREMENTS.md)

Hướng dẫn này dành cho **shop thử nghiệm mới**. Không dùng database hoặc token bot production để test.

## 1. Chuẩn bị

- Cài **Node.js 22+** (khuyến nghị Node 24), Git và terminal.
- Tạo bot thử nghiệm qua [@BotFather](https://t.me/BotFather), giữ `BOT_TOKEN` bí mật.
- Có tài khoản Cloudflare (Workers + D1) nếu dùng phương án serverless đơn giản nhất. Với Vercel/Railway/Render/Koyeb/Docker/Oracle/AWS/Google Cloud/Azure, bản Node hiện cần Turso từ xa. Xem [bảng yêu cầu tối thiểu và hạn mức miễn phí](MINIMUM_REQUIREMENTS.md); hỗ trợ từng nhà cung cấp có thể ở mức tài liệu/Docker dùng chung, chưa phải tích hợp deploy một chạm.
- Tạo `TELEGRAM_WEBHOOK_SECRET` ngẫu nhiên và mật khẩu `ADMIN_DASHBOARD_PASSWORD` mạnh (nên từ 32 ký tự).
- Nếu bán **hàng vật lý** qua chuyển khoản: chuẩn bị ngân hàng, VietQR và SePay với webhook API Key.

## 2. Lấy mã nguồn

```bash
git clone https://github.com/ePlus-DEV/telegram-sales-bot.git
cd telegram-sales-bot
npm install
npm run check
npm test
npm run docs:check
```

## 3. Triển khai nhanh với Cloudflare Workers + D1

```bash
npx wrangler login
npx wrangler d1 create eplus-telegram-sales-bot
```

Thay `REPLACE_WITH_YOUR_D1_DATABASE_ID` trong `wrangler.toml` bằng UUID vừa tạo. Sau đó:

```bash
npm run db:migrate
npm run deploy
```

Lệnh migration áp dụng **toàn bộ schema 0001–0006 vào D1 từ xa**. Không bỏ qua migration vì bot đã dùng bảng đơn hàng, thanh toán, admin và ngôn ngữ.

Khai báo secrets trên Cloudflare:

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ADMIN_DASHBOARD_PASSWORD
```

Thiết lập `ADMIN_TELEGRAM_ID` và các biến ngân hàng nếu sử dụng chuyển khoản; xem [bảng cấu hình](CONFIGURATION.md). **Không nhập token/mật khẩu thật vào GitHub.** Thiếu mật khẩu admin thì `/admin` trả 503.

## 4. Đăng ký Telegram webhook

Chỉ thực hiện khi bạn đã có URL public HTTPS. Trên **Windows PowerShell**:

```powershell
$env:BOT_TOKEN = "TOKEN_BOT_THU_NGHIEM"
$env:TELEGRAM_WEBHOOK_SECRET = "GIONG_SECRET_TREN_CLOUDFLARE"
$env:PUBLIC_BASE_URL = "https://TEN_WORKER.workers.dev"
npm run webhook:register
```

Trên Linux/macOS:

```bash
export BOT_TOKEN='TOKEN_BOT_THU_NGHIEM'
export TELEGRAM_WEBHOOK_SECRET='GIONG_SECRET_TREN_HOST'
export PUBLIC_BASE_URL='https://TEN_WORKER.workers.dev'
npm run webhook:register
```

Đây là thao tác gọi `setWebhook`, **không tự diễn ra chỉ vì bạn deploy code**. Mỗi token Telegram chỉ nhận một webhook đang hoạt động; nên tách bot staging và production.

## 5. Kiểm tra lần đầu

1. Truy cập `https://TEN_WORKER.workers.dev/healthz` — xác nhận máy chủ có phản hồi.
2. Trong Telegram, thử `/start`, `/language`, `/catalog`.
3. Mở `https://TEN_WORKER.workers.dev/admin`, đăng nhập và tạo sản phẩm số mẫu; thêm **key giả để thử nghiệm**.
4. Kiểm tra catalog, link Stars, trạng thái đơn, và khả năng truy cập `/mykey MÃ_ĐƠN` (chỉ chủ đơn).
5. Nếu bật hàng vật lý, khai báo SePay webhook trỏ đến `/sepay/webhook`, đúng tài khoản và API key; kiểm tra trường hợp tiền đến chậm/trùng/sai số tiền.

**Lưu ý:** Sản phẩm số bán trong Telegram dùng **Telegram Stars**, không thay bằng VietQR/SePay. VietQR + SePay chỉ dành cho hàng hóa/dịch vụ vật lý được phép. Chưa có xác nhận kiểm thử tiền thật và chưa nên mở cho khách hàng production.

## 6. Đọc thêm

- [Triển khai Cloudflare, Vercel, Railway, Render, Koyeb, Oracle, AWS, Google Cloud và Azure](DEPLOYMENT.md)
- [Bảng CPU/RAM tối thiểu, database và điều kiện miễn phí](MINIMUM_REQUIREMENTS.md)
- [Bảng biến môi trường và secret](CONFIGURATION.md)
- [Danh sách lệnh cho khách và admin](COMMANDS.md)
- [Luồng thanh toán, hoàn Stars và đối soát](PAYMENTS.md)
- [Khắc phục lỗi, backup và vận hành](OPERATIONS.md)
- [Roadmap và những phần chưa hoàn thành](../ROADMAP.md)
