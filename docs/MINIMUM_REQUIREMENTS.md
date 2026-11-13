# Minimum resource requirements — all deployment providers

[← Docs](README.md) · [Deployment](DEPLOYMENT.md) · [Configuration](CONFIGURATION.md) · [Oracle single bot](../deploy/oracle/README.md)

> **Scope (November 2026): ONE bot / low traffic.** This is a sizing and eligibility guide, **not** a benchmark, a zero-cost guarantee, a completed provider integration or a production certification. For payment/Stars pre-checkout, reliability and callback timing matter more than simply fitting within RAM. Verify quotas, charges and current region/account eligibility in each provider's official pricing documentation before enabling billable resources.
>
> **Tóm tắt:** Chỉ chạy **1 bot** thì không cần Redis, Kubernetes, multi-bot hay nhiều VPS. Cloudflare Workers + D1 không cần VPS; VPS Docker nên bắt đầu từ **1 vCPU / 2 GB RAM**, ứng dụng đơn lẻ với RAM 512 MB chỉ là cấu hình để **thử**, chưa phải mức đảm bảo xử lý thanh toán. Mỗi provider có giới hạn miễn phí khác nhau.

## What this code actually needs

| Layer | Minimum functional requirement | Important distinction |
| --- | --- | --- |
| Webhook application | Node.js **22+**, ideally **24**, on Node/Docker; alternatively Cloudflare Workers or the checked-in Vercel functions | Docker image includes Node 24; Cloudflare Workers does not allocate a user-configured VPS |
| Active single bot | `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`; register an HTTPS `/telegram/webhook` deliberately | Never print tokens, put tokens in source, or register test/prod bot to the wrong host |
| Management | `ADMIN_TELEGRAM_ID`, `ADMIN_DASHBOARD_PASSWORD` (16+ characters, 32+ random preferred) | Admin sessions and anti-CSRF logic require a durable database |
| Database | Cloudflare **D1** via `DB` binding **or** remote durable **Turso/libSQL** with `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | Node/Vercel/VM hosts use Turso. No ephemeral SQLite in container/serverless filesystem for orders, keys or payment ledgers |
| HTTPS/network | Public TLS URL reachable by Telegram; outbound HTTPS to Telegram + Turso; `/healthz` for basic HTTP probe | For a VPS, DNS A, inbound TCP 80/443 and restricted SSH; never expose application port 3000 directly |
| Optional physical sales | `SEPAY_WEBHOOK_API_KEY`, `BANK_BIN`, `BANK_ACCOUNT_NO`, `BANK_ACCOUNT_NAME` | All four together; SePay/VietQR **only** for eligible physical goods. Digital purchases within Telegram use Stars (XTR) |
| Scheduled recovery | Durable expiry and outbox retry handling | Cloudflare Worker has a 5-minute cron. Node/PaaS runtimes need an operator-controlled scheduler such as the [Node maintenance runner](../scripts/run-maintenance.mjs) on a trusted host |
| Live payments | Dedicated staging bot + DB, restore/backups and controlled payment/replay/refund tests | **Not yet verified on these providers**. A green CI or `/healthz` is not proof |

## Platform sizing matrix (one bot)

**Labels:** **Existing integration** = runtime/deployment path is present in this repository, not a live E2E validation. **Reuse Docker** = the generic Dockerfile/Node server can be used but cloud provisioning is manual. **Candidate** = compatible-looking container path, but no platform-specific deployment recipe or end-to-end validation has been added. **Not directly supported** = requires a new adapter.

| Provider / service | Initial resource choice | Database / HTTPS | Free-tier & operational constraint | Repository support |
| --- | --- | --- | --- | --- |
| **Cloudflare Workers + D1** | No VPS; platform Workers isolate limit **128 MB**, free plan **10 ms CPU per invocation** | Native D1 `DB`, `*.workers.dev` or custom HTTPS | Free Workers **100,000 requests/day**, D1 **5M rows read/day**, **100K rows written/day**; queries can fail once quotas are reached | **Existing integration** `wrangler.toml`; Worker cron present |
| **Vercel Functions (Hobby)** | No VM; Node functions with up to **2 GB** memory on Hobby (provider cap, not the app's minimum) | External Turso; provider HTTPS | Hobby function billing/usage limits and cold starts; avoid assuming serverless HTTP is a 24/7 background worker | **Existing integration** `vercel.json` + `api/`; no built-in maintenance trigger configured |
| **Railway (Free)** | 1 service, up to **1 vCPU / 512 MB** RAM; start small and monitor OOM | External Turso; provider HTTPS | **$1 recurring monthly credit**; it is **not** a promise that a continuously running service costs $0 | **Existing integration** Dockerfile; scheduling needs separate design |
| **Render Free Web Service** | **0.1 CPU / 512 MB** RAM | External Turso; provider HTTPS | Sleeps after **15 min idle**, cold wake can take ~1 minute; **750 free instance-hours/workspace/month**; unsuitable for reliable pre-checkout | **Existing integration** `render.yaml`; testing/demo only |
| **Koyeb Free Web Service** | **0.1 vCPU / 512 MB** RAM, **2 GB** ephemeral SSD | External Turso; provider HTTPS | Sleeps after **1 hour idle**; limited regions, not advised for payment-critical production | **Existing integration** via Dockerfile; cron not configured |
| **Generic Docker / VPS / EasyPanel** | **1 vCPU / 2 GB RAM recommended**, >=~20 GB disk for images/logs and TLS | External Turso + Caddy/Nginx HTTPS | No inherent free tier; monitor disk, outgoing traffic, OS maintenance and CPU spikes | **Existing integration** Dockerfile; [Oracle Compose bundle](../deploy/oracle/README.md) can be adapted to other VMs |
| **Oracle Cloud A1.Flex** | **1 OCPU / 2 GB RAM recommended**, Ubuntu ARM64, free-eligible boot disk (often 50 GB) | External Turso + Caddy HTTPS | Always Free eligibility, regional capacity and instance-reclamation rules apply | **Existing integration** dedicated `deploy/oracle/` bundle; not live verified |
| **AWS EC2 (Linux VM)** | **2 GB RAM** target (e.g. `t3.small` or `t4g.small` ARM64), 1 GB micro only for careful testing | External Turso + Caddy; public DNS/HTTPS | **Not perpetual free EC2**. Eligibility differs by account creation date (see below); EBS, IPv4, CPU credits and transfer may be chargeable | **Reuse Docker**; no EC2-specific IaC, CI/CD or live validation |
| **Google Compute Engine (Linux VM)** | **2 GB+ RAM recommended**; Always Free `e2-micro` is shared CPU/~1 GB and an experimental fit only | External Turso + Caddy; HTTPS and VPC firewall | Always Free `e2-micro` applies **only in us-west1/us-central1/us-east1**, plus eligible standard disk/outbound quotas; other regions/sizes may bill | **Reuse Docker**; no GCE-specific IaC, CI/CD or live validation |
| **Google Cloud Run (managed container)** | Start with **1 vCPU / 512 MiB**, **min instances = 0**, max 1 for initial tests; raise memory if OOM | External Turso, managed HTTPS; container must listen on assigned `PORT` | Request-based free grant (up to **2M requests/month** plus CPU/memory budgets); image builds, storage, networking and always-on settings can cost extra | **Candidate** using Dockerfile; no Cloud Run recipe/CI/real-payment E2E yet |
| **Azure Virtual Machines** | Ubuntu Linux VM with **1 vCPU / 2 GB RAM recommended**; B1s 1 GB is test-only | External Turso + Caddy, public HTTPS | VM free offers are **time-limited and account/region dependent**; disks, static IP and egress may be chargeable | **Reuse Docker**, no Azure VM-specific IaC/CI/CD |
| **Azure Container Apps (Consumption)** | Start **0.25 vCPU / 0.5 GiB** (platform minimum) or **0.5 vCPU / 1 GiB** for extra headroom; set min replicas 0 | External Turso, managed HTTPS; ingress target port = app port | Consumption includes monthly free grant of **180K vCPU-seconds, 360K GiB-seconds, 2M HTTP requests**, not free unlimited uptime | **Candidate** via Dockerfile; requires ingress/secrets/scheduler configuration and validation |
| **AWS Lambda + API Gateway/Function URL** | Function memory adjustable; **not comparable to a VPS** | External Turso; separately managed HTTPS event adapter | Lambda free usage does **not** imply API Gateway/network/logs free | **Not directly supported**: current `api/` handlers are Vercel-specific, not AWS Lambda event adapters |
| **InstaBox Free (cloud sandbox)** | **4 vCPU / 8 GiB**, **20 GiB** persistent disk by default; one machine | External Turso; `instabox port publish` provides a public HTTPS endpoint | **Pauses after 30 min idle** and has a **480-minute maximum run**; Free cannot disable auto-pause. Bad choice for permanent Telegram/Stars webhooks | **Candidate for testing only**; existing Node/Docker source may run, but no end-to-end InstaBox validation |

**For a single low-traffic bot:** prioritize **Cloudflare Workers + D1** for the smallest operational footprint; **Oracle A1 1 OCPU / 2 GB** for a self-managed VPS; or a managed runtime such as **Cloud Run** for bursty webhooks **only after** implementing/verifying maintenance scheduling, secrets and the Stars pre-checkout latency. Do not choose a sleeping free service for payment-critical webhook acceptance.

### AWS account creation date matters

AWS EC2 Free Tier changed on **July 15, 2025**. Accounts created **before** that date may have the legacy 12-month micro-VM offer (subject to the original conditions). New accounts created **on/after** that date use a credit-based **up-to-6-month** Free plan; EC2 eligible shapes include `t3.micro`, `t3.small`, `t4g.micro`, `t4g.small` and other designated instances, but **not as an unlimited/permanent free VM**. The 2 GB `t3.small` and ARM64 `t4g.small` are better Docker starting points *when your credits/plan actually cover them*. Confirm billing dashboard and CPU credit policy; do not assume public IPv4, EBS or internet egress is free.

- AWS official account-plan rules: https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html
- AWS EC2 eligible instance types: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html

### Google Cloud VM vs Cloud Run are different

The **Compute Engine Always Free `e2-micro`** covers a small monthly VM-hours allowance restricted to **Oregon `us-west1`**, **Iowa `us-central1`**, or **South Carolina `us-east1`**, plus eligible **30 GB-months standard persistent disk** and **1 GB/month** outbound transfer from North America (with exclusions). This is **not a free 2 GB VPS in Singapore/Vietnam**. `e2-micro` is about 1 GB RAM / shared CPU; running Ubuntu + Docker + Caddy + app can be tight.

**Cloud Run** is a separate scale-to-zero service. The Dockerfile listens on `process.env.PORT`; provision a public HTTPS service with a matching container port, strong secrets, external Turso and no ephemeral data. The free grant is usage-based, not a fixed always-on machine. Node code has not been Cloud Run E2E verified.

- GCP Free Program: https://docs.cloud.google.com/free/docs/free-cloud-features
- Cloud Run prices/free grant: https://cloud.google.com/run/pricing
- Cloud Run resource minimums: https://docs.cloud.google.com/run/docs/configuring/services/memory-limits
- Cloud Run public HTTPS: https://docs.cloud.google.com/run/docs/triggering/https-request

### AWS/GCP/Azure VM: reuse the existing Docker deployment (not a one-click integration)

Provision **one** Ubuntu VM, SSH key, DNS A record, restricted SSH security group/firewall and public TCP **80/443**. Install Docker Engine + Compose plugin, create the Turso database and safely configure the `deploy/oracle/` template's `.env` and `app.env` (its Caddy/Node setup is not Oracle-specific). Apply migrations **once to the chosen database** after backup, start Compose, verify `/healthz`, register the test Telegram webhook **manually**, and install/verify a trusted 5-minute host cron using the included maintenance runner. No cloud-specific Terraform, startup scripts, GitHub SSH deploy or managed billing policy are shipped for AWS/GCP/Azure in this PR.

For managed containers (Cloud Run / Azure Container Apps), use provider-managed HTTPS instead of running Caddy. Never publish tokens in container image, commit history, CLI output or public build logs. Do not blindly copy the Oracle Compose file into a serverless container platform.

## Free-tier source checklist (official; recheck before creating resources)

| Provider | Source |
| --- | --- |
| Cloudflare | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| Vercel | [Function limits](https://vercel.com/docs/functions/limitations) · [Hobby limits](https://vercel.com/docs/plans/hobby) |
| Railway | [Plans and limits](https://docs.railway.com/pricing/plans) |
| Render | [Free service restrictions](https://render.com/docs/free) · [Compute plans](https://render.com/docs/compute-plans) |
| Koyeb | [Instance sizes and free restrictions](https://www.koyeb.com/docs/reference/instances) |
| Oracle | [Always Free resource eligibility](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) |
| AWS | [Free Tier account plans](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html) · [EC2 eligibility](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html) |
| Google Cloud | [GCP Free Program](https://docs.cloud.google.com/free/docs/free-cloud-features) · [Cloud Run pricing](https://cloud.google.com/run/pricing) |
| Azure | [Free account benefits](https://learn.microsoft.com/en-us/training/modules/create-an-azure-account) · [Container Apps billing](https://learn.microsoft.com/en-us/azure/container-apps/billing) · [Container resource allocation](https://learn.microsoft.com/en-us/azure/container-apps/containers) |
| InstaBox | [Current plan limits](https://instabox.sh/docs/limits) · [Idle pause and max-run](https://instabox.sh/docs/idle-suspend) · [Public HTTPS ports](https://instabox.sh/docs/ports) |

## Minimum pre-launch validation on **every** provider

1. Use a **new test BotFather token** and dedicated Turso/D1 database; confirm all migrations and credentials are correct, but do not disclose any secrets in logs.
2. Check HTTPS `/healthz`, intentionally unauthorized Telegram/SePay webhook requests (must reject), CSRF-protected `/admin`, `/start`, `/catalog` and language selection.
3. Check a trusted scheduler for expiration/outbox retry; test cold starts, account quota exhaustion, provider restarts and timeout behavior. Telegram Stars pre-checkout queries have a **10-second** response deadline.
4. Perform controlled provider event/replay/charge/refund/late-payment tests and database restore drills before real-money sales. These live checks **have not been completed** by this matrix.
5. Check billing budgets and alerts. **Free quota** means usage limits/credits under conditions; it does **not** mean guaranteed $0, global availability, unlimited duration or production SLA.
