# Deployment — Cloudflare, Vercel, Railway, Render, Koyeb, Docker, Oracle, AWS, GCP and Azure

[← Docs](README.md) · [Minimum requirements](MINIMUM_REQUIREMENTS.md) · [Getting started](GETTING_STARTED.md) · [Configuration](CONFIGURATION.md) · [Operations](OPERATIONS.md)

> **Runtime support varies.** Cloudflare Workers use D1; existing Node, Vercel and Docker runtimes use **remote Turso/libSQL**. AWS EC2, Google Compute Engine and Azure VMs can **reuse generic Docker** but have no provider-specific IaC or CI/CD. Google Cloud Run and Azure Container Apps are **container candidates**, not verified integrations. See [requirements, free-tier conditions and support status](MINIMUM_REQUIREMENTS.md). No live provider payment E2E has been verified.

## Comparison

| Host | Runtime | Persistent DB | Main caution |
| --- | --- | --- | --- |
| Cloudflare Workers | Worker Fetch handlers | D1 | Worker/D1 free-plan quotas and scheduled Cron behavior |
| Vercel | Functions + rewrites | Turso | No persistent function filesystem; execution-time limits |
| Railway | Docker/Node HTTP | Turso | Usage credit/cost and uptime need checking |
| Render | Docker/Node HTTP | Turso | Free service can sleep, affecting webhook timing |
| Koyeb | Docker/Node HTTP | Turso | Validate current free-tier limits, sleep and port settings |
| Docker/VPS/EasyPanel | Node HTTP in container | Turso | Owner must handle HTTPS, availability and system updates |
| Oracle Always Free (1 bot) | ARM64 Docker Compose + Caddy | Turso | 1 OCPU / 2 GB baseline; no live payment E2E |
| AWS EC2 (Linux VM) | Existing Dockerfile + optional Caddy | Turso | Account-age-dependent credits; manual host setup; no AWS-specific IaC |
| Google Compute Engine (VM) | Existing Dockerfile + optional Caddy | Turso | `e2-micro` Always Free only in eligible US regions; low RAM |
| Google Cloud Run | Docker-based managed container | Turso | Candidate, no Cloud Run release/probes/cron or E2E yet |
| Azure Virtual Machines | Existing Dockerfile + optional Caddy | Turso | Credits/12-month eligibility; manual host setup |
| Azure Container Apps | Docker-based managed container | Turso | Candidate, no provider deployment manifest/scheduler/E2E yet |

Do not assume free plans guarantee 24/7 delivery. Telegram requires the bot to answer Stars pre-checkout queries quickly (official API: **10 seconds**). The [minimum requirements guide](MINIMUM_REQUIREMENTS.md) records specific sizing and free-tier constraints for **every** option in this table.

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

For multiple bots served by the **same** deployment, follow [multi-bot deployment](MULTI_BOT.md) to provision one HTTPS host, credentials and database per bot. The single-bot steps below otherwise remain valid.

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

## Oracle Cloud Always Free — lightweight single bot

