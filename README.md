# ePlus Telegram Sales Bot

[![CI](https://github.com/ePlus-DEV/telegram-sales-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/ePlus-DEV/telegram-sales-bot/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-blue)

A lightweight, open-source **Telegram storefront** by **ePlus.DEV** built for **Cloudflare Workers + D1**. No polling, VPS, Redis, or always-on process is required.

> **Early MVP:** Review code and run test payments before accepting real money. Not a production-hardened commerce product yet.

## What works

| Feature | MVP |
| --- | --- |
| Product catalog and inline Buy buttons | Yes |
| Physical products: VietQR bank transfer | Yes |
| SePay authenticated webhook and matching payment by unique order ID, bank account, and exact amount | Yes |
| Digital products: Telegram Stars (XTR) invoices | Yes |
| Automatic delivery of one preloaded digital key after Stars payment | Yes |
| Customer order history and re-fetch a delivered key | Yes |
| Admin commands for products, keys, orders, and marking shipped physical orders complete | Yes |
| Cloudflare D1 persistent storage | Yes |
| Web admin, carts, multiple quantities, payOS, coupons, shipping rates, stock for physical products | Not implemented |

### Important Telegram payment rules

**Digital products sold inside Telegram must use Telegram Stars (XTR), not bank transfer, VietQR, SePay, payOS or crypto.** VietQR/SePay in this project are **only offered for physical goods/services**. Read the [official Telegram payment rules](https://core.telegram.org/bots/payments-stars). Do not remove this separation without reviewing Telegram's current policy.

**Bank transfer does not complete physical shipping.** An admin must fulfil the order manually after verifying the shipment.

## Free deployment: Cloudflare Workers + D1

Cloudflare Workers Free and D1 Free have usage/storage quotas. Hitting the quota interrupts service until it resets or the account is upgraded; free availability is not an uptime guarantee. The project uses Telegram Webhooks so no background daemon is necessary.

**Requirements:** Node.js 22+ (24 recommended), Cloudflare account, Telegram bot token from [@BotFather](https://t.me/BotFather). For physical products: supported bank account and a SePay account with webhook API-key authentication.

1. Clone your repo and install tooling:

   ~~~sh
   git clone https://github.com/ePlus-DEV/telegram-sales-bot
   cd telegram-sales-bot
   npm install
   npx wrangler login
   ~~~

2. Create the database:

   ~~~sh
   npx wrangler d1 create eplus-telegram-sales-bot
   ~~~

   Paste the returned database UUID into `wrangler.toml` as `database_id`. **The checked-in placeholder must be replaced before deployment.**

3. Apply the migration and deploy the Worker:

   ~~~sh
   npm run db:migrate
   npm run deploy
   ~~~

4. Set these secrets using `npx wrangler secret put NAME` (one prompt per secret):

   - `BOT_TOKEN` — secret Telegram token
   - `TELEGRAM_WEBHOOK_SECRET` — randomly generated alphanumeric token (setWebhook secret_token)
   - `SEPAY_WEBHOOK_API_KEY` — secret configured for SePay API-Key authentication

   Set the following Worker variables as environment variables in the Cloudflare dashboard or `wrangler.toml` `[vars]` section (never store actual credentials in git):

   - `ADMIN_TELEGRAM_ID` — your numeric Telegram user ID
   - `BANK_BIN` — VietQR bank BIN (example: 970422)
   - `BANK_ACCOUNT_NO` — recipient account number
   - `BANK_ACCOUNT_NAME` — recipient's name
   - `SUPPORT_USERNAME` — public Telegram username without @, optional

   Set `SEPAY_WEBHOOK_API_KEY` even when testing digital products: the SePay endpoint rejects requests without the configured secret.

5. Register Telegram webhook. Use the publicly returned Worker URL and your actual secret **from your terminal environment**:

   ~~~sh
   export BOT_TOKEN='...'
   export TELEGRAM_WEBHOOK_SECRET='...'
   export WORKER_URL='https://eplus-telegram-sales-bot.YOUR_SUBDOMAIN.workers.dev'
   npm run webhook:register
   ~~~

   On Windows PowerShell use `$env:BOT_TOKEN="..."`, etc. The script never prints secrets.

6. In [SePay Webhooks](https://my.sepay.vn), select **Có tiền vào**, the same recipient account number, **API Key** authentication, JSON payload, and endpoint:

   ~~~text
   https://YOUR_WORKER_URL/sepay/webhook
   ~~~

   For some older SePay webhooks, **201** is required; this MVP responds **200** with `{"success":true}`. Check your dashboard delivery logs and adjust if your account still requires 201.

7. Test `GET /healthz`, Telegram `/start`, and the following admin/user flows. Do not accept real payments until verified.

### Admin commands

| Command | Example |
| --- | --- |
| `/admin` | Display available admin commands |
| `/addphysical Name \| VND \| Description` | `/addphysical Coffee mug \| 120000 \| Ceramic mug` |
| `/adddigital Name \| Stars \| Description` | `/adddigital License \| 50 \| One key` |
| `/addkey ProductID \| Key` | `/addkey 2 \| ABC-123-XYZ` |
| `/adminorders` | Show latest 10 orders |
| `/fulfill OrderID` | Mark a paid physical order completed |

### User commands

- `/start` — welcome
- `/catalog` or `/products` — product list
- `/orders` — recent orders and status
- `/mykey ORDER_ID` — retrieve your own already delivered digital key
- `/paysupport` — support contact

**Privacy:** Keys are stored in the D1 database as plaintext in this MVP. Protect D1 access, backups, and admin credentials; avoid using high-value credentials until encryption/rotation and audit controls are added.

## Local development

Create `.dev.vars` from `.dev.vars.example`, fill real local credentials (ignored by git), then:

~~~sh
npm run db:migrate:local
npm run dev
npm run check
npm test
~~~

For webhook testing you need an HTTPS endpoint reachable by Telegram/SePay; local `localhost` URLs are insufficient.

## Architecture

- `src/index.js`: HTTP routes, Telegram Bot API integration, payment flows
- `src/domain.js`: validated payment and order helpers
- `migrations/`: D1 schema
- `scripts/register-webhook.mjs`: explicit Telegram setWebhook registration
- `tests/`: unit and webhook tests using Node's built-in SQLite
- `.github/workflows/ci.yml`: non-deploy validation

### Security / payment invariants

- Telegram Webhooks require `X-Telegram-Bot-Api-Secret-Token`.
- SePay Webhooks require `Authorization: Apikey <secret>`, match recipient bank account, payment direction, exact amount, and **13-character random order code**.
- SePay transaction IDs and Telegram Stars charge IDs are uniquely recorded in the payment ledger (duplicates must not settle other orders).
- A customer can retrieve only a key attached to their own fulfilled order.
- The source code never checks in bot tokens, bank credentials, or API keys.

## Roadmap

- [ ] Idempotent Telegram update consumption and resilient outbox notifications
- [ ] Digital-item reservations TTL, cancellations, refunds, and recovery after delivery failure
- [ ] Shipping addresses, physical inventory, stock reservation, and fulfillment tracking
- [ ] Admin dashboard protected with strong authentication, audit trail and rate limits
- [ ] payOS for **physical** goods; optional other compliant gateways
- [ ] Backup/restore runbooks, monitoring, order export and operational alerting
- [ ] Internationalization, cart, coupons and referral
- [ ] Integration tests on deployed staging using Telegram and SePay sandbox/test events

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md) and [SECURITY.md](SECURITY.md). PRs are welcome.

Released under the MIT License. © 2026 ePlus.DEV.
