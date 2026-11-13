# Database compatibility and migrations

[← Documentation](README.md) · [Configuration](CONFIGURATION.md) · [Deployment](DEPLOYMENT.md) · [Architecture](ARCHITECTURE.md)

> **Current support:** Cloudflare **D1** and remote **Turso/libSQL**. The application does **not** currently include PostgreSQL, MySQL or local SQLite adapters. Changing environment variable names does not add a database provider. Do not migrate a live payment ledger by switching connection strings.

## Supported backends

| Provider / runtime | Adapter actually present | How to connect | Migrations |
| --- | --- | --- | --- |
| Cloudflare Workers + D1 | Native D1 `env.DB` binding | D1 UUID/binding name in `wrangler.toml` | `npm run db:migrate` (remote) |
| Local Cloudflare development | Wrangler local D1 | `wrangler dev` / local binding | `npm run db:migrate:local` |
| Node.js, Vercel, Docker and VM hosts | `src/adapters/turso.js` using `@libsql/client/web` | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | `npm run db:migrate:turso` |

Both backends use SQL migrations `migrations/0001_*.sql` through `0006_*.sql`. The Node runtime in `src/runtime.js` calls `databaseFromEnv`: it uses a native D1 binding when supplied; otherwise it requires the two Turso variables and a remote TLS URL (`libsql://` or `https://`).

**Durability is required.** Orders, payment events, refunds, reserved/delivered keys, admin sessions and notification outbox must survive process restarts. A Docker container filesystem or serverless temporary directory is not durable payment storage.

## What about alternatives to Turso?

| Alternative | Works without source changes? | Why |
| --- | --- | --- |
| Another managed **libSQL-compatible endpoint** | **Not guaranteed** | The existing HTTP client may work if the provider implements the same protocol, authentication and transactional batch behavior. This has **not** been validated and should not be advertised as supported. |
| Neon or Supabase PostgreSQL | **No** | Requires a PostgreSQL adapter, rewritten/verified SQL migrations, transaction semantics and ledger/idempotency tests. |
| Self-hosted PostgreSQL / MySQL | **No** | No corresponding adapter or migration suite. |
| Local SQLite file on a VPS | **No** | No Node local-file SQLite adapter; would require a durable volume, backup/restore and concurrency/transaction tests. |
| Cloudflare D1 from a generic VPS | **No direct binding** | Native `env.DB` is provided inside a Cloudflare Worker. A remote DB HTTP API/adapter would be new code. |

For a minimal **one-bot** deployment today, prefer Cloudflare Workers + D1 (no database vendor to provision separately) or Node/Docker + Turso. Do not assume a similarly named free-tier product is a drop-in replacement.

## Migrate an empty test database

**D1 (inside a checkout with a configured D1 binding):**

```bash
npx wrangler d1 create eplus-telegram-sales-bot
# Replace the database_id placeholder in wrangler.toml
npm run db:migrate
```

**Turso (run only when the database target is confirmed):**

```bash
export TURSO_DATABASE_URL='libsql://YOUR_TEST_DB.turso.io'
export TURSO_AUTH_TOKEN='YOUR_PRIVATE_TEST_TOKEN'
npm run db:migrate:turso
```

The Turso script reads and applies migration files sequentially; it does **not** use Wrangler's D1 migration tracking. Review migrations and back up before applying them to a nonempty database. Both paths **write** schema and must not be run blindly from CI against production.

## Move data between providers

There is **no automatic D1-to-Turso or Turso-to-D1 migration**. Before switching hosting:

1. Take a private backup/export of the source database; include orders, events, keys, sessions, outbox, refunds and locale tables.
2. Create an isolated target database with the correct schema.
3. Design and validate a provider-specific data transfer; preserve IDs, constraints, payment-event uniqueness and inventory ownership.
4. Reconcile row counts and payment/refund state; smoke-test the target and restore procedure.
5. Only then change deployment configuration and the **single active Telegram webhook** to the new HTTPS host.

Do not copy raw plaintext customer keys into tickets, logs or public build artifacts. See [Operations](OPERATIONS.md), [Staging validation](STAGING_VALIDATION.md) and [Payments](PAYMENTS.md).

## Adding a new database provider

A new backend must support the D1-like calls used by the app: `prepare(sql).bind(...).first()`, `all()`, `run()` and **atomic** `batch()` writes, with safe parameter binding and the same ordering/transaction outcomes. Add a provider-specific migration strategy plus negative/replay/race tests for order settlement, refunds, admin CSRF/session isolation, multi-bot separation and notification outbox. Update configuration, the deploy matrix, operations and staging docs **only after code and tests exist**.

For exact interfaces, inspect [Turso adapter source](../src/adapters/turso.js), [runtime](../src/runtime.js) and [multi-bot routing](../src/multi-bot.js).