**Minimum practical starting configuration:** 1 ARM64 `VM.Standard.A1.Flex`, 1 OCPU, **2 GB RAM**, free-eligible boot volume (about 50 GB), Ubuntu 24.04, Docker Engine + Compose plugin, one domain/public IPv4 (80/443), one BotFather token, one Turso database. This is a **recommendation**, not a measured load-based minimum. Full requirements and required `.env`/`app.env` fields are in the [Oracle minimum requirements](../deploy/oracle/README.md#minimum-requirements-for-one-bot).



For a low-resource ARM64 Ubuntu VPS, use the included [Oracle Compose bundle](../deploy/oracle/README.md): one Node container (512 MB limit), one Caddy reverse proxy (192 MB limit), external Turso, HTTPS on 80/443 and restart on reboot. It deliberately starts **one bot only**; the general [multi-bot architecture](MULTI_BOT.md) stays available for later. The operator-run maintenance script can be invoked via Docker and scheduled with host cron; see [Oracle runbook](../deploy/oracle/README.md). Verify it before accepting real payments.

## AWS EC2 — Docker VM

**Status: reuse Docker; not a native AWS one-click or verified production deployment.** One bot needs Ubuntu Linux x86_64/ARM64, external Turso and a TLS-terminating public endpoint. For a low-traffic bot, **1 vCPU / 2 GB RAM** is a practical *starting target*, not a measured minimum; `t3.small` / ARM64 `t4g.small` are possible 2 GB sizes if they are eligible for your account/credits.

1. Select an EC2 instance and AMI compatible with your account and architecture; verify [AWS EC2 Free Tier](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html) carefully. **Accounts created on/after July 15, 2025 have a credit-based up-to-six-month plan, not a permanent free EC2 instance**. Check IPv4, EBS volume, egress and CPU credit costs, and set billing alerts.
2. Create an SSH key pair, assign public address and DNS A record. Security Group inbound **80/443** for HTTPS and port **22 only from your IP**; never expose Node port 3000 publicly. Keep outbound HTTPS to Telegram/Turso.
3. Install Docker Engine/Compose and Git on Ubuntu. Clone this repo and reuse the [single-bot Compose/Caddy bundle](../deploy/oracle/README.md) (its application containers do not depend on Oracle SDKs). Create ignored `.env`/`app.env`, provision **external Turso**, back up DB and apply migrations.
4. Start the containers; confirm `https://YOUR_DOMAIN/healthz`, test a new BotFather token, then register its webhook deliberately. Enable host cron for `scripts/run-maintenance.mjs` and verify retries before any real payments.

**Not provided:** EC2 launch Terraform/CloudFormation, AWS IAM policies, Route 53 configuration, SSH GitHub Actions deployment or AWS Lambda adapter. [Minimum AWS sizing/cost caveats](MINIMUM_REQUIREMENTS.md#aws-account-creation-date-matters).

## Google Compute Engine — Docker VM

**Status: reuse Docker; no GCE-specific deployment workflow or real-payment validation.** Similar Ubuntu/Turso/Caddy requirements to EC2. Starting recommendation for an ordinary VM is **~2 GB RAM**, not a guaranteed floor. The [Compute Engine Free Program](https://docs.cloud.google.com/free/docs/free-cloud-features) covers up to one **`e2-micro`** eligible VM-month in **`us-west1`, `us-central1` or `us-east1`** with eligible disk/egress limits. It is about **1 GB RAM / shared CPU**, so Docker build, Caddy and webhook spikes need special testing. Larger shapes or Asia regions may charge; set billing budget/alerts.

1. Create the VM with an eligible Linux image, boot disk and permitted region; inspect estimated costs and external IP charges. Allow **80/443** in VPC firewall; SSH only by authorized identity/IP.
2. Point DNS to the public endpoint, install Docker Engine/Compose, clone the repo and reuse [the existing single-bot Compose guide](../deploy/oracle/README.md), using external Turso and separate test credentials.
3. Verify HTTPS, schema migrations, Telegram webhook, maintenance cron, logs, quota/timeout behavior and backup/restore before payments.

**Not provided:** GCE provisioning IaC, Cloud DNS/Cloud Armor config, Cloud Build/CD, or live validation. The Always Free `e2-micro` is not the same as a 2 GB VM.

## Google Cloud Run — managed container candidate

**Status: candidate only; Dockerfile exists, but no Cloud Run release workflow or provider E2E.** Cloud Run supports managed HTTPS and scale-to-zero; do **not** run the Oracle Caddy Compose stack inside Cloud Run. Start experimentally with **1 vCPU / 512 MiB** and `min instances = 0`; its CPU/memory/free billing is [usage-based](https://cloud.google.com/run/pricing), not an always-on free VPS.

1. Create a Google Cloud project with billing and budget alerts. Provision remote Turso, apply migrations outside the service and store bot/admin/Turso secrets in Secret Manager (no tokens inside images or source).
2. Build the existing Dockerfile into a container image via an authorized build pipeline. Deploy a Cloud Run **service** with HTTPS ingress, public webhook availability, environment `PORT` matched to the container target (the Node server uses `process.env.PORT`; Dockerfile exposes **3000**), 1 vCPU/512 MiB initial resources, a small max instance count and managed secrets.
3. Test `/healthz`, admin origin/CSRF, `/start`, webhook signature rejection, cold starts, 10-second Stars pre-checkout, replay and payment races.
4. **Schedule reconciliation separately** via a trusted scheduled job (e.g. a Cloud Run Job invoked by Cloud Scheduler with appropriately scoped IAM). `scripts/run-maintenance.mjs` exists, but its packaged job, IAM, scheduling and retry behavior are **not implemented** in this repo. Do not expose a public unauthenticated maintenance endpoint.

Do not claim Cloud Run is deploy-ready until the service config, secrets, scheduler, safe provider probes, billing and payment E2E have been verified.

## Azure Virtual Machines — Docker VM

**Status: reuse Docker; no Azure-specific IaC/CI.** Prefer an Ubuntu Linux VM with **~1 vCPU / 2 GB RAM** initially, external Turso and a Caddy TLS reverse proxy. Azure offers **time-limited** VM free benefits for eligible new accounts/types, not perpetual free VM capacity; additional public IP/disk/network resources may bill. Verify [Azure free benefits](https://learn.microsoft.com/en-us/training/modules/create-an-azure-account) and actual portal estimates first.

Provision one VM, attach a DNS name/public IP, allow 80/443 and restrict SSH in NSG, install Docker Engine/Compose, and follow the [Oracle Compose runbook](../deploy/oracle/README.md) for the shared container stack. Use Azure Key Vault or securely ignored environment files. Keep Turso external; configure cron, backup, controlled webhook registration and full payment tests.

## Azure Container Apps — managed container candidate

**Status: candidate only**; this repo has a Docker image, **not** an Azure Container Apps deployment manifest, image pipeline, secrets/ingress template, or verified E2E. An experimental Consumption-plan starting choice is **0.25 vCPU / 0.5 GiB** (minimum allocation) or **0.5 vCPU / 1 GiB** for extra headroom, one replica maximum, min replicas 0, with external Turso and managed HTTPS. [Azure's free Consumption grant](https://learn.microsoft.com/en-us/azure/container-apps/billing) is usage-limited; monitoring, image registry/network and other services may bill.

Use a trusted container registry, external HTTPS ingress forwarding to Node's application port, provider-managed secrets, a pre-migrated Turso database and a controlled initial test bot. Plan authenticated scheduled maintenance separately through Container Apps Jobs or another trusted scheduler. Do not deploy Caddy as an unnecessary second container inside managed ingress; test the entire payment matrix before accepting funds.

## Register Telegram and SePay webhooks

Deployment **does not** automatically register the Telegram webhook. In a terminal that has the same bot token and secret as the host:

```bash
export BOT_TOKEN='YOUR_TEST_BOT_TOKEN'
export TELEGRAM_WEBHOOK_SECRET='THE_HOSTS_WEBHOOK_SECRET'
export PUBLIC_BASE_URL='https://YOUR_PUBLIC_DOMAIN'
npm run webhook:register
```

PowerShell uses `$env:BOT_TOKEN="..."`, `$env:TELEGRAM_WEBHOOK_SECRET="..."` and `$env:PUBLIC_BASE_URL="..."`.

This registers `https://YOUR_PUBLIC_DOMAIN/telegram/webhook`. In multi-bot mode, set `BOT_ID=shop_a` (and similarly for every bot) instead of global `BOT_TOKEN`; the script uses `MULTI_BOTS` and the selected bot's prefixed secrets and hostname. See [multi-bot setup](MULTI_BOT.md). **Do not include the path in `PUBLIC_BASE_URL`**. A Telegram token can point to only one active webhook destination; use different tokens for staging and production.

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
