# Deployment guide — ePlus Telegram Sales Bot

**Supported targets:** Cloudflare Workers + D1, Vercel + Turso, Railway + Turso, Render + Turso, Koyeb + Turso, Docker/VPS + Turso.

## 0. Understand the storage and payment model

- Cloudflare Workers: native `DB` D1 binding; schema migration via Wrangler.
- Every other provider: remote **Turso/libSQL** using `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Do **not** use ephemeral `*.db` on Vercel/Render/Netlify or a container without a persistent volume. No D1 account required when using Turso.
- Digital products sold inside Telegram: Telegram Stars only (`XTR`).
- Physical products: VietQR bank transfer + authenticated SePay webhook; fulfilment is manual after confirming shipment.
- All providers expose `GET /healthz`, `POST /telegram/webhook`, `POST /sepay/webhook`.
- Do not enable more than one deployed environment with the **same Telegram token**: each call to `setWebhook` replaces the previously registered URL.
- Do not expose your secrets to public Git repositories, frontend bundles, or preview deployments. Configure them in service environment settings.

## 1. Environment variables

| Key | Cloudflare | Other providers | Description |
| --- | --- | --- | --- |
| `BOT_TOKEN` | secret | secret | Token from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | secret | secret | Random A-Z / a-z / 0-9 / _ / -, max 256 |
| `SEPAY_WEBHOOK_API_KEY` | secret | secret | Enable SePay API Key webhook authentication |
| `ADMIN_TELEGRAM_ID` | variable | variable | Numeric admin ID |
| `BANK_BIN` | variable | variable | Recipient bank BIN |
| `BANK_ACCOUNT_NO` | variable | variable | Recipient account (must match SePay payload) |
| `BANK_ACCOUNT_NAME` | variable | variable | Bank account name |
| `SUPPORT_USERNAME` | optional | optional | Telegram username for support |
| `TURSO_DATABASE_URL` | not needed | secret | `libsql://...turso.io` |
| `TURSO_AUTH_TOKEN` | not needed | secret | Database authentication token |
| `PORT` | not needed | optional | Node HTTP port (default 3000) |
| `PUBLIC_BASE_URL` | only when registering | only when registering | External HTTPS URL for `webhook:register`, **not** a runtime secret |

SePay is only suitable for physical orders here. When your bank/Webhook settings are not ready, omit physical goods from the catalog. Never commit real keys or customer information.

## 2. Prepare Turso (Vercel / Railway / Render / Koyeb / Docker)

