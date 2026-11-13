# InstaBox — temporary deployment for one TEST Telegram Sales Bot

[← Documentation](../../docs/README.md) · [Generic deployment](../../docs/DEPLOYMENT.md) · [Configuration](../../docs/CONFIGURATION.md) · [Databases](../../docs/DATABASES.md) · [Operations](../../docs/OPERATIONS.md)

**Status: setup/build/deploy scripts included, not deployed or provider-E2E verified.** This bundle runs **one test bot only** on an InstaBox machine using Node 24 Docker and external durable **test Turso/libSQL**. InstaBox provides the public HTTPS port; **no Caddy, database daemon, Redis or second VM** required.

**Free is NOT permanent 24/7 hosting.** InstaBox free-plan machines are paused after about **30 minutes idle**, with a maximum run duration; an idle or paused machine cannot reliably process Telegram/SePay webhooks or Stars pre-checkout (10-second deadline). Do not handle customer payments, real inventory or real bank credentials here. See [official plans and limits](https://instabox.sh/docs/limits) and [idle behavior](https://instabox.sh/docs/idle-suspend).

## 1. What you need

- An InstaBox account and CLI on your **local computer**. Official quick start: <https://instabox.sh/docs/start>.
- A new **test** Telegram token from [@BotFather](https://t.me/BotFather), random Telegram webhook secret, numeric admin ID and strong dashboard password.
- A new **test Turso** DB URL and auth token (persistent outside InstaBox), with zero production orders/keys.
- The current repository includes `deploy/instabox/setup.sh`, `run.sh`, `compose.yaml` and a **safe placeholder** environment file. The setup script clones `main`; review the scripts on the version you intend to deploy.

## 2. Create and provision a machine

On **your computer**, install the official CLI and authenticate:

```bash
curl -fsSL https://api.instabox.sh/install.sh | sh
instabox login
```

From a checkout of this repository **containing** `deploy/instabox/setup.sh`:

```bash
instabox create --name sales-bot-test --template agent-browser \
  --setup-file deploy/instabox/setup.sh --wait-setup
```

This official `--setup-file` mechanism runs the supplied provisioning script **in the machine**. The script clones **main** into persistent `/data/home/telegram-sales-bot`, checks Docker Compose, creates a private placeholder `app.env`, and builds the image. It **does not** start the bot, publish a port, write database tables, or call Telegram. If deploying a fork or an unmerged feature branch, change the setup ref explicitly and inspect the code before running it; the default clones `main`.

Check the machine's setup status with `instabox get sales-bot-test --json` if needed. Free plans typically allow **one machine**; do not create duplicate boxes.

## 3. Configure TEST secrets and start

From your computer:

```bash
instabox ssh sales-bot-test
```

**Inside InstaBox**, edit the file securely:

```bash
cd /data/home/telegram-sales-bot/deploy/instabox
nano app.env
chmod 600 app.env
```

Replace placeholders for `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_TELEGRAM_ID`, `ADMIN_DASHBOARD_PASSWORD` (at least 16 chars; 32+ recommended), `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Keep SePay/bank variables disabled. Never type real token values in `instabox exec` commands, shell history, GitHub Issues, PRs or logs; the `app.env` file is ignored by git.

Initialize your **NEW/EMPTY test database ONCE**, then start the service:

```bash
bash run.sh --init-db
```

This validates required env var formats, applies the existing schema, starts Docker and verifies HTTP `/healthz`. Re-running `--init-db` against an existing database is **not** a migration strategy; follow backup/release procedures instead.

On subsequent starts (without DB mutation):

```bash
bash run.sh
```

Container runs without extra Caddy and listens on the machine's TCP port 3000. The published HTTPS endpoint uses InstaBox's proxy. `/healthz` is only a basic HTTP check, not proof of webhook/DB/payment behavior.

## 4. Publish public HTTPS (explicit action)

Back on **your computer**:

```bash
instabox port publish sales-bot-test 3000 --public
```

The CLI prints the real HTTPS URL. Verify `https://<actual-url>/healthz` and `/admin`; preserve `Host` and `X-Forwarded-Proto: https` for admin Origin/CSRF checks. **Do not invent the URL**. Public port publishing is intentional: anyone who knows the URL can contact public endpoints; admin still requires a password.

For private functional exploration (no Telegram webhook), use:

```bash
instabox port-forward sales-bot-test 3000
```

Then visit the forwarded local URL. **A private/token-gated published link cannot be used as a Telegram webhook**, because Telegram cannot supply the access token or extra login header.

## 5. Optional Telegram TEST webhook — not automatic

Only if you explicitly choose to route a **disposable test token** to InstaBox, and only once HTTPS is verified:

```bash
# On the InstaBox machine; set the URL from the public port publish output
cd /data/home/telegram-sales-bot/deploy/instabox
docker compose run --rm --no-deps -e PUBLIC_BASE_URL=https://ACTUAL_PUBLISHED_HOST bot npm run webhook:register
```

This changes the bot's single active Telegram webhook; **never reuse an existing production token**. You must test `/start`, `/catalog`, authentication, and confirm background expiry/notification handling are not reliable during pause. Avoid live payment/refund tests on disposable free sandboxes.

## 6. Update / stop / clean up

```bash
# Inside InstaBox: source update must be manually reviewed
cd /data/home/telegram-sales-bot
git pull --ff-only
cd deploy/instabox
bash run.sh             # rebuild and restart without database migrations
docker compose logs --tail=50 bot
docker compose down     # stop the app, not the Turso DB
```

On your own computer:

```bash
instabox port unpublish sales-bot-test 3000
instabox suspend sales-bot-test
```

Remove/redirect the **test** webhook after testing. Do not leave an active webhook pointing at a suspended instance. The sandbox's auto-pause also interrupts any in-VM cron; **the existing Cloudflare Worker 5-minute schedule does not automatically apply to Docker**. For an always-on paid bot, choose [Cloudflare Workers + D1](../../docs/DEPLOYMENT.md#cloudflare-workers--d1) or a properly managed VM and validate provider event E2E.

## Offline verification

The GitHub PR CI validates Bash syntax and a non-secret `docker compose config --quiet` using the example environment, besides the existing Node tests and Docker build. **No live InstaBox machine, token, provider webhook or payment test is invoked by CI.**
