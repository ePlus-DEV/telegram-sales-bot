# Deploy badges — capabilities and limitations

[← Documentation](README.md) · [README badges](../README.md#deploy-from-github) · [Deployment](DEPLOYMENT.md) · [Configuration](CONFIGURATION.md)

The buttons in the main README are **official provider import/setup links** for this repository. **Clicking a button is not equivalent to a working, production-safe bot.** They cannot silently create a test database, apply migrations, set secrets or register Telegram webhooks.

## Available buttons

| Provider | Open setup wizard | Integration in repository | Still required |
| --- | --- | --- | --- |
| **Cloudflare** | [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot) | `wrangler.toml`, Worker, D1 | Real D1 UUID/binding, schema migrations, private secrets, test webhook |
| **Vercel** | [Deploy with Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot) | `vercel.json`, `api/` | Turso and migrations, private secrets, separate Node scheduler |
| **Render** | [Deploy to Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot) | `render.yaml` Docker Blueprint | External Turso, prompted Admin password/secrets, webhook and scheduling |
| **Koyeb** | [Deploy to Koyeb](https://app.koyeb.com/deploy?type=git&builder=dockerfile&repository=github.com%2FePlus-DEV%2Ftelegram-sales-bot&branch=main&name=telegram-sales-bot&ports=3000%3Bhttp%3B%2F) | Generic Dockerfile | External Turso, secrets, HTTPS/origin validation, cron |

These links prefill the **source repository**. Account sign-in, plan eligibility, region selection, provider pricing approval and provisioning remain in the provider's control. **No provider wizard was live-tested with a customer account or payment event.**

After opening a provider wizard, follow [Getting started](GETTING_STARTED.md) for migration, secrets, manual webhook registration and test flows. Review provider-specific notes in [Deployment](DEPLOYMENT.md).

## Google Cloud Run (experimental)

[![Run on Google Cloud](https://deploy.cloud.run/button.svg)](https://deploy.cloud.run/?git_repo=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot)

This is an **experimental image/build launcher**, not a maintained Cloud Run deploy recipe. The repo does **not** include verified Cloud Run ingress, Secret Manager bindings, Turso initialization, Scheduler/Job maintenance or Stars/SePay E2E tests. See [Cloud Run candidate requirements](DEPLOYMENT.md#google-cloud-run--managed-container-candidate).

## Why no badge for every platform?

- **Railway:** its official template button requires an actually **published template ID**. None is registered in this repo; do not invent one. [Manual Railway setup](DEPLOYMENT.md#railway--turso).
- **Oracle/AWS EC2/Google Compute Engine/Azure VM:** a badge alone cannot safely create the cloud VM, SSH keys, network policy, TLS, DB, cron and payment credentials; use [generic VM instructions](DEPLOYMENT.md#docker--vps--easypanel) or [Oracle runbook](../deploy/oracle/README.md).
- **InstaBox:** a temporary test sandbox, not durable webhook hosting; use the [test-only setup scripts](../deploy/instabox/README.md).
- **Azure Container Apps / AWS Lambda:** no ready-to-use template and validated runtime integration in this repo.

## Deployment completion criteria

The app is **not ready** merely because the wizard reported a successful build. Verify private secrets, the correct database and migrations, HTTPS `/healthz`, Admin Origin/CSRF, authorized/unauthorized webhook behavior, single Telegram `setWebhook` destination, scheduled retries and payment/provider tests. Follow [Staging validation](STAGING_VALIDATION.md) and [P0 release gates](../ROADMAP.md#p0--release-blockers-deferred-execution-required-for-launch).
