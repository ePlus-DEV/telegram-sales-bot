# Getting started — your first test bot

[← Documentation](README.md) · [Tiếng Việt](GETTING_STARTED.vi.md) · [Configuration](CONFIGURATION.md) · [Deployment options](DEPLOYMENT.md)

This guide gets **one disposable test bot** responding. It is **not a production deployment guide** and does not authorize charging customers. For multi-bot, see [Multi-bot](MULTI_BOT.md).

## 1. Prerequisites

You need **Node.js 22+ (24 recommended)**, Git, a terminal, a **new test bot token** from [@BotFather](https://t.me/BotFather), your numeric Telegram admin ID and a randomly generated dashboard password of at least 16 characters (32+ recommended). Keep all credentials private.

Choose one database/runtime:

| Route | Database | Suitable for |
| --- | --- | --- |
| **Cloudflare Workers** | Cloudflare **D1** | Easiest serverless first test; no VPS |
| **Node/Docker/Vercel** | Remote **Turso/libSQL** | Reusing the source on another host |

**No PostgreSQL, Neon/Supabase or local SQLite adapter is shipped today.** See [database compatibility](DATABASES.md). Each environment needs an independent test database; never test against live orders or customer keys.

## 2. Download and validate source

```bash
git clone https://github.com/ePlus-DEV/telegram-sales-bot.git
cd telegram-sales-bot
npm install
npm run check
npm run staging:check-migrations
npm test
npm run docs:check
```

These are **offline checks**. They do not create a hosting account, deploy the bot, migrate a remote database or register a Telegram webhook.

## 3. Create your database and deploy

### Option A — Cloudflare Workers + D1

```bash
npx wrangler login
npx wrangler d1 create eplus-telegram-sales-bot
```

Copy the **returned D1 database UUID** into the `database_id` placeholder in `wrangler.toml`; keep the binding named `DB`. Review the target, then apply all migrations **0001–0006** to this **remote test database**:

```bash
npm run db:migrate
```

Store the required secrets using the provider's private secret store:

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ADMIN_DASHBOARD_PASSWORD
```

Set `ADMIN_TELEGRAM_ID` in the provider's private environment/variable settings. For eligible **physical** sales only, add bank/SePay settings from [Configuration](CONFIGURATION.md). Then deploy:

```bash
npm run deploy
```

Open the actual `https://YOUR_WORKER.workers.dev/healthz` URL.

### Option B — Node.js/Docker + Turso

Provision **a new test Turso database** and obtain its remote TLS URL and token. Apply the schema **only after checking the target is empty and isolated**:

```bash
export TURSO_DATABASE_URL='libsql://YOUR_TEST_DB.turso.io'
export TURSO_AUTH_TOKEN='YOUR_PRIVATE_TEST_TOKEN'
npm run db:migrate:turso
```

On Windows PowerShell, use `$env:TURSO_DATABASE_URL="..."` and `$env:TURSO_AUTH_TOKEN="..."` rather than POSIX `export`.

Next choose your host in [Deployment](DEPLOYMENT.md) or a [Deploy badge](DEPLOY_BUTTONS.md), set the **same** Turso URL/token plus four bot/admin variables in provider secrets and deploy the Dockerfile/Node app. For a VM, use the [Oracle Compose guide](../deploy/oracle/README.md), adaptable to other Linux VMs. The server listens on `PORT` (default `3000`); terminate TLS at the provider/proxy and never expose raw HTTP port 3000 to the public internet.

The Docker image **does not run migrations automatically**. The Node scheduler also needs [explicit operation](OPERATIONS.md#scheduling-and-retries).

## 4. Register the Telegram webhook (manual and deliberate)

After public HTTPS is healthy, use the **real origin** (do not append `/telegram/webhook`):

```bash
export BOT_TOKEN='YOUR_TEST_BOT_TOKEN'
export TELEGRAM_WEBHOOK_SECRET='SAME_SECRET_AS_HOST'
export PUBLIC_BASE_URL='https://YOUR_ACTUAL_HOST'
npm run webhook:register
```

**PowerShell:**

```powershell
$env:BOT_TOKEN = "YOUR_TEST_BOT_TOKEN"
$env:TELEGRAM_WEBHOOK_SECRET = "SAME_SECRET_AS_HOST"
$env:PUBLIC_BASE_URL = "https://YOUR_ACTUAL_HOST"
npm run webhook:register
```

This calls Telegram `setWebhook`. **Each bot token has only one active webhook endpoint.** Never register a production bot against an unstable preview or temporary sandbox.

## 5. Verify safely

1. Visit `/healthz` (only proves HTTP response, **not DB/payment readiness**).
2. Send `/start`, `/language` and `/catalog` to the **test bot**.
3. Sign in to `https://YOUR_ACTUAL_HOST/admin`; create a sample product and use **non-sensitive dummy keys**.
4. Check `orders`, unauthorized webhooks and unauthorized Admin access.
5. If testing eligible physical goods, separately configure and validate SePay's authenticated `/sepay/webhook` against **test** bank/provider credentials; never use real payments as a first smoke test.
6. Verify scheduled expiry/outbox retries, logs and data persistence as relevant to your host.

The complete [staging test matrix](STAGING_VALIDATION.md), [payment safeguards](PAYMENTS.md) and [release blockers](../ROADMAP.md#p0--release-blockers-deferred-execution-required-for-launch) remain required before customer payments.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| HTTP OK, bot silent | BotFather token, `setWebhook` destination, Telegram webhook secret, provider logs |
| `no such table` | Correct database UUID/Turso URL and all migrations; don't run writes against the wrong target |
| Admin HTTP 503 | Missing/too-short `ADMIN_DASHBOARD_PASSWORD` |
| Admin sign-in fails | Public HTTPS origin, proxy Host / `X-Forwarded-Proto`, cookies and CSRF |
| Missing digital key after payment | Ledger/outbox, `/mykey ORDER_ID`, operator review; never duplicate delivery blindly |

[Operating runbook](OPERATIONS.md) · [Complete documentation](README.md)
