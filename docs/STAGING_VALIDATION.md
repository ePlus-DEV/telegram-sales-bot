# Staging validation — manual and non-destructive

[← Documentation](README.md) · [Deployment](DEPLOYMENT.md) · [Roadmap](../ROADMAP.md) · [Payments](PAYMENTS.md)

> **This is a validation toolkit, not an auto-deploy system.** Nothing in this guide or the workflow deploys code, registers `setWebhook`, sends Telegram updates, marks orders paid, refunds Stars, or modifies product inventory. Do not treat passing offline tests as proof that live payments work.

## Validation levels

| Level | Where | What it proves | What it does NOT prove |
| --- | --- | --- | --- |
| **A — Local/PR CI** | GitHub Actions, no credentials | Config parser tests, all SQL migrations apply twice to disposable SQLite, route/security unit tests, Docker builds | Cloudflare or Turso has been deployed, provider API works, live payment |
| **B — Staging HTTP** | Manual GitHub Actions with a dedicated staging URL | HTTPS health response, admin login page, rejection of unauthenticated Telegram/SePay callbacks, CSRF/guest write protection | A legitimate payment callback or real Telegram delivery succeeds |
| **C — Staging database** | Same manual workflow | Admin sign-in/dashboard query can reach actual staging DB; for Turso, separate **read-only** schema table check | Every production table is valid / migration was safe on production |
| **D — Payment E2E** | Human-controlled test bot and dedicated provider test environment | Entire invoice/order/payment/delivery lifecycle | **Not automated by this workflow** |

PRs run **only Level A**. Levels B/C can run after the staging stack has been independently deployed and configured. Level D needs separate supervised testing.

## 1. Offline checks — safe to run on any machine

```bash
npm install
npm run check
npm run staging:check-migrations
npm test
npm run docs:check
```

The migration checker creates a brand-new in-memory SQLite database and verifies that sequential `0001`–`0006` files apply and **re-apply**, that required tables exist and foreign keys are valid. It does **not** connect to D1 or Turso.

To validate actual configuration variables **offline without displaying their values**, set the intended environment values securely and run:

```bash
npm run staging:preflight -- --provider=cloudflare
# OR when running Vercel/Railway/Render/Koyeb/Docker backed by Turso:
npm run staging:preflight -- --provider=turso
# Add --physical when the shop accepts physical bank transfers:
npm run staging:preflight -- --provider=cloudflare --physical
```

Required: `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_TELEGRAM_ID`, `ADMIN_DASHBOARD_PASSWORD` and (for Turso) `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`. Bank variables are validated when physical payments are enabled or any bank configuration is present. Preflight prints **only field names and error reasons**. It does not make network requests, or prove credentials are valid.

## 2. Prepare a genuinely isolated staging deployment

1. Create a **separate Telegram test bot** and a **separate D1/Turso database**; never point staging at a production bot or DB.
2. Deploy using [DEPLOYMENT.md](DEPLOYMENT.md), apply all migrations, configure staging-only secrets, and test `GET /healthz` manually.
3. Choose an explicit staging host such as `https://staging-sales.example.org` or `https://staging-shop.example.workers.dev`. The smoke script refuses plain production-looking hosts, HTTP, custom ports, paths, query strings, local/private IPs and redirects.
4. Verify the Web Admin password is a unique **staging-only** value. Its authenticated smoke flow creates one short-lived admin session and then logs out; it does not change products/orders/payments.

**Do not** use the same `ADMIN_DASHBOARD_PASSWORD`, database token, bank details or bot token on staging and production.

## 3. Configure GitHub Environment (one-time, manual)

Go to **Repository → Settings → Environments → New environment**, name it exactly **`staging`**. Configure **required reviewers** and restrict deployment branches to `main` when supported for the repository/plan. GitHub's [environment protection docs](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) explain which plans support those rules.

Set these as **Environment variables** (not source-code constants):

