# Deploy buttons — what a click actually sets up

[← README](../README.md) · [Deployment guide](DEPLOYMENT.md) · [Minimum requirements](MINIMUM_REQUIREMENTS.md) · [Configuration](CONFIGURATION.md)

> The badges on the [main README](../README.md#deploy-from-github) are official provider setup links pointing at `ePlus-DEV/telegram-sales-bot`. None of these links calls `setWebhook`, creates a production-ready bank/payment integration, or verifies live E2E transactions. **Do not put real bot/payment credentials in repository URLs or GitHub files.**

## Direct setup buttons

| Provider | Click-to-create flow | What remains before a functional test bot | Official provider documentation |
| --- | --- | --- | --- |
| [Cloudflare Workers + D1](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot) | Official Cloudflare repository import/deploy | Confirm newly provisioned D1 `DB` binding replaces `wrangler.toml` placeholder; **apply migrations 0001–0006** to that remote D1, set bot/admin secrets; register test webhook; check cron and payments | [Deploy to Cloudflare](https://developers.cloudflare.com/workers/platform/deploy-buttons/) |
| [Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot) | Official Vercel clone/import flow using `vercel.json` | Create **separate Turso** database and migrate it, supply `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_TELEGRAM_ID`, `ADMIN_DASHBOARD_PASSWORD`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, then register test webhook; schedule expiry/retries separately | [Vercel Deploy Button](https://vercel.com/docs/deploy-button) |
| [Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot) | Official Render Blueprint wizard reading `render.yaml` | Supply prompted private variables, migrate external Turso and register test webhook. Free instance may sleep while idle; **not suitable for reliable payment acceptance** without measuring availability | [Deploy to Render](https://render.com/docs/deploy-to-render) |
| [Koyeb](https://app.koyeb.com/deploy?type=git&builder=dockerfile&repository=github.com%2FePlus-DEV%2Ftelegram-sales-bot&branch=main&name=telegram-sales-bot&ports=3000%3Bhttp%3B%2F) | Official Koyeb wizard from `main`, choosing Dockerfile builder and HTTP port 3000 | Manually set all bot/admin/Turso secrets; create/migrate Turso, check HTTPS, register test webhook and arrange maintenance. Free service may sleep | [Deploy to Koyeb](https://www.koyeb.com/docs/build-and-deploy/deploy-to-koyeb-button) |

These links **preselect the repository** and open the provider's deployment UI. They do not bypass account login, pricing approval, resource quotas, migrations or secrets setup. The provider may change its form, plans, limits or ability to deploy this source; **no live click-through has been verified** with a provider account.

### Mandatory shared steps

1. Start with a dedicated **test** Telegram BotFather token and an **empty test** DB. Never reuse production credentials for preview/Free environments.
2. Cloudflare uses **D1**; all Node/PaaS integrations use **durable external Turso**. Run migrations only against the intended DB. There is no automatically migrated SQLite filesystem on serverless hosting.
3. Add **secrets privately** at the provider: `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_TELEGRAM_ID`, `ADMIN_DASHBOARD_PASSWORD` (at least 16 characters), plus `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for non-Cloudflare platforms. If selling eligible physical goods, separately configure SePay and bank information; for digital items inside Telegram use **Stars**.
4. Verify `https://YOUR_HOST/healthz`, Admin cookie/Origin/CSRF, authorized/unauthorized webhooks and relevant logs.
5. Deliberately register `https://YOUR_HOST/telegram/webhook` using `npm run webhook:register` with matching token, secret and `PUBLIC_BASE_URL`. **One bot token can have only one active webhook URL.** A deployment alone does not register it.
6. Test maintenance/notification retries, host sleeping, database backup/restore, payment callbacks and Stars pre-checkout (Telegram's 10-second deadline) **before accepting customer payments**. CI/healthy `/healthz` alone is not production certification.

## Google Cloud Run (experimental)

Google maintains a [Cloud Run deployment badge](https://github.com/GoogleCloudPlatform/cloud-run-button) that can be linked to the repository:

[![Run on Google Cloud](https://deploy.cloud.run/button.svg)](https://deploy.cloud.run/?git_repo=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot)

**Experimental launcher only**: the Dockerfile can be built, but the current repository does not contain a complete Cloud Run `app.json`, Secret Manager bindings, Turso migration automation, Cloud Scheduler/Job maintenance, or a verified payments E2E integration. Set the six required secrets, HTTPS public ingress and a secure scheduled maintenance mechanism manually. Confirm Cloud Run billing quotas and authentication, then test the actual Telegram webhook/Stars flow; clicking the badge alone does not complete deployment. See [Cloud Run manual guide](DEPLOYMENT.md#google-cloud-run--managed-container-candidate).

## Why there is no one-click badge for every provider

- **Railway:** its official `Deploy on Railway` badge requires a published template ID such as `/new/template/REAL_ID`. This repository has a Dockerfile but **no verified published Railway template ID**. Do not invent one. Use [manual Railway setup](DEPLOYMENT.md#railway--turso) until its template is created.
- **Oracle Cloud, AWS EC2, Google Compute Engine, Azure VM:** no generic GitHub README badge directly provisions the right VM, firewall, domain, TLS, secrets and payment-safe scheduler in your account. Reuse the [Oracle Docker Compose runbook](../deploy/oracle/README.md) and the [provider VM guides](DEPLOYMENT.md).
- **InstaBox:** free sandboxes pause; use the [test-only provisioning script](../deploy/instabox/README.md). No safe 24/7 one-click production badge exists in this repo.
- **Azure Container Apps:** the Docker image can be deployed manually, but there is no validated source-specific one-click template, protected secrets/maintenance automation or live E2E test.

## Verification status

The README badge URLs and syntax are based on official provider documentation and reference the real public repository. The codebase's CI can verify Markdown references, but **CI cannot confirm a deployment wizard successfully creates an operational payment bot in someone else's cloud account**. Treat these as **deploy/setup shortcuts**, not guaranteed single-click production deployment.
