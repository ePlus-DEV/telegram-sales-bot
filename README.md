# ePlus Telegram Sales Bot

[![CI](https://github.com/ePlus-DEV/telegram-sales-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/ePlus-DEV/telegram-sales-bot/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-blue)

A lightweight, open-source **Telegram storefront** by **ePlus.DEV** built for **Cloudflare Workers + D1**. No polling, VPS, Redis, or always-on process is required.

> **Early MVP:** Review code and run test payments before accepting real money. Not a production-hardened commerce product yet.

## Deploy options (Cloudflare, Vercel, Railway, Render, Koyeb, Docker)

**One backend, multiple runtimes.** Cloudflare Workers use native D1. All other targets use **Turso/libSQL** (remote persisted SQLite, not the host's temporary local filesystem). The Telegram and SePay webhook routes remain identical on every provider.

| Target | Backend | Database | Deployment | Notes |
| --- | --- | --- | --- | --- |
| Cloudflare Workers | Fetch handler | D1 | `npm run deploy` | Best for no always-on server, no extra database account |
| [Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot&env=TURSO_DATABASE_URL,TURSO_AUTH_TOKEN,BOT_TOKEN,TELEGRAM_WEBHOOK_SECRET,SEPAY_WEBHOOK_API_KEY,ADMIN_TELEGRAM_ID,BANK_BIN,BANK_ACCOUNT_NO,BANK_ACCOUNT_NAME) | Serverless Functions | Turso | [Deploy to Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot) | The `vercel.json` rewrite maps public routes to functions |
| [Railway](https://railway.com/new) | Node HTTP via Docker | Turso | GitHub → deploy `Dockerfile` | Persistent service; credits and plan limits apply |
| [Render](https://render.com/deploy?repo=https://github.com/ePlus-DEV/telegram-sales-bot) | Node HTTP via Docker | Turso | [Deploy to Render](https://render.com/deploy?repo=https://github.com/ePlus-DEV/telegram-sales-bot) | Free web service sleeps when idle; webhook cold starts may be problematic |
| [Koyeb](https://app.koyeb.com/apps/new) | Node HTTP via Docker | Turso | Import GitHub and Dockerfile | Free instance limits and idle behavior apply |
| Docker / VPS / EasyPanel | Node HTTP | Turso | `docker build`, `docker run` | You control uptime and HTTPS proxy |

**Setup for non-Cloudflare hosts** (read [full deployment guide](docs/DEPLOYMENT.md)):

1. Create a remote [Turso](https://turso.tech/) database and obtain `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
2. Run `npm run db:migrate:turso` on your machine or CI using the two variables; never run migrations against a production database without backup.
3. Connect the repository to the desired platform; configure the variables from [`.env.example`](.env.example).
4. Deploy and verify `https://YOUR_DOMAIN/healthz` responds `{"ok":true,...}`.
5. Set `PUBLIC_BASE_URL=https://YOUR_DOMAIN`, `BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` locally, then run `npm run webhook:register`.
6. For physical products, configure SePay callback URL `https://YOUR_DOMAIN/sepay/webhook` and verify end-to-end with a test bank transfer. Digital products use Telegram Stars.

**Important:** Deploying code does not automatically configure the Telegram or SePay webhook, and does not automatically migrate D1 data to Turso. Use **one active environment per bot token**: setting a new Telegram webhook endpoint routes updates to that environment. Avoid using real payment credentials on preview deployments.


### Reliable payment delivery (P0)

Apply **both** database migrations (\`0001\` and \`0002\`) before running this release:
- Cloudflare: \`npm run db:migrate\`
- Turso/Vercel/Railway/Render: \`npm run db:migrate:turso\`

The new \`notification_outbox\` table keeps notification intents when a payment has already settled. If Telegram is unreachable, the webhook returns a retriable error; a later delivery of the same payment event retries only **unsent** notifications. Cloudflare's cron retries pending or expired-lease notifications every five minutes. Admins on any provider can send \`/retryalerts\` to recover up to 20 pending notifications per run.

Important: Telegram \`sendMessage\` has no idempotency key. A worker that crashes after Telegram accepted a message but before D1/Turso records \`SENT\` may still send a duplicate. The order state and key allocation remain idempotent. For digital goods, customers can always use \`/mykey ORDER_ID\` to fetch an already assigned key. **Unpaid invoice expiration and refund recovery are not yet implemented** and remain pre-production blockers.

### Idempotent purchases and invoice recovery (issue #4)

Apply migration `0003_purchase_intents.sql` before deploying this version: run `npm run db:migrate` for D1 or `npm run db:migrate:turso` for Turso. The `purchase_intents` table records one **callback_query.id → order** mapping in the same atomic database batch as the order and key reservation.

Digital products use `createInvoiceLink` and persist the Telegram Stars invoice link. If the first message is lost, the buyer can use `/invoice ORDER_ID` to retrieve their own invoice (other buyers cannot). Repeated callbacks do not create extra orders or reserve extra keys. Only the first unique Stars `pre_checkout_query.id` can be approved for an order; retries of that **same query** are accepted until settlement.

**Remaining limitation:** a first approved checkout that never completes remains locked to that query; issue #5 will add expiration and reconciliation. Users can place a separate new order with a new Buy callback; already-approved orders must be reconciled before inventory is released.

## What works

| Feature | MVP |
| --- | --- |
| Product catalog and inline Buy buttons | Yes |
| Physical products: VietQR bank transfer | Yes |
| SePay authenticated webhook and matching payment by unique order ID, bank account, and exact amount | Yes |
| Digital products: Telegram Stars (XTR) invoice links | Yes |
| Automatic delivery of one preloaded digital key after Stars payment | Yes |
| Customer order history and re-fetch a delivered key | Yes |
| Admin commands for products, keys, orders, and marking shipped physical orders complete | Yes |
| Cloudflare D1 persistent storage | Yes |
| Web admin, carts, multiple quantities, payOS, coupons, shipping rates, stock for physical products | Not implemented |

### Important Telegram payment rules

**Digital products sold inside Telegram must use Telegram Stars (XTR), not bank transfer, VietQR, SePay, payOS or crypto.** VietQR/SePay in this project are **only offered for physical goods/services**. Read the [official Telegram payment rules](https://core.telegram.org/bots/payments-stars). Do not remove this separation without reviewing Telegram's current policy.

**Bank transfer does not complete physical shipping.** An admin must fulfil the order manually after verifying the shipment.

## Cloudflare Workers + D1 (native deployment)

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
   export PUBLIC_BASE_URL='https://eplus-telegram-sales-bot.YOUR_SUBDOMAIN.workers.dev'
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

For webhook testing you need an HTTPS endpoint reachable by Telegram/SePay; local `localhost` URLs are insufficient. See [multi-platform deployment guide](docs/DEPLOYMENT.md).

## Architecture

- `src/index.js`: HTTP routes, Telegram Bot API integration, payment flows
- `src/runtime.js`, `src/adapters/turso.js`: portable DB adapter with D1-compatible queries
- `src/server.js`: Node HTTP server for Docker, Railway, Render and Koyeb
- `api/`, `vercel.json`: Vercel Serverless Functions adapters and rewrites
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

- [x] Durable payment-notification outbox, retry via webhook replay, Cloudflare cron and admin `/retryalerts`
- [ ] Idempotent Telegram update consumption (non-payment callbacks)
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
