# Getting started — first test bot

[← README](../README.md) · [Tiếng Việt](GETTING_STARTED.vi.md) · [Deployment options](DEPLOYMENT.md) · [Provider minimums](MINIMUM_REQUIREMENTS.md)

This guide is for a **new test shop**, not a migration of an existing production database. A Telegram bot token is a secret; do not post it in issues, PRs or screenshots.

## Prerequisites

- Node.js **22 or newer** (24 recommended), Git, terminal access.
- A new **test Telegram bot** created through [@BotFather](https://t.me/BotFather); record its token privately.
- For easiest serverless setup: a Cloudflare account with Workers and D1 access. AWS/GCP/Azure VM deployments can reuse generic Docker; managed Cloud Run and Azure Container Apps are unverified candidates. Compare their resource constraints and free-tier eligibility in [provider minimums](MINIMUM_REQUIREMENTS.md).
- Optional physical payments: a bank account with a supported VietQR BIN and a SePay account configured for authenticated webhooks.
- A unique randomly generated `ADMIN_DASHBOARD_PASSWORD` (32+ characters recommended), plus your numeric `ADMIN_TELEGRAM_ID`.

## 1. Get the application

```bash
git clone https://github.com/ePlus-DEV/telegram-sales-bot.git
cd telegram-sales-bot
npm install
npm run check
npm test
npm run docs:check
```

## 2. Choose the database/runtime

**Cloudflare (recommended for a first test)**

```bash
npx wrangler login
npx wrangler d1 create eplus-telegram-sales-bot
```

Copy the returned D1 UUID into `wrangler.toml` under `database_id`, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

```bash
npm run db:migrate
npm run deploy
```

The migration command applies the schema in `migrations/0001_*.sql` through `0006_*.sql` to the **remote D1 database**. On a local-only development database, use `npm run db:migrate:local` instead.

**Other platforms:** Vercel, Railway, Render, Koyeb and Docker use an external **Turso** database. Follow [Deployment](DEPLOYMENT.md) and then the [configuration table](CONFIGURATION.md). Do **not** rely on container/serverless local SQLite for paid orders.

## 3. Configure your hosting secrets

For Cloudflare, set at least:

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ADMIN_DASHBOARD_PASSWORD
```

Also configure `ADMIN_TELEGRAM_ID` via the Cloudflare dashboard or `[vars]` in `wrangler.toml`. If you enable physical orders, configure `SEPAY_WEBHOOK_API_KEY`, `BANK_BIN`, `BANK_ACCOUNT_NO`, and `BANK_ACCOUNT_NAME`. See [Configuration](CONFIGURATION.md) for required/optional settings; do not commit secrets to `wrangler.toml`.

The admin page will return **503** if the dashboard password is unset or too short; this is deliberate.

## 4. Register the Telegram webhook

After deployment, use the actual **public HTTPS base URL**, and run the webhook-registration script **from your terminal**, not through CI or a public browser:

```bash
export BOT_TOKEN='YOUR_TEST_BOT_TOKEN'
export TELEGRAM_WEBHOOK_SECRET='SAME_SECRET_AS_HOST'
export PUBLIC_BASE_URL='https://YOUR_HOST.example'
npm run webhook:register
```

**Windows PowerShell**

```powershell
$env:BOT_TOKEN = "YOUR_TEST_BOT_TOKEN"
$env:TELEGRAM_WEBHOOK_SECRET = "SAME_SECRET_AS_HOST"
$env:PUBLIC_BASE_URL = "https://YOUR_HOST.example"
npm run webhook:register
```

The script calls Telegram `setWebhook` for `/telegram/webhook` with a secret-token header. **One bot token supports one active Telegram webhook URL.** Use a different bot for staging versus production; avoid changing live webhook routing by accident.

## 5. Smoke test before touching payments

1. Open `https://YOUR_HOST.example/healthz`. HTTP 200 proves the HTTP handler responded, **not** that a payment or database migration succeeded.
2. Message your test bot with `/start`, `/language`, then `/catalog`.
3. Open `https://YOUR_HOST.example/admin`, sign in using your dashboard password, create a **test digital** product and add a **non-sensitive test key**.
4. Re-run `/catalog`, verify the product is listed. Test a controlled Stars invoice flow only in a safe test environment and according to Telegram's current payment guidance.
5. If physical transfers are enabled, configure SePay's incoming-transfer JSON webhook to `https://YOUR_HOST.example/sepay/webhook`, matching the bank account and API key. Validate a controlled transaction and the paid-order notification.
6. Verify `/orders`, `/mykey ORDER_ID`, failure/duplicate notifications, and that unauthorized users cannot access `/admin`.

For a full test matrix, see [Payments](PAYMENTS.md) and [Operations](OPERATIONS.md). Do not put live customer balances or real high-value keys in staging.

## Troubleshooting shortcuts

| Symptom | Check |
| --- | --- |
| `/healthz` works but bot is silent | Registered webhook URL, `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and platform logs |
| Database/table not found | D1 UUID or Turso connection; run **all migrations** against the deployed database |
| Admin returns HTTP 503 | `ADMIN_DASHBOARD_PASSWORD` is absent or shorter than 16 characters |
| Admin sign-in fails behind proxy | Use the public HTTPS domain; inspect Host/proxy configuration and cookie/Origin behavior |
| SePay deposit not credited | Compare account/amount/order memo, check `/bankreviews`, then reconcile manually |
| Stars key not delivered | Check order, `/retryalerts`, `/mykey ORDER_ID` and the payment event; never blindly re-issue a key |

Further troubleshooting: [Operations](OPERATIONS.md).
