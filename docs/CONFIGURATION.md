# Configuration and environment variables

[← Documentation](README.md) · [Getting started](GETTING_STARTED.md) · [Databases](DATABASES.md) · [Multi-bot](MULTI_BOT.md)

Configure **one bot** with unprefixed variables. For multiple independent storefronts, see [Multi-bot](MULTI_BOT.md): each bot has its own exact hostname, database and **prefixed** secrets. The current code supports **D1** or **Turso/libSQL**, not a generic `DB_PROVIDER` selector.

## Required settings for one bot

| Variable / binding | Runtime | Description |
| --- | --- | --- |
| `BOT_TOKEN` | All | Secret token issued by [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_WEBHOOK_SECRET` | All webhook hosts | Random **1–256** characters from `A–Z`, `a–z`, digits, `_` and `-`; must match Telegram `setWebhook` |
| `ADMIN_TELEGRAM_ID` | Admin bot commands | Your numeric Telegram user ID (not username) |
| `ADMIN_DASHBOARD_PASSWORD` | Web Admin | Secret, **16+ characters** required; 32+ random recommended |
| `DB` | Cloudflare Worker | D1 binding configured in `wrangler.toml`, not a string environment variable |
| `TURSO_DATABASE_URL` | Non-Cloudflare Node/Vercel/Docker | Persistent remote `libsql://` or `https://` endpoint |
| `TURSO_AUTH_TOKEN` | Non-Cloudflare Node/Vercel/Docker | Auth token for **the same** Turso database |

**Database choice:** Cloudflare's Worker receives a native `DB` binding. The Node runtime otherwise expects **both** `TURSO_*` variables; setting only one fails. New providers such as Neon/Supabase and a SQLite file are **not** supported without source and migration changes. [Compatibility details](DATABASES.md).

## Optional / conditional settings

| Variable | Used for | Notes |
| --- | --- | --- |
| `SEPAY_WEBHOOK_API_KEY` | Eligible **physical** sales with SePay | Authenticates incoming SePay webhook |
| `BANK_BIN` | VietQR / physical sales | Exactly **6 digits** |
| `BANK_ACCOUNT_NO` | VietQR / SePay physical sales | Account matching authenticated transfer |
| `BANK_ACCOUNT_NAME` | VietQR / physical sales | Name printed on payment instructions |
| `SUPPORT_USERNAME` | Support contact | Telegram username without `@` |
| `PORT` | Node HTTP process | Default **3000**; use provider-assigned port when present |
| `PHYSICAL_ORDER_TTL_MINUTES` | Unapproved physical order expiry | Default **30**, accepted range **5–10080** |
| `STARS_ORDER_TTL_MINUTES` | Unapproved Stars order expiry | Default **1440**, accepted range **5–10080** |
| `PUBLIC_BASE_URL` | **Webhook registration script only** | Public HTTPS origin, e.g. `https://bot.example.com`, **no path** |
| `WORKER_URL` | Registration legacy fallback | Use `PUBLIC_BASE_URL` for new instructions |
| `MULTI_BOTS` | Multi-bot host routing | JSON array of `{id, host}` objects; up to 20 bots |
| `BOT_ID` | Multi-bot webhook registration script | Identifies the selected bot |

**Physical payments:** configure `SEPAY_WEBHOOK_API_KEY`, `BANK_BIN`, `BANK_ACCOUNT_NO` and `BANK_ACCOUNT_NAME` **together** for eligible physical goods. Digital goods/services sold inside Telegram use **Stars (XTR)**, not VietQR/SePay. An expired order must not continue directing customers to transfer funds.

## Where to store secrets

| Platform | Recommended storage |
| --- | --- |
| Cloudflare Workers | `wrangler secret put` for credentials; non-secret config via Worker environment vars. D1 binding in `wrangler.toml` |
| Vercel / Railway / Render / Koyeb | Provider's private project/service environment variables |
| Oracle / AWS / Google / Azure Linux VPS | Private, git-ignored environment file or dedicated secret manager; restrict file and SSH access |
| Cloud Run / Container Apps **candidates** | Provider-managed secret references; additional integration still required |
| InstaBox test sandbox | Private `deploy/instabox/app.env` using **only test credentials** |

Do **not** commit token values to `.env.example`, `wrangler.toml`, Docker images, README, PR bodies or screenshots. Restrict production and staging to different bots/databases. Keep any plaintext product keys and DB backup files encrypted or access-controlled.

## Webhook and Admin endpoints

| Path | Method / caller | Authentication |
| --- | --- | --- |
| `/healthz` | GET, monitoring | Public; **not** a payment/DB readiness certification |
| `/telegram/webhook` | POST, Telegram | `X-Telegram-Bot-Api-Secret-Token` |
| `/sepay/webhook` | POST, SePay | `Authorization: Apikey <secret>` |
| `/admin` | Browser | Password-backed server-side session, Origin and CSRF checks |

The public origin must be **HTTPS**; a TLS proxy must preserve `Host` and `X-Forwarded-Proto: https` for Admin cookies and CSRF checks. Node port 3000 should not be publicly exposed on a VPS.

## Preflight and first-run validation

For non-Cloudflare hosts, export environment variables in a **private shell** and run:

```bash
npm run staging:preflight -- --provider=turso
```

For eligible physical orders, include `--physical`. For Cloudflare, use `--provider=cloudflare`. Preflight checks **names/formats**, never logs secret values; it does **not** test actual provider connectivity or payment settlement.

Then verify schema/migrations, public HTTPS `/healthz`, `setWebhook`, bot `/start`, unauthorized webhook rejection and Admin login. See [Getting started](GETTING_STARTED.md) and [Staging validation](STAGING_VALIDATION.md). **Never change a live bot's webhook to a preview URL by accident.**

## Environment separation and rotation

- Keep **staging and production bot tokens, webhook secrets and databases distinct**.
- When rotating Telegram bot tokens/secrets, update provider secrets and **intentionally re-register** the correct webhook endpoint.
- When changing databases, do **not** assume orders, payment events or keys move automatically; see [Databases](DATABASES.md).
- When changing an Admin password/session policy, consider active sessions and verify CSRF/Origin behavior. See [Security](../SECURITY.md).
