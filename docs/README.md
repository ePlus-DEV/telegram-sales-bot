# Documentation

[← Project README](../README.md) · [Product roadmap](../ROADMAP.md)

This is the **single navigation page** for the project. Guides describe the **current source code** unless a section is marked *candidate*, *manual*, or *planned*. A green CI badge does not confirm live payment safety.

## Start here

| I want to… | Read first | Then |
| --- | --- | --- |
| Run my **first test bot** | [Getting started](GETTING_STARTED.md) / [Tiếng Việt](GETTING_STARTED.vi.md) | [Configuration](CONFIGURATION.md) |
| Find the easiest hosting option | [Deployment guide](DEPLOYMENT.md) | [Minimum resources and free-tier caveats](MINIMUM_REQUIREMENTS.md) |
| Click a **Deploy** badge | [Deploy button guide](DEPLOY_BUTTONS.md) | [Database setup](DATABASES.md) |
| Deploy on Oracle or InstaBox | [Oracle VPS](../deploy/oracle/README.md) / [InstaBox test sandbox](../deploy/instabox/README.md) | [Operations](OPERATIONS.md) |
| Use another database | [Database compatibility](DATABASES.md) | [Architecture](ARCHITECTURE.md) |

## Run a store

| Topic | Guide |
| --- | --- |
| Telegram buyer and admin commands | [Commands](COMMANDS.md) |
| Web Admin, inventory and reporting | [Web Admin](ADMIN.md) |
| Stars, VietQR/SePay, reconciliation and refunds | [Payments](PAYMENTS.md) |
| Secrets, environment variables, webhooks | [Configuration](CONFIGURATION.md) |
| Scheduling, backups, incidents and releases | [Operations](OPERATIONS.md) |
| Non-destructive and controlled staging verification | [Staging validation](STAGING_VALIDATION.md) |
| Security and vulnerability reporting | [Security policy](../SECURITY.md) |

## Build or extend

| Topic | Guide |
| --- | --- |
| Application entrypoints and boundaries | [Architecture](ARCHITECTURE.md) |
| Run independent shops on one app | [Multi-bot](MULTI_BOT.md) |
| Missing release gates and future work | [Roadmap](../ROADMAP.md) |
| PR expectations and coding rules | [Contributing](../CONTRIBUTING.md) / [AGENTS.md](../AGENTS.md) |

### Documentation ownership

- **README**: product overview, status, quick links and provider badges only.
- **Getting started**: first-run sequence for a disposable bot/database.
- **Deployment**: how to run on a provider; **Minimum requirements**: sizing, eligibility and maturity; **Deploy buttons**: behavior of badge links.
- **Configuration**: variable reference; **Databases**: actual adapters and migration portability.
- **Operations / Payments / Security**: production risks, recovery, safeguards and release gates.
- **Platform-specific README files**: copyable host commands, not duplicate project overviews.

**Release policy:** Early MVP; provider-specific live deployment and payment/refund end-to-end verification remain outstanding. See [P0 release gates](../ROADMAP.md#p0--release-blockers-deferred-execution-required-for-launch).
