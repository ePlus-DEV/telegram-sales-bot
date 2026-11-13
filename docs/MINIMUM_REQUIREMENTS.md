# Minimum resources and hosting eligibility

[← Documentation](README.md) · [Deployment](DEPLOYMENT.md) · [Deploy buttons](DEPLOY_BUTTONS.md) · [Database compatibility](DATABASES.md)

> **Scope:** one low-traffic bot. Values below are **starting recommendations or provider resource classes**, **not measured application minima** and **not guarantees of a free bill**. Pricing, quotas, credit programs, availability and idle policies change; check the linked **official provider documents** when provisioning.

## What the application requires

| Component | Requirement |
| --- | --- |
| Runtime | **Node.js 22+** (24 preferred), Docker image based on Node 24, **or** current Cloudflare Worker |
| Database | **Cloudflare D1** inside Workers, **remote Turso/libSQL** for Node/Vercel/Docker; no local SQLite/PostgreSQL adapter |
| Webhooks | Public **HTTPS** and outgoing access to Telegram and DB endpoints |
| Secrets | Bot token/secret, admin ID/password, DB credentials (when using Turso) |
| Background work | Cloudflare five-minute cron, or an **explicit trusted scheduler** using `scripts/run-maintenance.mjs` on Node |
| Persistence | Durable orders, payment ledger, digital inventory, admin sessions and notifications |
| Safety | Separate test credentials/database and provider payment E2E before customer payments |

For one Docker bot, a **1 vCPU / 2 GB RAM** Linux VM with an appropriately sized boot disk (about 20 GB+ as an initial generic budget) is a reasonable **trial starting point**. The Oracle bundle limits the bot container to **512 MB** and Caddy to **192 MB**, **not counting Ubuntu, Docker, builds and page cache**. Actual peak memory and webhook latency on each provider are **not benchmarked**.

## Provider comparison

| Provider | Initial one-bot footprint | Free-plan / reliability concern | Deployment status |
| --- | --- | --- | --- |
| **Cloudflare Workers + D1** | No VPS, usage-based serverless invocation | Request, CPU and D1 quotas; verify cron and provider callback timing | Worker/D1 integration in repo |
| **Vercel Functions** | No dedicated VM; managed Node functions | Function limits/cold starts; external Turso and separate scheduler | Function routes in repo |
| **Railway** | Small Docker web service | Recurring credit/usage billing; no permanent-free guarantee | Generic Docker support |
| **Render** | Free/small Docker service | Idle sleep and cold start risk for Stars pre-checkout | `render.yaml` Blueprint |
| **Koyeb** | Free/small Docker service | Region, free quota and idle/sleep rules | Dockerfile setup wizard |
| **Generic VPS/EasyPanel** | **1 vCPU / 2 GB RAM recommended** | Provider pricing, logs, backups, uptime | Dockerfile and reusable Compose |
| **Oracle A1.Flex** | **1 OCPU / 2 GB RAM recommended**, ARM64 Ubuntu; eligible boot disk | Limited regional ARM capacity/Always Free terms | Dedicated Compose/Caddy guide |
| **AWS EC2** | `2 GB RAM Linux VM starting point | New/old Free Tier plans differ; IP/EBS/egress costs | Manual generic Docker setup |
| **Google Compute Engine** | `2 GB RAM VM recommended; `e2-micro` smaller | Always Free `e2-micro` has US-region restrictions and low RAM | Manual generic Docker setup |
| **Google Cloud Run** | Managed container; test small CPU/memory request | Scale-to-zero/cold starts and usage-based billing; job scheduler missing | **Candidate only** |
| **Azure VM** | `2 GB RAM Linux VM starting point | Time-limited/credit eligibility plus disk/IP/egress | Manual generic Docker setup |
| **Azure Container Apps** | Managed Consumption container | Usage-based free allowance, cold starts and job setup | **Candidate only** |
| **InstaBox Free** | Sandbox with temporary compute + published HTTPS port | **Auto-pause and maximum run time**; unsuitable for payments/24h uptime | **Test-only scripts** |
| **AWS Lambda** | Managed function, not a VPS | Needs new adapter for AWS event format | **Not implemented** |

### Which should I choose?

- **Fastest first test:** Cloudflare Workers + D1 — one provider and zero always-on VPS.
- **Small VPS with control:** Oracle Always Free (if eligible/capacity exists) or a similar Linux VPS with Node/Docker + external Turso.
- **Managed containers for experimentation:** Vercel/Cloud Run/Container Apps; verify provider ingress, secrets, cron/jobs and cold-start webhook latency. Do not infer payment safety from the ability to build an image.
- **Disposable lab only:** InstaBox, not an always-on Telegram sales endpoint.

## Confirm free-tier eligibility with the provider

| Provider | Official documentation |
| --- | --- |
| Cloudflare | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| Vercel | [Function limits](https://vercel.com/docs/functions/limitations) · [Hobby plan](https://vercel.com/docs/plans/hobby) |
| Railway | [Plans](https://docs.railway.com/pricing/plans) |
| Render | [Free services](https://render.com/docs/free) |
| Koyeb | [Instance types](https://www.koyeb.com/docs/reference/instances) |
| Oracle | [Always Free eligibility](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) |
| AWS | [Account Free Tier plans](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html) · [EC2 eligible types](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html) |
| Google Cloud | [Free Program](https://docs.cloud.google.com/free/docs/free-cloud-features) · [Cloud Run billing](https://cloud.google.com/run/pricing) |
| Azure | [Free account](https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account) · [Container Apps billing](https://learn.microsoft.com/en-us/azure/container-apps/billing) |
| InstaBox | [Service limits](https://instabox.sh/docs/limits) · [Idle behavior](https://instabox.sh/docs/idle-suspend) |

**AWS EC2 is not an unlimited/perpetual free VPS**. Account creation date and credit terms matter. **Google Compute Engine Always Free `e2-micro` is not a free Singapore VM**. Always inspect the creation screen and set billing alerts.

## Before customer payments

Confirm the host remains reachable, the database is durable/backed up, the 10-second Telegram Stars pre-checkout deadline is met, the maintenance schedule works, and all payment/replay/late-transfer/refund tests pass. See [Staging validation](STAGING_VALIDATION.md), [Operations](OPERATIONS.md) and [Roadmap](../ROADMAP.md).
