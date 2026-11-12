# Deployment — Cloudflare, Vercel, Railway, Render, Koyeb, Docker

[← Docs](README.md) · [Getting started](GETTING_STARTED.md) · [Configuration](CONFIGURATION.md) · [Operations](OPERATIONS.md)

> **All platforms share one application.** Cloudflare Workers use native D1; Vercel/Railway/Render/Koyeb/Docker use durable **Turso/libSQL**. Platform configuration exists in the repo, but no live end-to-end deployment/payment validation has been confirmed.

## Comparison

| Host | Runtime | Persistent DB | Main caution |
| --- | --- | --- | --- |
| Cloudflare Workers | Worker Fetch handlers | D1 | Worker/D1 free-plan quotas and scheduled Cron behavior |
| Vercel | Functions + rewrites | Turso | No persistent function filesystem; execution-time limits |
| Railway | Docker/Node HTTP | Turso | Usage credit/cost and uptime need checking |
| Render | Docker/Node HTTP | Turso | Free service can sleep, affecting webhook timing |
| Koyeb | Docker/Node HTTP | Turso | Validate current free-tier limits, sleep and port settings |
| Docker/VPS/EasyPanel | Node HTTP in container | Turso | Owner must handle HTTPS, availability and system updates |

Do not assume free plans guarantee 24/7 delivery. Telegram requires the bot to answer Stars pre-checkout queries quickly (official API: **10 seconds**).

## Common preparation

From a local checkout:

```bash
git clone https://github.com/ePlus-DEV/telegram-sales-bot.git
cd telegram-sales-bot
npm install
npm run check
npm test
npm run docs:check
```

Create a separate **staging bot token/database**. Read [configuration](CONFIGURATION.md). Set `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_TELEGRAM_ID`, and `ADMIN_DASHBOARD_PASSWORD` in hosting secret/environment settings. If enabling eligible physical orders, set bank details and `SEPAY_WEBHOOK_API_KEY`.

## Cloudflare Workers + D1

1. Run `npx wrangler login`.
2. Create a database: `npx wrangler d1 create eplus-telegram-sales-bot`.
3. Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in `../wrangler.toml` with the new UUID. The Worker binding **must** be named `DB`.
4. Apply **all** migrations `0001–0006` to the remote D1 database:

   ```bash
   npm run db:migrate
   ```

