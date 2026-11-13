# Operations, backups and incident response

[← Documentation](README.md) · [Configuration](CONFIGURATION.md) · [Payments](PAYMENTS.md) · [Staging validation](STAGING_VALIDATION.md)

**Operating status:** early MVP, **not** a production-certified payment service. The operator owns uptime, billing, authentication, bank reconciliation, backups, incident response and customer communication. Automated CI is **not** a production deploy pipeline.

## Daily checklist

- Check provider status, HTTPS `/healthz` and a **real test bot message**; a health HTTP 200 is insufficient.
- Inspect Telegram/SePay webhook errors and missing updates; **never log raw tokens, keys or payment credentials**.
- Review **PAID but undelivered** orders and `notification_outbox` pending entries.
- Run `/bankreviews` for unknown/wrong/late SePay transfers; an acknowledgement does **not** refund money.
- Run `/refundreviews` for uncertain Stars refund states; verify with Telegram before taking another action.
- Check database health, quotas, backup age, billing alerts and renewal/host expiration.

## Scheduling and retries

| Host | Existing capability | Operator action |
| --- | --- | --- |
| **Cloudflare Workers** | `wrangler.toml` `[triggers]` every **5 minutes** | Verify scheduled job/logs and actual recovery on the deployed Worker |
| **Oracle Docker Compose** | `scripts/run-maintenance.mjs` and a **host cron example** | Install/enable host cron, verify successful jobs and logs |
| **Other Node/Docker VPS** | Same **on-demand** Node maintenance script | Supply a trusted supervisor/cron; do not expose an unauthenticated HTTP maintenance endpoint |
| **Vercel/Railway/Render/Koyeb** | No automatic scheduler configured by this repository | Implement a trusted provider job/schedule, or operate admin recovery commands manually while testing |
| **Google Cloud Run/Azure Container Apps** | Candidate container runtime only | Build and secure a separate scheduled Job; no completed recipe in repo |
| **InstaBox Free** | On-demand test bot only; machine may suspend | Never depend on cron or prompt payment processing during suspension |

On a **running Oracle Compose** host (working directory `deploy/oracle`), operator-run maintenance is:

```bash
docker compose exec -T bot node scripts/run-maintenance.mjs
```

The [Oracle runbook](../deploy/oracle/README.md) includes a sample **five-minute host crontab**. Run this only after confirming it targets the correct bot/database. For emergency manual operation, the authorized Telegram admin can use `/expireorders` and `/retryalerts`. **Never expire a previously approved Stars pre-checkout** based only on elapsed time.

Notification delivery is **at least once**; Telegram lacks a send-message idempotency key, so crashes can result in duplicate **messages**. Duplicate messages are **not** proof of duplicate charges; inspect payment ledger records.

## Database backups and restore

**D1:** export the **remote** target database to a **private** location before a migration and regularly afterward:

```bash
npx wrangler d1 export eplus-telegram-sales-bot --remote --output=./private-test-backup.sql
```

This is an example filename. Real exports contain plaintext inventory keys, orders, user IDs and potentially payment information. Keep them **outside any pushed repository**, encrypted and access-restricted. See [Cloudflare's D1 export command](https://developers.cloudflare.com/d1/wrangler-commands/).

**Turso/libSQL:** use the database provider's current backup/export and restore mechanisms (see [Turso documentation](https://docs.turso.tech/)). **Do not assume** a D1 export can be imported directly into an existing live Turso DB without transformation/verification. Migrating hosts does **not** move customer data automatically.

**Restore drill:** restore to a completely separate **staging** database, validate migrations and relationships among `orders`, `payment_events`, digital inventory, admin sessions, refunds and notification outbox. Reconcile counts and payment state before changing webhook routing. Record last successful backup, recovery owner and retention location without recording secrets.

## Safe release procedure

1. Review the PR, test results and any **forward-only** schema migrations.
2. Take and verify a private backup of the **exact target database**.
3. Test changes against an independent staging bot/database; never run production migrations from a PR build.
4. Apply reviewed migrations for that provider (`npm run db:migrate` for D1; `npm run db:migrate:turso` for remote Turso) **before enabling code that needs them**.
5. Deploy the code using the host runbook. Verify HTTPS, database connectivity, admin auth/CSRF, webhook rejection and actual test bot messages.
6. Verify expiry/outbox scheduler, notification recovery and provider quotas/billing after deployment.
7. Keep rollback instructions. **Reverting code does not undo a database schema migration**. Use a tested restore procedure if data recovery is required.

**No automatic production migration, bot webhook registration or live payment deploy occurs in the repository's PR CI.**

## Incident playbook

| Symptom | First safe actions |
| --- | --- |
| Bot silent | Check host sleep/uptime, quota, public DNS/HTTPS, BotFather token, **single active webhook**, secret header, logs |
| Paid order, key missing | Inspect order/event/outbox and `/mykey ORDER_ID`; use `/retryalerts` only for a missing message; **never mint/deliver a second key blindly** |
| Unknown or late bank transfer | Review `/bankreviews`, bank statement and SePay transaction; do not auto-credit another order |
| Stars refund status unknown | Review `/refundreviews` and original charge in Telegram; **do not retry uncertain `refundStarPayment` automatically** |
| Admin login fails | Check HTTPS scheme, Host / `X-Forwarded-Proto`, session DB, password/CSRF and migration 0005 |
| Language settings missing | Confirm locale migration 0006 on the **actual** DB |
| Preview stole live webhook | Restore correct production webhook intentionally; keep distinct test and prod bot tokens |
| Database becomes unavailable | Preserve logs/backup; do not switch to ephemeral SQLite or replay unknown settlements |
| Credentials exposed | Rotate at provider, re-register webhook secret/token as needed, inspect logs/audit records and invalidate sessions appropriately |

## Monitoring gaps and evidence

The app does **not** yet provide comprehensive SLO dashboards, automatic database backups, guaranteed non-Cloudflare scheduling, full approved-but-abandoned Stars reconciliation or accounting-grade reporting. See [Roadmap P0](../ROADMAP.md#p0--release-blockers-deferred-execution-required-for-launch).

Keep separate evidence for (1) offline CI, (2) authenticated remote staging checks and (3) **supervised provider payment E2E**. See [Staging validation](STAGING_VALIDATION.md). Passing (1) or (2) never substitutes for (3).
