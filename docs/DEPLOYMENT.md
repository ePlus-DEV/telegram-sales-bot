# Deployment guide

[← Documentation](README.md) · [Getting started](GETTING_STARTED.md) · [Provider requirements](MINIMUM_REQUIREMENTS.md) · [Deploy buttons](DEPLOY_BUTTONS.md)

Choose a hosting model **before** entering credentials or registering the bot webhook. This guide distinguishes what is **implemented in this repository** from what still requires **manual infrastructure** or is only a **candidate**. No provider has been certified with live payment/refund end-to-end tests.

## Choose a hosting model

| Platform | Code/config status | Database | Primary guide |
| --- | --- | --- | --- |
| Cloudflare Workers | Worker, D1 binding and cron defined | **D1** | [Cloudflare Workers + D1](#cloudflare-workers--d1) |
| Vercel | Function entrypoints and rewrites present | **Turso** | [Vercel + Turso](#vercel--turso) |
| Railway | Shared Dockerfile and optional IaC example | **Turso** | [Railway + Turso](#railway--turso) |
| Render | Docker Blueprint file present | **Turso** | [Render + Turso](#render--turso) |
| Koyeb | Shared Dockerfile; setup wizard | **Turso** | [Koyeb + Turso](#koyeb--turso) |
| Generic VPS/EasyPanel | Node Dockerfile; operator-owned HTTPS | **Turso** | [Docker / VPS / EasyPanel](#docker--vps--easypanel) |
| Oracle Always Free | Docker Compose + Caddy + host cron example | **Turso** | [Oracle runbook](../deploy/oracle/README.md) |
| AWS EC2, Google Compute Engine, Azure VM | **Generic Docker reuse**; no provider IaC | **Turso** | [Manual VM instructions](#aws-ec2--docker-vm) |
| Google Cloud Run / Azure Container Apps | **Candidates**; no complete release/scheduler integration | **Turso** | [Managed container caveats](#google-cloud-run--managed-container-candidate) |
| InstaBox | Setup/run scripts for temporary testing | **Test Turso** | [InstaBox runbook](../deploy/instabox/README.md) |
| AWS Lambda | No compatible event adapter | — | [Architecture](ARCHITECTURE.md) |

**A README Deploy badge starts the provider's setup wizard**, not the migration, secrets, test webhook or release certification. See [Deploy buttons](DEPLOY_BUTTONS.md) and [minimum resource expectations](MINIMUM_REQUIREMENTS.md). Free-tier terms and regional availability must be checked in the provider's current official documentation.

## Shared requirements for every host

1. New **test** BotFather token and a separate database; do not reuse a production bot token/database.
2. Durable storage: **D1** only inside the current Worker binding, or **remote Turso/libSQL** for Node/Vercel/Docker. [Database compatibility](DATABASES.md) explains unsupported alternatives.
3. Schema migrations 0001–0006 applied to the **correct database** by an operator after backup/verification.
4. Required private bot/admin secrets listed in [Configuration](CONFIGURATION.md); no tokens in Git or a published Docker image.
5. Reachable HTTPS URL, correct `Host` / `X-Forwarded-Proto` for Web Admin Origin checks, and Telegram's webhook registered **manually**.
6. Trusted expiry and notification retry scheduling. Cloudflare has cron; Node hosts need a separately configured runner. See [Operations](OPERATIONS.md#scheduling-and-retries).
7. Controlled staging, backups, 10-second Stars pre-checkout responsiveness and [P0 release checks](../ROADMAP.md#p0--release-blockers-deferred-execution-required-for-launch) **before real payments**.

## Cloudflare Workers + D1

**Existing integration, no VPS.** Follow [Getting started](GETTING_STARTED.md#option-a--cloudflare-workers--d1) for the full commands.

```bash
npx wrangler login
npx wrangler d1 create eplus-telegram-sales-bot
# Put the returned UUID in wrangler.toml: database_id
npm run db:migrate
npx wrangler secret put BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ADMIN_DASHBOARD_PASSWORD
# Also set ADMIN_TELEGRAM_ID in provider variables
npm run deploy
```

`wrangler.toml` declares a `DB` binding and a **five-minute** scheduled trigger. Check remote D1 migration success, secrets, `/healthz`, actual bot messages and scheduled logs. Do not use a copied example database UUID.

## Prepare Turso for non-Cloudflare hosts

**Existing Node database integration.** Create a new, separate Turso database, store its URL/token in your private runtime secrets and apply schema migrations **manually** from the repository checkout:

```bash
export TURSO_DATABASE_URL='libsql://YOUR_TEST_DB.turso.io'
export TURSO_AUTH_TOKEN='YOUR_PRIVATE_TEST_TOKEN'
npm run db:migrate:turso
```

PowerShell uses `$env:` assignments rather than `export`. **Do not assume** the app's build step automatically initializes schemas or copies Cloudflare D1 records. Read [Database compatibility and migration safety](DATABASES.md).

## Vercel + Turso

**Existing function integration** using `api/` and `vercel.json`.

1. Use the [official Vercel Deploy button](DEPLOY_BUTTONS.md) to import this repository; select **Other** if asked, and keep the repository root.
2. Create/migrate a dedicated Turso database. Add the six core bot/admin/database variables to **private project environment variables** (production scope only for a controlled production rollout).
3. Deploy and verify the assigned HTTPS origin and `/healthz`. Check that the Admin routes and Origin/CSRF behavior work behind Vercel's proxy.
4. Register the **test** Telegram webhook manually; provide an external trusted scheduler for Node-only expiry/retry work.

Function invocation duration and usage limits are host-specific. No live Stars/SePay provider E2E has been validated on Vercel.

## Railway + Turso

**Existing Docker runtime path** (`Dockerfile` and optional `.railway/railway.ts`).

1. Import repository into Railway, choose Dockerfile build and expose the Node app's configured `PORT` (default 3000).
2. Configure the six private bot/admin/Turso variables. Use **external Turso**, never the container filesystem for payments.
3. Let Railway provide HTTPS, test `/healthz` and Admin host/proxy behavior; register test webhook deliberately.
4. Configure a trusted scheduler and review cost/credit limits before accepting payments.

A repository-specific **Railway Template Deploy badge** requires an actually published template ID; this repo does not claim one.

## Render + Turso

**Existing Docker Blueprint** via `render.yaml` and [official Deploy badge](DEPLOY_BUTTONS.md).

1. Import with the Render Blueprint; check service runtime and plan.
2. Enter all secrets requested by the wizard (including `ADMIN_DASHBOARD_PASSWORD`), and prepare/migrate external Turso.
3. Verify HTTPS and app/DB/Admin behavior; manually register the **test** webhook.
4. Add trusted scheduled maintenance outside the app.

Free services may sleep when idle; cold wake is a serious risk for Telegram's **10-second Stars pre-checkout**. Do not treat Render Free as proven 24/7 payment hosting.

## Koyeb + Turso

**Existing Dockerfile**, provider wizard setup supported.

1. Open the [Koyeb Deploy button](DEPLOY_BUTTONS.md), choose Dockerfile builder and HTTP port 3000.
2. Supply private bot/admin/Turso variables; prepare remote Turso migrations.
3. Verify provider HTTPS, `/healthz`, proxy/Origin checks and test Telegram webhook.
4. Review sleep, region, resource quotas and separately configured maintenance.

The repo does not ship a Koyeb-specific schedule or live provider test evidence.

## Docker / VPS / EasyPanel

**Existing Node runtime; manual TLS and operations required.** One light-use bot can start with a **1 vCPU / 2 GB RAM recommended** Linux host; not a measured minimum. Install Docker Engine/Compose, provide a persistent remote Turso database and private secrets. Example for **local host-only testing**, not public webhook traffic:

```bash
docker build -t telegram-sales-bot .
docker run --rm -p 127.0.0.1:3000:3000 \
  --env-file /path/to/private/app.env \
  telegram-sales-bot
```

For a public HTTPS bot, follow the [Oracle Compose + Caddy guide](../deploy/oracle/README.md) instead of exposing port 3000 directly. Preserve original `Host` and public HTTPS scheme for Admin CSRF/session checks; enable supervised restarts, logs, backups and five-minute maintenance.

## Oracle Cloud Always Free — lightweight single bot

**Existing setup bundle**, not a real Oracle deployment certification. Use [`deploy/oracle/README.md`](../deploy/oracle/README.md) for **A1.Flex 1 OCPU / 2 GB recommended** sizing, Ubuntu ARM64 setup, Docker Compose+Caddy, secret files, Turso migrations, HTTPS, optional webhook registration and host cron. Free eligibility and ARM capacity are region/account dependent. **No automatic Oracle CI/CD is shipped.**

## AWS EC2 — Docker VM

**Generic Docker reuse only** (no Terraform/CloudFormation, EC2 deploy workflow or payment E2E).

1. Choose Ubuntu x86_64/ARM64 image, SSH keys, an instance size with headroom (1 vCPU / 2 GB recommended for starting), disk and public HTTPS endpoint. Verify AWS account-plan eligibility, IPv4/EBS/egress charges and budgets **before provisioning**.
2. Allow inbound 80/443 and SSH **only from your IP**; do not publish port 3000.
3. Install Docker Engine/Compose and follow the [Oracle Compose instructions](../deploy/oracle/README.md) as a **generic Linux runbook**; keep external Turso, DNS, secrets and cron under your control.
4. Verify host uptime, Caddy HTTPS, migration and webhook routing; do not enable real payments before staging tests.

## Google Compute Engine — Docker VM

**Generic Docker reuse only** (no GCE-specific IaC/deploy workflow). The free-eligible `e2-micro` shape has limited/shared resources and eligible US-region restrictions; it is **not** a guaranteed 2 GB VM in Singapore. Check [Google Cloud Free Program](https://docs.cloud.google.com/free/docs/free-cloud-features) before choosing a zone.

Use an Ubuntu VM, appropriate disk, public IP/DNS, VPC ingress 80/443, restricted SSH and the [generic Compose runbook](../deploy/oracle/README.md). Provide durable Turso, test webhook performance and schedule reconciliation. Larger/other regions may incur charges.

## Google Cloud Run — managed container candidate

**Not a verified Cloud Run integration.** The existing Docker image can be a starting point, but there is no complete Cloud Run release config, Secret Manager setup, trusted Scheduler/Job wiring or payment E2E.

Use an external Turso database, a public HTTPS Cloud Run service with `PORT` forwarded to Node, private secrets and a small initial resource allocation; **do not deploy Caddy Compose inside Cloud Run**. A Cloud Run Job and authorized Scheduler (or equivalent) must handle expiry/outbox retries. Verify 10-second Stars pre-checkout under cold-start conditions and watch usage-based costs. The [official experimental badge](DEPLOY_BUTTONS.md#google-cloud-run-experimental) is an import shortcut only.

## Azure Virtual Machines — Docker VM

**Generic Docker reuse only** (no Azure VM IaC/deploy workflow). Set up Ubuntu, external Turso, SSH, Azure NSG inbound 80/443, restricted SSH, public DNS/IP, TLS proxy and trusted cron. Reuse the [Oracle Compose instructions](../deploy/oracle/README.md). Check VM trial/credit eligibility, disk/IP/egress pricing and a billing budget first.

## Azure Container Apps — managed container candidate

**Not a verified Azure Container Apps integration.** The Docker image is usable as a starting point with managed ingress, private secrets and external Turso, but no Container Apps manifest, registry pipeline, managed Job/Scheduler or real provider test is supplied. Use a small Consumption allocation for initial tests, min replicas according to latency needs and **no Caddy** inside the managed container. Configure a trusted Job for maintenance and test cold starts, authentication and payment latency before launch.

## InstaBox — temporary test environment

**Existing test-only setup/run scripts:** [`deploy/instabox/README.md`](../deploy/instabox/README.md). InstaBox Free machines pause/expire; they cannot be relied on for continuous Telegram/SePay callback delivery or Stars pre-checkout. Use a **separate test token/database**, publish an HTTPS port only for a bounded experiment and remove the temporary webhook afterward. **Never treat this as always-on production hosting.**

## Register Telegram and SePay webhooks

**Deploying code does not register a bot.** From a trusted local shell after the HTTPS URL is confirmed:

```bash
export BOT_TOKEN='YOUR_TEST_BOT_TOKEN'
export TELEGRAM_WEBHOOK_SECRET='MATCHING_TEST_SECRET'
export PUBLIC_BASE_URL='https://YOUR_ACTUAL_HOST'
npm run webhook:register
```

This registers `https://YOUR_ACTUAL_HOST/telegram/webhook`; do **not** add the path to `PUBLIC_BASE_URL`. For `MULTI_BOTS`, use `BOT_ID=shop_a` per bot as described in [Multi-bot](MULTI_BOT.md). Each token has **one active destination**.

For eligible **physical** sales, configure SePay's incoming-transfer JSON webhook to `https://YOUR_ACTUAL_HOST/sepay/webhook` with **API Key** authentication and a matching bank account. A 200 response does **not** mean money settled. Digital products inside Telegram use Stars. See [Payments](PAYMENTS.md).

## Verify before real money

Run [non-destructive staging checks](STAGING_VALIDATION.md), validate provider auth and replay rejection, real recovery/notification behavior, DB backup/restore, Admin CSRF and all relevant Stars/SePay test cases. A passing CI job or `/healthz` is insufficient. Follow [Operations](OPERATIONS.md) and [P0 release gates](../ROADMAP.md#p0--release-blockers-deferred-execution-required-for-launch).
