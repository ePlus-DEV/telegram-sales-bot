# Oracle Cloud Always Free — single-bot lightweight deployment

[← Documentation](../../docs/README.md) · [Deployment](../../docs/DEPLOYMENT.md) · [Configuration](../../docs/CONFIGURATION.md) · [Databases](../../docs/DATABASES.md) · [Operations](../../docs/OPERATIONS.md)

This optional, **single-bot** template runs one Node.js 24 application and a Caddy HTTPS reverse proxy on an Oracle Cloud Ubuntu ARM64 VPS. The bot uses a **persistent external Turso/libSQL database** to avoid running a database daemon and to retain order/inventory data if the VPS is rebuilt. No Redis, Kubernetes, or paid service is mandatory. The existing multi-bot feature remains available separately via [multi-bot docs](../../docs/MULTI_BOT.md).

**Not production-certified.** No real Oracle/Stars/SePay end-to-end deployment has been verified. Do not accept live payments until the project's payment release gates have been completed.

## Minimum requirements for one bot

The table below is **the Oracle-specific resource reference**; other platforms are compared in [Minimum requirements](../../docs/MINIMUM_REQUIREMENTS.md). The numbers are conservative **recommendations**, not measured hardware minima.  Actual throughput, peak RSS, cold starts, and real-payment callback latency have **not been benchmarked** on Oracle.

| Item | Required to run this source | Recommended initial Oracle Always Free choice |
| --- | --- | --- |
| CPU / architecture | Linux with Node.js 22+; Docker images support `linux/arm64` | **1 OCPU**, `VM.Standard.A1.Flex` (ARM64) |
| RAM | No proven hardware minimum; Compose caps bot at **512 MB** and Caddy at **192 MB**, *excluding* OS/Docker/build overhead | **2 GB RAM** (room for Ubuntu, Docker, TLS and build spikes) |
| Storage | Persistent storage for Docker images, logs and Caddy certificate volume; app data is in **remote Turso**, not the container | Oracle free-eligible boot volume, **47 GB documented minimum / 50 GB common default** |
| OS / packages | Linux with Docker Engine, `docker compose` plugin and Git; Node 24 is inside the Docker image | **Ubuntu 24.04 LTS ARM64** |
| Public connectivity | DNS A record for a domain you control, public IPv4, HTTPS TCP **443**; inbound **80** for automatic TLS; outbound HTTPS for Telegram/Turso | OCI VCN/NSG inbound 80/443; SSH **22** only from your IP; do **not** expose Node port **3000** |
| Database | **1 persistent Turso/libSQL DB** with its URL/token and all migrations applied | External Turso; no database service on this VPS |
| Telegram | **1 BotFather token** and unique webhook secret, configured HTTPS webhook | A separate *test bot* for initial validation |
| Administration | Numeric Telegram admin ID and **16+ character** dashboard password (32+ random recommended) | Keep credentials in ignored `app.env`, not source/GitHub |
| Operations | Docker service enabled on boot; secure secrets; provider callbacks must be validated before live payments | Host cron invoking the included maintenance script every 5 minutes, backups and log review |