5. Deploy: `npm run deploy`.
6. Store credentials via `npx wrangler secret put BOT_TOKEN`, `npx wrangler secret put TELEGRAM_WEBHOOK_SECRET`, `npx wrangler secret put ADMIN_DASHBOARD_PASSWORD`; add other required settings through Cloudflare secrets/variables. Do not commit real secrets.
7. Check `https://YOUR_WORKER.workers.dev/healthz`, then [register webhooks](#register-telegram-and-sepay-webhooks).

For local Worker development, copy `../.dev.vars.example` to `.dev.vars`, replace placeholders, run `npm run db:migrate:local` and `npm run dev`. Localhost is not directly reachable by Telegram or SePay.

Cloudflare's `[triggers]` cron currently attempts eligible order expiration and pending notification delivery every **five minutes**. The implementation still requires operational verification on the actual deployed Worker.

## Prepare Turso for non-Cloudflare hosts

Create a database using [Turso documentation](https://docs.turso.tech/) and obtain a remote database URL and authentication token. Export them in your **local terminal**, then apply existing migrations:

```bash
export TURSO_DATABASE_URL='libsql://YOUR_DATABASE.turso.io'
export TURSO_AUTH_TOKEN='YOUR_PRIVATE_TOKEN'
npm run db:migrate:turso
```

PowerShell:

```powershell
$env:TURSO_DATABASE_URL = "libsql://YOUR_DATABASE.turso.io"
$env:TURSO_AUTH_TOKEN = "YOUR_PRIVATE_TOKEN"
npm run db:migrate:turso
```

**Important:** The Turso migration script executes the SQL files in `migrations/` in order; it does **not** use Wrangler's D1 migration tracking table. Review the migration SQL, back up existing data and test on staging first. A hosting build does not automatically migrate the Turso database. Switching D1 → Turso does not automatically migrate existing orders, keys or sessions.

## Vercel + Turso

1. [Import the repository into Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot).
2. Select framework preset **Other**. Keep project root at the repository root and use a supported Node.js runtime (22+).
3. Add all required variables (especially `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`) in **Production** environment scope. Keep payment secrets out of public previews.
4. The checked-in `../vercel.json` rewrites `/healthz`, `/telegram/webhook`, `/sepay/webhook`, and `/admin` paths to `api/` handlers.
5. Deploy; visit `https://YOUR_APP.vercel.app/healthz`; then [register webhooks](#register-telegram-and-sepay-webhooks).

Vercel Functions have no durable local SQLite filesystem; always use Turso. Verify request execution timing and end-to-end payment behavior before onboarding users.

## Railway + Turso

1. [Create a Railway service](https://railway.com/new) from this repository.
2. Use the included `../Dockerfile`; the container starts `node src/server.js` and binds `0.0.0.0:$PORT` (default port 3000).
3. Set Turso, bot, admin and optional bank variables in Railway's secret/variable editor. Configure a public HTTPS domain.
4. After preparing Turso, deploy, visit `/healthz` and [register webhooks](#register-telegram-and-sepay-webhooks).

An optional `../.railway/railway.ts` infrastructure-as-code example is included; GitHub deployment with Dockerfile is the simpler path for first-time users. Railway credits, availability and billing depend on the account/plan.

## Render + Turso

1. [Import using the Render Blueprint](https://render.com/deploy?repo=https://github.com/ePlus-DEV/telegram-sales-bot) from `../render.yaml`.
2. Set the prompted credentials in Render's environment/secret settings and ensure the Docker runtime is selected.
3. Verify that the migration has already been applied to Turso, deploy, then test `/healthz` and [register webhooks](#register-telegram-and-sepay-webhooks).

**Caution:** Render Free instances may sleep when idle, making Stars pre-checkout and bank webhook timing unreliable. Do not treat a successful cold-start health check as payment readiness.

## Koyeb + Turso

1. Open [Koyeb](https://app.koyeb.com/apps/new) and connect this GitHub repo.
2. Build using `../Dockerfile`; expose the Node HTTP service on the configured `PORT`.
3. Add Turso + bot + admin + optional bank variables; obtain a public HTTPS URL.
4. Verify `/healthz` and [register webhooks](#register-telegram-and-sepay-webhooks).

Review Koyeb's current instance quota and idle behavior before accepting real payments.

## Docker / VPS / EasyPanel

With Turso and all secrets stored in a private `.env` file (never committed):

```bash
docker build -t telegram-sales-bot .
docker run --rm -p 3000:3000 --env-file .env --name telegram-sales-bot telegram-sales-bot
```

Place a TLS reverse proxy in front of port 3000 and ensure the original Host/HTTPS origin is preserved for Web Admin login CSRF protections. Arrange supervised restarts, log retention, security updates and an operator-managed scheduling process. Do **not** expose raw Docker port 3000 as a payment endpoint without HTTPS.

## Register Telegram and SePay webhooks

Deployment **does not** automatically register the Telegram webhook. In a terminal that has the same bot token and secret as the host:

```bash
export BOT_TOKEN='YOUR_TEST_BOT_TOKEN'
export TELEGRAM_WEBHOOK_SECRET='THE_HOSTS_WEBHOOK_SECRET'
export PUBLIC_BASE_URL='https://YOUR_PUBLIC_DOMAIN'
npm run webhook:register
```

PowerShell uses `$env:BOT_TOKEN="..."`, `$env:TELEGRAM_WEBHOOK_SECRET="..."` and `$env:PUBLIC_BASE_URL="..."`.

This registers `https://YOUR_PUBLIC_DOMAIN/telegram/webhook`. **Do not include the path in `PUBLIC_BASE_URL`**. A Telegram token can point to only one active webhook destination; use different tokens for staging and production.

For physical orders, set SePay's incoming-bank-transfer JSON webhook to `https://YOUR_PUBLIC_DOMAIN/sepay/webhook` using **API Key** authentication and the exact bank account configured in the app. Check [SePay's webhook documentation](https://docs.sepay.vn/tich-hop-webhooks.html) and transaction logs. A 200 response is not proof an order was matched.

## Verify before real money

- Check `/healthz` and hosting logs.
- Test `/start`, `/catalog`, `/orders`, `/language`, `/admin` and unauthorized access.
- Validate a **controlled** Stars invoice, `pre_checkout_query`, `successful_payment`, key delivery, duplicate event and failed message retry.
- Validate authorized SePay payload, wrong account/amount, duplicate/late deposits and `/bankreviews`.
- Confirm migration, backup/restore, cron or alternative maintenance procedure, and alerts.

See the [payment matrix](PAYMENTS.md) and [operations runbook](OPERATIONS.md). The application is **not yet certified as production ready**.

## Staging validation (manual only)

After your staging environment is independently deployed, run the safe HTTP checks and local migration validation described in [Staging Validation](STAGING_VALIDATION.md). The dedicated GitHub Actions workflow is `workflow_dispatch` only, uses Environment `staging`, and has no deploy, Telegram registration or real-payment steps. Do not claim provider verification before a staging workflow actually passes against that provider.
