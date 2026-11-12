# Configuration & environment variables

[← Docs](README.md) · [Deployment](DEPLOYMENT.md) · [Payments](PAYMENTS.md)

Use **hosting secrets** for credentials. The examples `../.env.example` and `../.dev.vars.example` are templates, not values to commit with real data. Store admin passwords, Telegram tokens, Turso auth tokens, and SePay API keys outside Git.

## Required and optional settings

| Name | Required when | Meaning / usage |
| --- | --- | --- |
| `BOT_TOKEN` | Telegram bot enabled | Secret issued by [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram webhook enabled | Random 1–256 chars from `[A-Za-z0-9_-]`; must match Telegram `setWebhook` |
| `ADMIN_TELEGRAM_ID` | Admin bot commands | Numeric Telegram user ID; never use a display username |
| `ADMIN_DASHBOARD_PASSWORD` | Web Admin `/admin` | Minimum 16 chars, **32+ random recommended**; fail-closed if absent |
| `SEPAY_WEBHOOK_API_KEY` | SePay for physical goods | Secret used for authenticated `Authorization: Apikey ...` callbacks |
| `BANK_BIN` | VietQR | Supported **6-digit** bank BIN |
| `BANK_ACCOUNT_NO` | VietQR + SePay | Recipient bank account; must match authenticated SePay transactions |
| `BANK_ACCOUNT_NAME` | VietQR | Account holder name displayed on the QR |
| `SUPPORT_USERNAME` | Optional | Telegram support username, without `@` |
| `TURSO_DATABASE_URL` | Vercel/Railway/Render/Koyeb/Docker | Persistent remote Turso/libSQL URL |
| `TURSO_AUTH_TOKEN` | Vercel/Railway/Render/Koyeb/Docker | Turso database auth token |
| `PORT` | Optional for Node HTTP | HTTP port; defaults to `3000` |
| `PHYSICAL_ORDER_TTL_MINUTES` | Optional | Unapproved physical-order TTL; default `30` |
| `STARS_ORDER_TTL_MINUTES` | Optional | Unapproved Stars-order TTL; default `1440` (24h) |
| `PUBLIC_BASE_URL` | Local webhook registration script only | Public HTTPS origin, e.g. `https://YOUR_HOST.example` |
| `WORKER_URL` | Legacy registration alias | Fallback when `PUBLIC_BASE_URL` is not set |

TTL values must be integers from **5 to 10080** minutes; unsupported values use defaults. **Approved Stars pre-checkouts never auto-expire**, regardless of TTL. On non-Cloudflare hosts, expiry requires the admin command or a trusted scheduler.

## Provider-specific database configuration

**Cloudflare Workers + D1**

- Create a D1 database using Wrangler.
- Set the UUID in `../wrangler.toml` at `database_id` (placeholder supplied in source).
- The binding name **must** be `DB`; Turso variables are not needed.
- Use `npm run db:migrate` for remote D1 and `npm run db:migrate:local` for a local test database.
- Set secrets with `npx wrangler secret put NAME`; place non-sensitive variables in the Worker dashboard or `[vars]`.

**Vercel / Railway / Render / Koyeb / Docker**

- Create persistent external Turso/libSQL storage.
- Set **both** `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the host's secrets.
- Apply schema using `npm run db:migrate:turso` from a local terminal with those environment variables set.
- Do **not** substitute an ephemeral local `.db` file. Do not assume data is copied when switching from D1 to Turso.

## Webhook endpoints

| Endpoint | Method | Caller | Authentication |
| --- | --- | --- | --- |
| `/healthz` | GET | Monitoring | Public; checks HTTP handler only |
| `/telegram/webhook` | POST | Telegram | `X-Telegram-Bot-Api-Secret-Token` |
| `/sepay/webhook` | POST | SePay | `Authorization: Apikey <secret>` |
| `/admin` | GET/POST flows | Browser | Secure admin session, Origin and CSRF checks |

The app listens for HTTPS **at your public host** (TLS may terminate at the provider's proxy). Do not append the webhook path to `PUBLIC_BASE_URL` before running the registration script; it appends `/telegram/webhook` itself.

## Safe environment separation

- Use **different Telegram bot tokens and databases** for development, staging and production.
- Avoid attaching real bank details or customer keys to preview URLs.
- Do not print credentials in CI logs or screenshots.
- Rotate compromised credentials and re-register Telegram webhook after changing its secret.
- Back up the database before migrations. See [Operations](OPERATIONS.md).

## Validation checklist

- [ ] All six migrations applied to the **correct** database
- [ ] Hosting secrets configured; none committed to Git
- [ ] `/healthz` responds and log output is inspected
- [ ] Telegram `/start` succeeds with a separate test bot
- [ ] `/admin` login works and unauthorized/CSRF requests fail
- [ ] Physical bank account, amount, memo and SePay callback are checked end-to-end **only if physical payments enabled**
- [ ] [Payment test matrix](PAYMENTS.md) completed before accepting live orders