1. Create a Turso database (see https://docs.turso.tech/).
2. Generate a database auth token and retrieve its remote `libsql://` URL.
3. From a local clone of the repository:

```bash
npm install
export TURSO_DATABASE_URL='libsql://your-database.turso.io'
export TURSO_AUTH_TOKEN='replace-with-secret'
npm run db:migrate:turso
```

PowerShell: `$env:TURSO_DATABASE_URL="..."` and `$env:TURSO_AUTH_TOKEN="..."`.

Then add the same variables to the hosting provider's **secret/environment settings**. The migration script reads SQL files from `migrations/` and applies them to the **remote** database. No migration automatically runs on a hosting build.

**No automatic data transfer:** switching from D1 to Turso does not copy your orders, keys or history. Export and migrate existing production data carefully before switching.

## 3. Vercel (Functions, no always-on process)

1. [Import the GitHub repository on Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot).
2. Framework preset: **Other**, root: repository root. Node.js runtime (22/24).
3. Add the environment variables above, including both `TURSO_*`. Use production scope, not public `NEXT_PUBLIC_*`.
4. Deploy. `vercel.json` maps `/healthz`, `/telegram/webhook` and `/sepay/webhook` to `api/*.js` handlers. Set no static build/output directory.
5. Open `https://YOUR-VERCEL-DOMAIN/healthz`. A 200 response only checks the HTTP runtime and database configuration; complete a real test purchase before production.
6. Register Telegram and SePay webhooks as in section 8.

Vercel Functions cannot use a persistent local SQLite database. This project uses Turso for durability.

## 4. Railway (Docker/GitHub, long-running service)

1. [Create Railway project](https://railway.com/new) and connect your GitHub repository.
2. Railway will detect `Dockerfile`; set the service's public domain and environment variables, including Turso.
3. Default container command: `node src/server.js`. It binds to `0.0.0.0:$PORT` (default 3000) and responds to `/healthz`.
4. Optionally use the newer IaC file `.railway/railway.ts` with Railway CLI `railway config plan` and `railway config apply` (after connecting the source). Do **not** add a deprecated `railway.json` / `railway.toml`.
5. Run migrations against Turso externally, then register the public webhooks.

Railway's free trial/credit depends on current plan. Don't assume a permanently free 24/7 service.

## 5. Render (Blueprint, Docker)

1. [Deploy to Render](https://render.com/deploy?repo=https://github.com/ePlus-DEV/telegram-sales-bot); the `render.yaml` Blueprint defines one Docker web service.
2. Choose a free web service for testing. Complete the secret/environment variables prompted by Render.
3. Migrate Turso, deploy, obtain the public `https://*.onrender.com` URL.
4. Check `/healthz`, then register Telegram/SePay webhooks.

**Not ideal for payments on the free tier:** Render Free sleeps after ~15 minutes idle, with cold startup that can delay Telegram pre-checkout responses. Render Free filesystem is ephemeral and its free Postgres expires after 30 days. Use Turso for persistence; do not accept live customer payments until cold-start and webhook retries are tested.

## 6. Koyeb (Docker, GitHub)

1. Open https://app.koyeb.com/apps/new, select GitHub repository.
2. Build method **Dockerfile**. Configure variables (including Turso URL/token) and expose the app on HTTP port `3000` or the platform's `PORT`.
3. Add a public domain. Verify `/healthz` and register webhooks.
4. Check the current Koyeb free instance limits and scale-to-zero behavior before using live payments.

## 7. Generic Docker / VPS / EasyPanel

```bash
docker build -t telegram-sales-bot .
docker run --rm -p 3000:3000 \
  --env-file .env \
  --name telegram-sales-bot telegram-sales-bot
```

The `.env` contains `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SEPAY_WEBHOOK_API_KEY` and bank/admin variables. Keep it outside version control. Use a reverse proxy with HTTPS and persistent system supervision for production.

The image intentionally excludes Wrangler and any D1 bindings; it is for Turso-backed Node hosts.

## 8. Register webhooks and verify

1. Create a strong random Telegram secret using a safe generator; alphanumeric and underscores/hyphens only.
2. Run the following **locally**, replacing the URL with your own deployed service:

```bash
export BOT_TOKEN='YOUR_REAL_TOKEN'
export TELEGRAM_WEBHOOK_SECRET='YOUR_RANDOM_SECRET'
export PUBLIC_BASE_URL='https://your-service.example'
npm run webhook:register
```

This calls Telegram `setWebhook` to register `https://your-service.example/telegram/webhook`. The secret must be **identical** in host environment and script. `WORKER_URL` is still accepted as a backwards-compatible alias.

3. Configure SePay API-key authenticated webhook to `https://your-service.example/sepay/webhook`; compare exact account number with `BANK_ACCOUNT_NO`.
4. Test `/start`, `/catalog`, one Stars purchase, invalid SePay authentication, matching SePay credit and duplicate deliveries on staging/test environment.
5. Inspect logs and create proper alerts for paid-but-undelivered orders before accepting real payments.

### Hosting caveats

- **Cloudflare:** D1 free quotas, no guarantee of unlimited transactions.
- **Vercel:** serverless timeout, usage quotas and no persistent file writes.
- **Railway:** always-on containers consume plan credit; Dockerfile supported.
- **Render:** free tier sleeps, can make payment/webhook timing unreliable.
- **Koyeb:** check current scale-to-zero settings and quotas.
- **Turso:** free tier has row/storage limits; check pricing before production.
- **GitHub Actions:** CI validates code; it does not deploy to third-party platforms without configured secrets/accounts.

For payments, server availability and post-payment notifications matter at least as much as having a successful health check.