**Clarification:** 512 + 192 MB are container **limits**, not total VPS RAM consumption or measured load. A 1 GB `VM.Standard.E2.1.Micro` is potentially usable for experimentation but can be CPU/memory constrained; this project does **not** certify it for production payments. Oracle may have capacity restrictions, resource reclamation or changes to eligible shapes; check your home region, the **Always Free** label and tenancy quotas before creating anything. See [Oracle's Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) and [Docker's installation guide](https://docs.docker.com/engine/install/ubuntu/).

### Exact credentials and files needed

For the **single-bot** Oracle bundle, only these settings are required to start and test the default application:

| File | Required settings | Where to obtain |
| --- | --- | --- |
| `deploy/oracle/.env` | `SITE_DOMAIN`, `CADDY_EMAIL` | Your DNS hostname and certificate contact email |
| `deploy/oracle/app.env` | `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | [@BotFather](https://t.me/BotFather), plus your own random secret |
| `deploy/oracle/app.env` | `ADMIN_TELEGRAM_ID`, `ADMIN_DASHBOARD_PASSWORD` | Telegram numeric account ID, strong unique password |
| `deploy/oracle/app.env` | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Remote persistent Turso database and auth token |

Optional: `SEPAY_WEBHOOK_API_KEY`, `BANK_BIN`, `BANK_ACCOUNT_NO`, `BANK_ACCOUNT_NAME` are needed **together only for eligible physical sales using SePay/VietQR**. `SUPPORT_USERNAME` is optional. **No `MULTI_BOTS`, `SHOP_A_*` variables or extra VPS are needed for one bot.** No secrets belong in `.env.example`, `app.env.example`, GitHub or build logs.

### Installation sequence

**Create VM → install Docker → configure private secrets → validate schema/database → start app → verify HTTPS → manually register the test Telegram webhook → enable host cron.** Follow the detailed numbered sections below. Do not run real-payment callbacks until [staging validation](../../docs/STAGING_VALIDATION.md) and [payment release gates](../../ROADMAP.md#p0--release-blockers-deferred-execution-required-for-launch) pass.

## Oracle-specific Free Tier constraints

- Check the **Always Free** label, tenancy quotas, **ARM capacity in your home region**, disk allocation and [Oracle's official limits](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) before creating the VM. Regional availability and instance reclamation can affect uptime.
- An AMD E2.1.Micro with 1 GB RAM may be useful for experiments but is **not** a tested payment deployment baseline for Docker + Caddy + the bot. Keep backups; do not artificially generate traffic to evade free-tier policies.

## 1. Prepare one Oracle instance

In OCI Console, select a free-eligible Ubuntu ARM64 image and **VM.Standard.A1.Flex** with 1 OCPU and 2 GB memory. Use an SSH key, not a password. Confirm a public IPv4 address, and point a DNS **A** record (for example `bot.example.com`) to it.

At the VCN Security List/NSG level, allow inbound TCP **80** (HTTP ACME issuance), TCP **443** (HTTPS), and TCP **22** (SSH) **only from your IP**. If Ubuntu also uses a local firewall, allow 80/443 there. **Do not expose port 3000**, database ports or Docker's socket to the internet. Restrict administrator access via SSH keys.

Install Docker Engine and the Docker Compose plugin via [Docker's official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/). Enable Docker to restart on boot:

```bash
sudo systemctl enable --now docker
docker compose version
```

Use `sudo docker compose` if your user lacks Docker socket permissions. Adding a user to the Docker group grants root-equivalent access, so only do so intentionally.

## 2. Prepare local files securely

```bash
git clone https://github.com/ePlus-DEV/telegram-sales-bot.git
cd telegram-sales-bot/deploy/oracle
cp .env.example .env
cp app.env.example app.env
chmod 600 .env app.env
```

Edit `.env` to set the public domain and certificate contact email. Edit `app.env` to set a real BotFather token, unique Telegram webhook secret, your numeric Telegram admin ID, a strong dashboard password, and **Turso database URL/token**. Never publish `app.env` or show it in GitHub Actions logs. Do not set `MULTI_BOTS` here; this is single-bot mode.

For eligible **physical** goods with SePay, also configure the SePay API key and bank fields together. Digital goods sold inside Telegram must use Telegram Stars (XTR), not VietQR/bank transfer.

Ensure the dedicated Turso database exists and is backed up. This template intentionally does not run a local SQLite database inside Docker.

## 3. Run migrations and start the app

The image includes the schema and registration scripts for operator-run one-off commands. Apply existing migrations **only to your intended Turso database**, after a backup and preferably after testing against an empty staging database:

```bash
docker compose build
docker compose run --rm --no-deps bot npm run staging:preflight -- --provider=turso
# Migrations write to Turso: verify this is a NEW TEST database and backup first.
docker compose run --rm --no-deps bot npm run db:migrate:turso
docker compose up -d
docker compose ps
```

Visit `https://bot.example.com/healthz` (use your actual hostname). The app is **not** listening publicly on port 3000. Caddy obtains and renews the HTTPS certificate automatically when DNS, port 80 and port 443 are working.

If `docker compose run ...` displays a migration error, stop and investigate; do not re-run writes blindly against a live database or rebuild existing order data. Do not register the Telegram webhook until schema migrations have completed.

## 4. Register the Telegram webhook manually

Once HTTPS is healthy, run from `deploy/oracle`:

```bash
docker compose run --rm --no-deps -e PUBLIC_BASE_URL=https://bot.example.com bot npm run webhook:register
```

Replace `bot.example.com` with the actual hostname. This creates the active webhook at `https://bot.example.com/telegram/webhook`. A Telegram bot token can have only one active webhook endpoint. Registering a webhook changes external Telegram configuration, so do this only when you intend to move the bot to Oracle.

For SePay physical payments, register the provider's authenticated callback URL `https://bot.example.com/sepay/webhook` with the matching bank account/secret. Do not enable real-money checkout just because `/healthz` passes.

## 5. Check, update and operate

```bash
docker compose ps
docker compose logs --tail=50 bot
docker compose logs --tail=50 caddy
```

On a planned release, check changes and back up Turso first, then:

```bash
cd ~/telegram-sales-bot
git pull --ff-only
cd deploy/oracle
docker compose build
# Apply new forward-only migrations if the release added any and after reviewing them.
docker compose up -d
```

Both services use `restart: unless-stopped`; they restart after an instance reboot as long as Docker is enabled. Do not enable unattended image updates for payment-critical software. Keep Ubuntu security patches and TLS certificates current; Caddy renews certificates automatically.

**Important:** Cloudflare Worker cron does not run on Node automatically. The bundle includes an **on-demand** maintenance runner that performs the existing expiration and outbox-notification retry logic without keeping another service alive:

```bash
docker compose exec -T bot node scripts/run-maintenance.mjs
```

To run it every five minutes, install and enable the lightweight OS cron service (`sudo apt-get install -y cron`; `sudo systemctl enable --now cron`) and add a **user crontab** entry using `crontab -e`:

```cron
*/5 * * * * cd /home/ubuntu/telegram-sales-bot/deploy/oracle && /usr/bin/docker compose exec -T bot node scripts/run-maintenance.mjs >> /home/ubuntu/sales-bot-maintenance.log 2>&1
```

Change both paths to the actual checkout and log paths. Verify `command -v docker`, and ensure the chosen cron user can use Docker; Docker socket permissions are effectively root-equivalent. The runner deliberately has no public HTTP endpoint. Inspect the log and configure retention/rotation. This runs briefly inside the existing bot container, avoiding a separate always-on scheduler. For failures, `/expireorders` and `/retryalerts` remain temporary manual recovery controls. **Test the schedule and payment release gates before live payments.**

Back up and restore the **external Turso database** according to Turso's procedures, and keep separate backups of payment records. Caddy's certificates persist in the `caddy_data` Docker volume. Review the [operations guide](../../docs/OPERATIONS.md) and [payment release gates](../../ROADMAP.md).

## Optional future upgrade

When you need more bots, [multi-bot hosting](../../docs/MULTI_BOT.md) supports separate hostnames, secrets and databases. **Do not reuse the included `scripts/run-maintenance.mjs` for multi-bot:** it deliberately rejects `MULTI_BOTS`. A tenant-aware trusted Node scheduler must be implemented and tested before unattended multi-bot use. Do not provision more databases or a larger VM just to run one bot today.
