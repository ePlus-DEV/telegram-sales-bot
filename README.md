# ePlus Telegram Sales Bot

[![CI](https://github.com/ePlus-DEV/telegram-sales-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/ePlus-DEV/telegram-sales-bot/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A self-hosted Telegram storefront with a product catalog, digital-key delivery, physical-order management, Telegram Stars, VietQR/SePay and a password-protected Web Admin. The same core application can run on **Cloudflare Workers + D1** or a **Node.js host with remote Turso/libSQL**.

**Tiếng Việt:** Bot bán hàng Telegram mã nguồn mở. [Bắt đầu bằng tiếng Việt](docs/GETTING_STARTED.vi.md) · [English quick start](docs/GETTING_STARTED.md)

> **Development status: early MVP.** The repository has automated tests and deployment examples, but **no platform has a verified end-to-end live payment release**. Do not accept customer payments before completing the [release gates](ROADMAP.md#p0--release-blockers-deferred-execution-required-for-launch).

## What works today

| Area | Available in code | Important limitation |
| --- | --- | --- |
| Telegram storefront | Product listing, Buy buttons, orders, language preference (VI/EN) | No cart, automatic product translation or coupons |
| Digital products | Stars checkout, key reservation/delivery and invoice recovery | Approved-but-abandoned checkouts need operator reconciliation |
| Physical products | VietQR display, authenticated SePay webhook, payment review and manual fulfillment | No shipping/warehouse system or automated bank refunds |
| Web Admin | Product management, bulk key import, search/filter, aggregate CSV, order views and audit log | No SSO/RBAC, accounting-grade reporting or encrypted key inventory |
| Multi-bot | Up to 20 host-routed bots with isolated databases and credentials | Each bot needs its own hostname and database |

Read [product/payment boundaries](docs/PAYMENTS.md), [Web Admin](docs/ADMIN.md) and [architecture](docs/ARCHITECTURE.md) for the exact behavior.

## Get started

1. Create a **new test bot** with [@BotFather](https://t.me/BotFather).
2. Choose **Cloudflare Workers + D1** (no VPS) or **Node/Docker + remote Turso**.
3. Follow [Getting started (English)](docs/GETTING_STARTED.md) or [Hướng dẫn tiếng Việt](docs/GETTING_STARTED.vi.md).
4. Complete migrations, private secrets, public HTTPS and **manual Telegram webhook registration**.
5. Check the [staging validation](docs/STAGING_VALIDATION.md) and [payment test matrix](docs/PAYMENTS.md#minimum-staging-test-matrix) before handling real funds.

Requires **Node.js 22+** for local tooling (Node 24 recommended). A VM is **not** required for Workers; a single Docker bot can start with a **1 vCPU / 2 GB RAM recommended** host, not a benchmarked minimum.

## Deploy from GitHub

These are provider **setup shortcuts**, not finished payment-safe deployments:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FePlus-DEV%2Ftelegram-sales-bot)
[![Deploy to Koyeb](https://www.koyeb.com/static/images/deploy/button.svg)](https://app.koyeb.com/deploy?type=git&builder=dockerfile&repository=github.com%2FePlus-DEV%2Ftelegram-sales-bot&branch=main&name=telegram-sales-bot&ports=3000%3Bhttp%3B%2F)

| Deploy path | Database | Deployment maturity |
| --- | --- | --- |
| Cloudflare Workers | D1 | Application/config included; live provider E2E pending |
| Vercel, Railway, Render, Koyeb | External Turso/libSQL | Application/config or Dockerfile included; provider E2E pending |
| Oracle Cloud / generic Linux VPS | External Turso/libSQL | Docker Compose + Caddy runbook; operator-managed |
| InstaBox | External test Turso | Temporary test-only scripts; Free sandbox can pause |
| AWS EC2, Google Compute Engine, Azure VM | External Turso/libSQL | Reuse Linux Docker setup; no cloud-specific provisioning |
| Google Cloud Run, Azure Container Apps | External Turso/libSQL | Container candidates only; scheduling/secrets need configuration |
| AWS Lambda | — | No compatible AWS event adapter currently |

[All deployment paths](docs/DEPLOYMENT.md) · [What Deploy buttons actually do](docs/DEPLOY_BUTTONS.md) · [Minimum resources and free-tier considerations](docs/MINIMUM_REQUIREMENTS.md) · [Database compatibility](docs/DATABASES.md)

## Documentation

| Goal | Guide |
| --- | --- |
| New installation | [Getting started](docs/GETTING_STARTED.md) / [Tiếng Việt](docs/GETTING_STARTED.vi.md) |
| Choose a host and deploy | [Deployment](docs/DEPLOYMENT.md), [Deploy buttons](docs/DEPLOY_BUTTONS.md), [Oracle](deploy/oracle/README.md), [InstaBox](deploy/instabox/README.md) |
| Configure the app and database | [Configuration](docs/CONFIGURATION.md), [Databases](docs/DATABASES.md) |
| Use the product | [Telegram commands](docs/COMMANDS.md), [Web Admin](docs/ADMIN.md), [Payments](docs/PAYMENTS.md) |
| Run and secure the service | [Operations](docs/OPERATIONS.md), [Security](SECURITY.md), [Staging validation](docs/STAGING_VALIDATION.md) |
| Extend or contribute | [Architecture](docs/ARCHITECTURE.md), [Multi-bot](docs/MULTI_BOT.md), [Roadmap](ROADMAP.md), [Contributing](CONTRIBUTING.md) |

[Complete documentation index](docs/README.md)

## Payments, security and contribution

**Digital products and services sold inside Telegram must use Telegram Stars (XTR)**; bank transfer via VietQR/SePay is for eligible physical sales only. Payment webhook authentication, exact matching, replay defense, safe inventory reservation and manual exception review matter more than a successful health check. Digital inventory keys currently live as plaintext in D1/Turso; restrict database access and backups.

For security reports, see [SECURITY.md](SECURITY.md). For changes, open a feature branch and PR following [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md). **Do not commit credentials, customer data or real inventory keys.**

MIT licensed — © ePlus.DEV. See [LICENSE](LICENSE).
