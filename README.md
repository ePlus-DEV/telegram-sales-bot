# ePlus Telegram Sales Bot

[![CI](https://github.com/ePlus-DEV/telegram-sales-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/ePlus-DEV/telegram-sales-bot/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Self-hosted Telegram storefront** with Vietnamese bank payments for physical goods, Telegram Stars for digital goods, and a lightweight web admin. Built with Node.js, Cloudflare Workers/D1, and an optional Turso-backed deployment.

**Tiếng Việt:** Bot bán hàng Telegram mã nguồn mở, hỗ trợ VietQR + SePay, Telegram Stars, giao key tự động, dashboard quản trị và giao diện Việt/Anh. Xem [hướng dẫn tiếng Việt](docs/GETTING_STARTED.vi.md).

> **Status: early MVP / chưa sẵn sàng production.** CI validates code and Docker builds; a complete live deployment and real-payment/refund end-to-end test have **not** been verified. Never enable customer payments solely on the strength of a green CI badge.

## Deploy from GitHub

Official provider **Deploy** buttons open a guided project-creation flow. **They do not create a production-ready shop in one click**: you must supply private Telegram/admin secrets, provision and migrate a durable database, verify HTTPS and manually register a **test** Telegram webhook. Review [button-by-button setup and limitations](docs/DEPLOY_BUTTONS.md) before deploying.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot)
[![Deploy to Koyeb](https://www.koyeb.com/static/images/deploy/button.svg)](https://app.koyeb.com/deploy?type=git&builder=dockerfile&repository=github.com%2FePlus-DEV%2Ftelegram-sales-bot&branch=main&name=telegram-sales-bot&ports=3000%3Bhttp%3B%2F)

**Cloudflare:** verify D1 creation/binding, apply migrations and add secrets. **Vercel/Render/Koyeb:** use an external Turso database; serverless/Free tiers can sleep or have execution limits. **Railway** requires a published project-specific Template ID before a real Railway Deploy badge can be linked. **Oracle/AWS/GCE/Azure VMs and InstaBox** use their [manual setup scripts/guides](docs/DEPLOYMENT.md); no verified one-click VM button exists in this repo. For Google Cloud Run, see the [experimental container setup](docs/DEPLOY_BUTTONS.md#google-cloud-run-experimental) rather than assuming a ready-made payment integration.

## Features at a glance

| Area | Implemented | Not yet complete |
| --- | --- | --- |
| Telegram shop | Product catalog, Buy buttons, order history, `/invoice`, `/mykey` | Cart, quantities, coupons, referrals |
| Payments | VietQR + authenticated SePay webhook for **physical** orders; Stars invoices for **digital** orders | payOS/MoMo/VNPay; provider E2E certification |
| Reliability | Payment event deduplication, notification outbox, safe unapproved-order expiry, manual reconciliation | Full abandoned-checkout/refund/dispute recovery |
| Digital delivery | Preloaded key reservation, one-key fulfillment, customer key retrieval | Encrypted inventory, bulk key import |
| Web Admin | Password login, server-side search/filters/pagination, product CRUD, bulk key intake, audit log, recorded-payment metrics, safe stock-count CSV | SSO/RBAC, physical stock/shipments, accounting-grade analytics |
| Languages | Vietnamese / English for bot and admin; saved Telegram preference | Translated product fields, more locales |
| Multi-bot hosting | Multiple bots on one app with per-host credentials, isolated D1/Turso databases and Web Admin | In-dashboard self-service bot provisioning |

The current implementation is **not** a hosted store or a production guarantee. Product titles and descriptions are supplied by the shop owner and are not automatically translated.

## Choose your deployment

| Platform | App runtime | Persistent database | Start here |
| --- | --- | --- | --- |
| **Cloudflare Workers** | Webhooks/serverless | **Cloudflare D1** | [Cloudflare setup](docs/DEPLOYMENT.md#cloudflare-workers--d1) |
| **Vercel** | Serverless functions | **Turso** | [Vercel setup](docs/DEPLOYMENT.md#vercel--turso) |
| **Railway** | Node.js / Docker | **Turso** | [Railway setup](docs/DEPLOYMENT.md#railway--turso) |
| **Render** | Node.js / Docker | **Turso** | [Render setup](docs/DEPLOYMENT.md#render--turso) |
| **Koyeb** | Node.js / Docker | **Turso** | [Koyeb setup](docs/DEPLOYMENT.md#koyeb--turso) |
| **Docker / VPS / EasyPanel** | Node.js / Docker | **Turso** | [Docker setup](docs/DEPLOYMENT.md#docker--vps--easypanel) |
| **Oracle Always Free (1 bot)** | ARM64 Docker Compose + Caddy | **Turso** | [Lightweight Oracle deployment](deploy/oracle/README.md) |
| **AWS EC2 (VM)** | Ubuntu x86_64/ARM64 + Docker | **Turso** | [Manual VM deployment; not AWS-specific IaC](docs/DEPLOYMENT.md#aws-ec2--docker-vm) |
| **Google Compute Engine (VM)** | Ubuntu + Docker | **Turso** | [Manual VM deployment](docs/DEPLOYMENT.md#google-compute-engine--docker-vm) |
| **Google Cloud Run** | Managed Node container | **Turso** | [Container candidate; not E2E tested](docs/DEPLOYMENT.md#google-cloud-run--managed-container-candidate) |
| **Azure VM** | Ubuntu + Docker | **Turso** | [Manual VM deployment](docs/DEPLOYMENT.md#azure-virtual-machines--docker-vm) |
| **Azure Container Apps** | Managed container | **Turso** | [Container candidate; not E2E tested](docs/DEPLOYMENT.md#azure-container-apps--managed-container-candidate) |
| **InstaBox (Free sandbox)** | Linux machine + Node.js/Docker | **Turso** | [Temporary test deployment, not 24/7](docs/DEPLOYMENT.md#instabox--temporary-test-environment) |

**Recommendation for testing:** Cloudflare Workers + D1 avoids an always-running server and a second database provider. Free plans have quotas; cold starts or quota exhaustion on other platforms can delay payment callbacks. Deployment configurations exist, but **no provider is claimed to have passed a live end-to-end deployment test**.

## Minimum deployment footprint — one bot

**For every provider**, see the [full minimum-resource and free-tier comparison](docs/MINIMUM_REQUIREMENTS.md) covering Cloudflare, Vercel, Railway, Render, Koyeb, Oracle, AWS EC2, Google Compute Engine, Cloud Run, Azure VM and Azure Container Apps.

For **one small bot**, start from **1 vCPU / 2 GB RAM on a Docker VPS** or use **Cloudflare Workers + D1 without a VPS**. These are initial recommendations, **not measured hardware minimums**. A 512 MB serverless/managed service may run under light load, but cold starts and payment timeouts still need end-to-end verification. The Oracle Compose bundle separately limits the Node bot to **512 MB** and Caddy to **192 MB**, excluding OS/Docker overhead.

| Needed | Minimum setup for the current Docker source |
| --- | --- |
| Compute | For VMs: **1 vCPU / 2 GB RAM recommended**; Oracle A1.Flex is one example; AWS/GCP/Azure VM variants may cost money |
| Storage | VM boot disk (~20 GB+ generic guideline, or the platform-specific free-eligible minimum); persistent data is stored in remote Turso |
| Software | Linux + Docker Engine/Compose + Git, or supported managed Functions/Workers runtime |
| Network | Public IPv4 + DNS A record; inbound TCP 80/443, SSH 22 restricted to administrator IP; outbound HTTPS |
| Application | One Telegram BotFather token + webhook secret, numeric admin ID + strong dashboard password |
| Data | One separate persistent Turso/libSQL database URL and auth token; migrations applied |
| TLS and maintenance | Caddy HTTPS, OS cron for 5-minute notification/expiry retries; no public app port 3000 |

**Not required for a single bot:** extra VPS, Redis, Kubernetes, a local database service or `MULTI_BOTS`. **AWS EC2 Free Tier is not perpetual**, and Google Compute Engine Always Free `e2-micro` has US region restrictions; do not assume any VM or managed free tier guarantees zero charges. See [all-provider comparison](docs/MINIMUM_REQUIREMENTS.md) and the [Oracle first-run checklist](deploy/oracle/README.md#minimum-requirements-for-one-bot).

## Quick start

Requires **Node.js 22+ (24 preferred)** and a Telegram bot from [@BotFather](https://t.me/BotFather).

```bash
git clone https://github.com/ePlus-DEV/telegram-sales-bot.git
cd telegram-sales-bot
npm install
npm run check
npm run staging:check-migrations
npm test
```

Then choose a deployment, create the database, apply **all six migrations (0001–0006)**, configure hosting secrets, deploy, and **register your Telegram webhook separately**. A healthy `/healthz` endpoint is not proof that payments work.

- [Getting started (English)](docs/GETTING_STARTED.md)
- [Bắt đầu sử dụng (Tiếng Việt)](docs/GETTING_STARTED.vi.md)
- [Deployment instructions — all platforms](docs/DEPLOYMENT.md)
- [Minimum configuration & free-tier limits by provider](docs/MINIMUM_REQUIREMENTS.md)
- [Configuration & environment variables](docs/CONFIGURATION.md)
- [Multiple independent bots on one deployment](docs/MULTI_BOT.md)

## Payments and security

**Telegram Stars (XTR) must be used for digital goods/services sold inside Telegram.** VietQR + SePay is provided for eligible **physical** goods, with no automatic shipment. Do not reroute digital purchases to bank transfer or other external gateways. See [Telegram's official Stars documentation](https://core.telegram.org/bots/payments-stars).

Payment webhooks must be authenticated; transfers need correct bank account, exact amount and order memo. Paid-but-undelivered items and ambiguous refund outcomes require human intervention. Digital keys currently remain **plaintext in D1/Turso**, so restrict database and backup access.

Read [payment flows & limitations](docs/PAYMENTS.md), [security policy](SECURITY.md), and [operations & recovery](docs/OPERATIONS.md) before production use.

## Documentation

| Guide | Content |
| --- | --- |
| [Documentation index](docs/README.md) | Find guides by role/task |
| [Getting started](docs/GETTING_STARTED.md) · [Tiếng Việt](docs/GETTING_STARTED.vi.md) | Set up a bot and first test order |
| [Deployment](docs/DEPLOYMENT.md) | Cloudflare, Vercel, Railway, Render, Koyeb, Oracle, AWS, GCP, Azure (deployment maturity varies) |
| [Configuration](docs/CONFIGURATION.md) | Secrets, bank data, webhook URLs, migration checklist |
| [Minimum requirements](docs/MINIMUM_REQUIREMENTS.md) | One-bot sizing, cloud free-tier conditions and support status per provider |
| [Multi-bot](docs/MULTI_BOT.md) | Run independent bots via separate hostnames, secrets and databases |
| [Payments](docs/PAYMENTS.md) | Stars vs VietQR/SePay, idempotency, expiry/refunds |
| [Commands](docs/COMMANDS.md) | Buyer and admin bot commands |
| [Web Admin guide](docs/ADMIN.md) | Search, filters, stock intake/export, audits, metrics and permissions |
| [Operations](docs/OPERATIONS.md) | Health checks, monitoring, backups, incident response |
| [Staging validation](docs/STAGING_VALIDATION.md) | Offline migrations, webhook/Admin smoke tests and protected manual staging workflow |
| [Roadmap](ROADMAP.md) | Current milestone, priorities and release gates |
| [Contributing](CONTRIBUTING.md) · [AI rules](AGENTS.md) | Development conventions, PR expectations |

## Contributing

Issues and Draft PRs are welcome. Run `npm run check`, `npm test`, and `npm run docs:check` before proposing changes. **Do not commit bot tokens, payment keys, production bank details, or customer inventory.** See [CONTRIBUTING.md](CONTRIBUTING.md).

MIT licensed — © ePlus.DEV. See [LICENSE](LICENSE).
