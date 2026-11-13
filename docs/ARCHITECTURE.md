# Architecture and runtime boundaries

[← Documentation](README.md) · [Databases](DATABASES.md) · [Multi-bot](MULTI_BOT.md) · [Contributing](../CONTRIBUTING.md)

This page maps the **implementation in the repository**, not a planned infrastructure diagram.

## Request flow

```text
Telegram / SePay webhook or Web Admin browser
                 |
           Public HTTPS host
                 |
       +---------+------------+
       |                      |
Cloudflare Worker        Node / Vercel entry
src/index.js             src/server.js / api/*
       |                      |
Native D1 binding        src/runtime.js
       |                      |
       |              Host routing + Turso adapter
       +----------+-----------+
                  |
           Shared Worker logic
          src/index.js + domain
                  |
           D1 or Turso/libSQL
         Orders, inventory, events,
        sessions, outbox, language
```

- **Cloudflare:** `wrangler.toml` maps `src/index.js` to a Worker and declares D1. Its `[triggers]` schedule runs every five minutes.
- **Node/Docker:** `src/server.js` converts HTTP requests into Fetch `Request` objects. `src/runtime.js` resolves the bot by hostname, obtains its database and calls the Worker handler.
- **Vercel:** `api/` handlers and `vercel.json` map HTTPS routes to the Node-compatible runtime.
- **Data access:** `src/adapters/turso.js` translates D1-style prepared statements and atomic batch writes to `@libsql/client/web`. The only implemented persisted backends are **D1** and **remote Turso/libSQL**.
- **Web Admin:** `src/admin/` contains login/session, CSRF and data/UI handlers; `src/i18n.js` and `src/admin/locales.js` provide UI language strings.

## Security and isolation

A single bot uses unprefixed credentials. When `MULTI_BOTS` is set, `src/multi-bot.js` matches an **exact HTTPS hostname** and requires separate token, webhook secret, storage and admin settings per bot; missing/unknown tenants fail closed. No shared tenant-scoped database fallback is allowed. See [Multi-bot setup](MULTI_BOT.md).

Private values are stored in provider secret settings or git-ignored host files, never in client-side HTML or Docker build context. Admin uses server-side sessions, same-origin checks and CSRF protections. **Digital keys currently persist as plaintext** in the database; treat all DB backups as sensitive.

## Payment, jobs and recovery

- **Digital:** Telegram Stars checkout and `successful_payment` event; never fulfill on pre-checkout alone. Approved checkouts must not be expired automatically.
- **Physical:** VietQR transfer instructions and authenticated SePay webhook; amount/account/memo/event must match before settlement.
- **Outbox:** DB-backed notification retries are **at least once**; a Telegram message can be repeated if acknowledgement is lost.
- **Periodic work:** Cloudflare Worker has its own scheduled handler; `scripts/run-maintenance.mjs` reuses it when invoked **explicitly for a single bot** on Node and rejects `MULTI_BOTS`. A tenant-aware Node scheduler is **not** shipped. The Oracle guide supplies an example host cron. Node PaaS and InstaBox do **not** automatically gain a working scheduler from the Dockerfile.
- **No production deploy in CI:** GitHub Actions performs offline checks, a Docker build and manually scoped staging validation. It does not provision clouds, migrate live DBs, register webhooks or certify payment settlement.

## Code map

| Path | Responsibility |
| --- | --- |
| `src/index.js` | Shared HTTP/Telegram/payment handler and scheduled logic |
| `src/domain.js`, `src/purchase.js`, `src/reconciliation.js` | Order decisions, purchase and recovery paths |
| `src/notifications.js` | Outbox and message retry |
| `src/adapters/turso.js`, `src/runtime.js` | Non-Cloudflare database/runtime adaptation |
| `src/multi-bot.js` | Per-host tenant configuration and isolation |
| `src/admin/` | Web dashboard and server-side security |
| `migrations/` | SQLite/D1/libSQL schema updates |
| `scripts/` | Database migration, webhook registration, maintenance, safe staging helpers |
| `deploy/oracle/`, `deploy/instabox/` | Provider-specific examples (not live E2E certification) |
| `tests/`, `.github/workflows/` | Automated checks and gated staging workflow |

## Extending safely

Maintain [AGENTS.md](../AGENTS.md) invariants: forward-only schema migrations, unique payment event ledger entries, safe key reservations, tenant isolation and idempotent settlement. New providers need real adapters and tests, not just README badges. Before shipping payment changes, use [Staging validation](STAGING_VALIDATION.md), [Payments](PAYMENTS.md), [Operations](OPERATIONS.md) and [P0 release gates](../ROADMAP.md).