| Variable | Value |
| --- | --- |
| `STAGING_BASE_URL` | Explicit staging HTTPS origin only, e.g. `https://staging-sales.example.org` |
| `STAGING_DB_PROVIDER` | `cloudflare` or `turso` (optional; defaults to `cloudflare`) |

Set these as **Environment secrets**, never printed by the workflow:

| Secret | Required | Purpose |
| --- | --- | --- |
| `STAGING_ADMIN_DASHBOARD_PASSWORD` | **Yes** | Read the authenticated admin dashboard / prove DB-backed admin session works |
| `STAGING_TURSO_DATABASE_URL` | If provider = `turso` | Staging DB endpoint for schema reads |
| `STAGING_TURSO_AUTH_TOKEN` | If provider = `turso` | Staging-only token for schema inspection, ideally least privilege/read-only |

**Do not configure production secrets for this workflow.** The workflow does **not** use `BOT_TOKEN`, `SEPAY_WEBHOOK_API_KEY`, `GITHUB_TOKEN` write operations, Cloudflare API tokens or deployment credentials.

GitHub Environment is a permission boundary only if you actually configure and protect it. A workflow referencing `staging` will not automatically create required reviewers or populate secrets for you.

## 4. Manually run validation

After the workflow is merged into `main` and staging is deployed:

1. Go to **Actions → Staging Validation (manual, read-only) → Run workflow** and choose **main**.
2. Complete any configured environment review/approval.
3. Read the job summary and inspect any failing probe; update staging or open an issue for actual defects.
4. Save a link to the successful run in the release checklist. **A green check does not certify payments.**

For a local HTTP check without GitHub Actions, export `STAGING_BASE_URL` and optionally `STAGING_ADMIN_DASHBOARD_PASSWORD`, then:

```bash
npm run staging:smoke
```

If Turso is enabled, set `STAGING_TURSO_DATABASE_URL` and `STAGING_TURSO_AUTH_TOKEN` and run `npm run staging:check-turso`. This reads only `sqlite_master`; it does not alter orders or migrations.

## 5. What the smoke test calls

| Request | Expected | Effect |
| --- | --- | --- |
| `GET /healthz` | HTTP 200, `ok=true`, expected service name | No DB query in current implementation |
| `GET /admin?lang=en` | HTTP 200 secure login page, CSP | No privileged data |
| `POST /telegram/webhook` **without token** | HTTP 401 | Authentication rejection before any bot actions |
| `POST /sepay/webhook` **without API key** | HTTP 401 | Authentication rejection before any payment actions |
| `POST /admin/products/create` with wrong Origin | HTTP 403 | Rejected before authorization/mutation |
| `POST /admin/products/create` without cookie | HTTP 401 | Rejected before database write |
| `POST /admin/login` with staging password | HTTP 303 | Creates an 8-hour DB session, only if staging password provided |
| `GET /admin` with staging session | HTTP 200 with CSRF token | Reads dashboard statistics from staging DB |
| `POST /admin/logout` | HTTP 303 | Revokes the just-created admin session |

Requests never follow 30x redirects, do not emit webhook authentication secrets, and do **not** send a valid payment payload. No external request is made during pull_request CI tests (they use local Worker mocks).

## 6. Remaining work before production

- Verify migration **state against live D1** using Cloudflare's own migration inventory (this workflow cannot query D1 via an unauthenticated HTTP endpoint). Turso schema checks ensure expected table names but do not prove every column or constraint.
- Set up staging Telegram bot webhook and SePay test callback **manually** with safe separate credentials.
- Run the [payment matrix](PAYMENTS.md) with a controlled test environment; capture Stars pre-checkout/settlement, SePay matching/late/duplicate credits, refund results, and delivered key audit evidence.
- Prove backup/restore into isolated staging, alerting, approved-but-abandoned Stars checkout reconciliation and resilience to hosting cold starts.
- Do not mark `v1.0.0` or close outstanding #5/#6 solely because this workflow passes. See [Database compatibility](DATABASES.md): disposable SQLite mocks do **not** constitute a supported production local SQLite adapter.
