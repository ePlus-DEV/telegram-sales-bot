# Multi-bot deployment — independent Telegram storefronts

[← Configuration](CONFIGURATION.md) · [Deployment](DEPLOYMENT.md) · [Web Admin](ADMIN.md)

One running application can serve **multiple Telegram bots**, each with its own catalog, customers, orders, payment events, inventory, locale preferences, notification queue, admin sessions, payment credentials and Web Admin. **Isolation is achieved with a separate durable database per bot**, not a shared database with unscoped records.

**Routing requirement:** each bot must have its own public HTTPS hostname. The same routes are used on every hostname: `/telegram/webhook`, `/sepay/webhook`, `/admin`, `/healthz`. No new URL paths or schema migrations are required. Existing single-bot deployments remain unchanged when `MULTI_BOTS` is absent.

## 1. Define non-secret bot metadata

Set this non-secret hosting environment variable (e.g. in Wrangler `[vars]`, or your hosting provider's variable editor):

```env
MULTI_BOTS=[{"id":"shop_a","host":"shop-a.example.com"},{"id":"shop_b","host":"shop-b.example.com"}]
```

- Allowed IDs: lowercase `a-z`, digits and underscores, beginning with a letter (max 31 characters). IDs determine environment variable prefixes, e.g. `shop_a` becomes `SHOP_A_`.
- Use unique, fully qualified HTTPS DNS hosts. Configure both hostnames to route to the **same** Worker/function/server. Path prefixes, wildcard hosts, host ports and unknown hosts are not supported.
- Up to 20 bots per application instance. An unknown hostname returns HTTP 404; invalid tenant configuration returns a generic error without leaking secrets.
- Do not put tokens, API keys, passwords, bank account data or inventory inside `MULTI_BOTS` or the repository.

## 2. Create one database and set secrets per bot

Every secret is **prefixed by the bot ID**. For example:

| Variable | Bot A | Bot B |
| --- | --- | --- |
| Telegram token | `SHOP_A_BOT_TOKEN` | `SHOP_B_BOT_TOKEN` |
| Telegram webhook secret | `SHOP_A_TELEGRAM_WEBHOOK_SECRET` | `SHOP_B_TELEGRAM_WEBHOOK_SECRET` |
| Telegram admin user | `SHOP_A_ADMIN_TELEGRAM_ID` | `SHOP_B_ADMIN_TELEGRAM_ID` |
| Web Admin password | `SHOP_A_ADMIN_DASHBOARD_PASSWORD` | `SHOP_B_ADMIN_DASHBOARD_PASSWORD` |
| SePay webhook key (physical goods) | `SHOP_A_SEPAY_WEBHOOK_API_KEY` | `SHOP_B_SEPAY_WEBHOOK_API_KEY` |
| Bank details (physical goods) | `SHOP_A_BANK_BIN`, `SHOP_A_BANK_ACCOUNT_NO`, `SHOP_A_BANK_ACCOUNT_NAME` | Corresponding `SHOP_B_` variables |
| Support username | `SHOP_A_SUPPORT_USERNAME` | `SHOP_B_SUPPORT_USERNAME` |

The application **never falls back** from a missing tenant setting to unprefixed `BOT_TOKEN`, `DB`, bank details or Web Admin credentials. `PHYSICAL_ORDER_TTL_MINUTES` and `STARS_ORDER_TTL_MINUTES` can be shared across all bots.

### Cloudflare Workers + D1

Create **two different D1 databases**, apply migrations 0001–0006 to each, and configure separate bindings in `wrangler.toml`:

```toml
[[d1_databases]]
binding = "SHOP_A_DB"
database_name = "telegram-shop-a"
database_id = "REPLACE_WITH_SHOP_A_D1_ID"
migrations_dir = "migrations"

[[d1_databases]]
binding = "SHOP_B_DB"
database_name = "telegram-shop-b"
database_id = "REPLACE_WITH_SHOP_B_D1_ID"
migrations_dir = "migrations"

[vars]
MULTI_BOTS = '[{"id":"shop_a","host":"shop-a.example.com"},{"id":"shop_b","host":"shop-b.example.com"}]'
```

Apply migrations separately:

```bash
npx wrangler d1 migrations apply SHOP_A_DB --remote
npx wrangler d1 migrations apply SHOP_B_DB --remote
```

Use `npx wrangler secret put SHOP_A_BOT_TOKEN` (and likewise for every secret of each bot). Attach both custom domains to the same Worker. The legacy `DB` binding, if still present, is **not used** in multi-bot mode. Scheduled notification/expiration processing is run independently for each tenant's D1 database.

### Vercel, Railway, Render, Koyeb, Docker / Node + Turso

Use two **different** Turso databases, then configure `SHOP_A_TURSO_DATABASE_URL`, `SHOP_A_TURSO_AUTH_TOKEN`, `SHOP_B_TURSO_DATABASE_URL` and `SHOP_B_TURSO_AUTH_TOKEN` as hosting secrets alongside each bot's other settings. Apply existing schema migrations to **both** databases before enabling webhooks; the migration script takes the unprefixed variables for **one database at a time**:

```bash
TURSO_DATABASE_URL="$SHOP_A_TURSO_DATABASE_URL" TURSO_AUTH_TOKEN="$SHOP_A_TURSO_AUTH_TOKEN" npm run db:migrate:turso
TURSO_DATABASE_URL="$SHOP_B_TURSO_DATABASE_URL" TURSO_AUTH_TOKEN="$SHOP_B_TURSO_AUTH_TOKEN" npm run db:migrate:turso
```

The examples above use POSIX shell syntax; use the PowerShell equivalents on Windows. Configure both domains on the same hosting app (or on the TLS proxy in front of Node). Preserve the original `Host` and public `https` scheme for Web Admin Origin/CSRF checks. The app must not run on transient SQLite for live orders.

## 3. Register Telegram and bank webhooks

After the app, HTTPS hostnames and databases are in place, run once for **each** bot:

```bash
BOT_ID=shop_a npm run webhook:register
BOT_ID=shop_b npm run webhook:register
```

The registration script reads the prefixed token/secret and the hostname from `MULTI_BOTS`, and registers `https://shop-a.example.com/telegram/webhook` or `https://shop-b.example.com/telegram/webhook` respectively. If `PUBLIC_BASE_URL` is also set, it must match that bot's hostname. Registration is manual; CI never registers live Telegram webhooks.

If using SePay for **eligible physical sales**, configure separate webhook destinations per bot: `https://shop-a.example.com/sepay/webhook` and `https://shop-b.example.com/sepay/webhook`, with their respective API keys and correctly matched bank accounts. **Do not send the same bank feed to both bots and assume orders will be automatically routed.** Unknown or ambiguous transfers require manual reconciliation. Digital goods/services sold inside Telegram must use **Telegram Stars**.

## 4. Manage and verify each store

- Shop A Web Admin: `https://shop-a.example.com/admin`
- Shop B Web Admin: `https://shop-b.example.com/admin`

Each dashboard authenticates against that bot's own credentials and session database; products, keys and financial order records never cross the tenant boundary. Accounts and sessions are not shared. Currently bots are provisioned through hosting configuration, **not** created by clicking an Add Bot button in the Web Admin. Runtime changes to the list require a configuration redeploy/restart.

Smoke-test authorization on each hostname: correct webhook secret, wrong bot's webhook secret (must return 401), unknown hostname (404), no cross-bot catalog or order access, SePay credential mismatch and independent Web Admin login. Also confirm the cron or host-specific maintenance process.

## Operational and safety notes

- Keep staging/production tokens, databases and DNS separate. Back up each database before changes; never move live orders/keys from one bot to another implicitly.
- Set different credentials per bot. Two bots must not reuse the same D1 binding or Turso URL; the application rejects shared storage. Each bot's token must be unique as well.
- A healthy `/healthz` and green CI do **not** prove that live Stars/SePay payment, refunds or delivery work. Follow the [release and recovery checklist](OPERATIONS.md) and [payment limitations](PAYMENTS.md) before accepting real payments.
