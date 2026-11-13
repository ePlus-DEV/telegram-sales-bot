# Oracle Cloud Always Free — single-bot lightweight deployment

[← Deployment](../../docs/DEPLOYMENT.md) · [Configuration](../../docs/CONFIGURATION.md) · [Payments](../../docs/PAYMENTS.md) · [Operations](../../docs/OPERATIONS.md)

This optional, **single-bot** template runs one Node.js 24 application and a Caddy HTTPS reverse proxy on an Oracle Cloud Ubuntu ARM64 VPS. The bot uses a **persistent external Turso/libSQL database** to avoid running a database daemon and to retain order/inventory data if the VPS is rebuilt. No Redis, Kubernetes, or paid service is mandatory. The existing multi-bot feature remains available separately via [multi-bot docs](../../docs/MULTI_BOT.md).

**Not production-certified.** No real Oracle/Stars/SePay end-to-end deployment has been verified. Do not accept live payments until the project's payment release gates have been completed.

## Suggested size and limits

- **VM.Standard.A1.Flex**, **1 OCPU**, **2 GB RAM**, Ubuntu 24.04 ARM64, minimum eligible boot volume (currently **47 GB**).
- Two containers: Node bot limited to 512 MB and Caddy to 192 MB. Leave the remainder for Ubuntu, Docker, page cache and short spikes. These are initial budgets, not measured peak guarantees.
- Alternative if A1 has no capacity: **VM.Standard.E2.1.Micro**, 1 GB RAM, 1/8 OCPU baseline. It is significantly tighter for Docker and payment webhook latency; avoid it for live payment use without testing.
- Oracle's Always Free compute/storage limits are per tenancy, not per VM. Check actual limits, remaining storage, tenancy status and free-eligible labels in your home region: <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm>.
- Idle Always Free instances may be reclaimed; keep backups and monitor important payments. Do not generate artificial traffic to evade idle policies.

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

When you actually need more bots, the existing [multi-bot hosting mode](../../docs/MULTI_BOT.md) can route distinct HTTPS hostnames to isolated databases. Do not provision several bot databases or pay for larger Oracle shapes just to run one bot today.
