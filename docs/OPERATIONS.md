# Operations, backups and incident response

[← Docs](README.md) · [Deployment](DEPLOYMENT.md) · [Payments](PAYMENTS.md) · [Roadmap](../ROADMAP.md)

**Operating level:** early MVP, not a fully managed payment service. The operator is responsible for uptime, credentials, bank reconciliation, recovery, customer communication and business compliance.

## Daily operating checklist

- Check `GET /healthz` and **real** bot replies (`/start` / `/catalog`), not just HTTP success.
- Inspect hosting error logs for Telegram/SePay webhook failures; no raw credentials or customer key material in logs.
- Review orders stuck in PAID/undelivered status and any `notification_outbox` pending records.
- Use `/bankreviews` for late, mismatched and unexpected credits. Do not infer that a bank transfer was refunded just because it was acknowledged.
- Use `/refundreviews` for uncertain Stars refunds, and confirm with Telegram before manual intervention.
- Check D1/Turso quotas, free-tier limitations and account billing.

## Scheduling by hosting type

| Hosting | Existing implementation | Operator action |
| --- | --- | --- |
| Cloudflare Workers | `[triggers]` every five minutes | Confirm scheduled runs/errors in deployed Worker logs |
| Vercel, Railway, Render, Koyeb, Docker | No automatic scheduled daemon in the app | Authorized admin may run `/expireorders` and `/retryalerts`; trusted scheduling is future work |

`/expireorders` only expires **eligible unapproved** orders. Never release stock on a previously approved Stars checkout without reconciliation.

## Database backup — Cloudflare D1

Before migrations and at an appropriate regular cadence, export the full **remote** database to a **private location** (contains plaintext digital keys, user IDs, orders and possibly bank records):

```bash
npx wrangler d1 export eplus-telegram-sales-bot --remote --output=./private-staging-backup.sql
```

This syntax is documented by [Cloudflare D1 export](https://developers.cloudflare.com/d1/wrangler-commands/). The example filename is illustrative; store real backups encrypted with restricted access, never in GitHub or the project folder you push. Cloudflare documents importing a SQL export using `wrangler d1 execute --file`; **practice restore into an isolated test database first**, never over live production data without an approved recovery plan.

Check backup integrity, record its date and retention, and verify restoration including relations among `orders`, `digital_inventory`, payment-event records, notification outbox and locale/admin tables.

## Database backup — Turso

Follow [Turso's official backup/restore guidance](https://docs.turso.tech/) for the database's current storage engine and plan. Export/snapshot to a **private, encrypted location**; test restoring to a separate staging database and verify schema/migrations 0001–0006.

Do not assume D1 exports can be copied directly into a live Turso database, or vice versa, without schema/data validation. **Switching hosting does not migrate data automatically.**

## Migration / release safety

1. Review changes and CI. Confirm if SQL migrations are required.
2. Back up **the specific target** database (production and staging may be different).
3. Test migrations and application logic against a separate staging copy.
4. Apply migrations to the target using `npm run db:migrate` (D1 remote) or `npm run db:migrate:turso` (remote Turso). Never edit/drop production order tables manually.
5. Deploy the code, verify startup/health and real Telegram webhook delivery.
6. Test critical payment flows with a controlled environment. Watch for new outbox retries, unexpected bank reviews and paid-but-undelivered orders.
7. Document schema/data rollback and restoration options. **Reverting code does not reverse database migrations.**

No production deploy or migrations are performed automatically by the GitHub CI workflow.

## Incident response

| Symptom | Immediate safe action |
| --- | --- |
| Bot stops answering | Check host uptime, provider quotas, `BOT_TOKEN`, registered webhook URL, secret header, platform logs |
| Paid order, no key message | Inspect payment ledger/order and outbox; run `/retryalerts`; buyer can try `/mykey ORDER_ID`; do **not** create another delivery record |
| Unknown/late/wrong SePay transfer | Review `/bankreviews`, verify against provider/bank statement, communicate with payer; do not assign to another order automatically |
| Uncertain Stars refund | Open `/refundreviews`; verify result at Telegram before **any** further API call |
| Admin session/login trouble | Confirm HTTPS, host/origin forwarding, Secure cookie, `ADMIN_DASHBOARD_PASSWORD`, schema `0005` |
| Missing locale table | Ensure migration `0006` applied to the actual D1/Turso database |
| Staging accidentally receives production bot events | Restore **one bot token = one webhook URL** routing; use distinct test bot and production bot |
| Exposed token/secret | Rotate it immediately in provider, host settings and webhook; review logs and audit events; invalidate sessions where appropriate |

## Monitoring gaps and future work

Current MVP has health endpoint, database-backed notification retry and basic operational commands. It does **not** yet include complete paid-order alerts, automated reconciliation of approved-but-abandoned Stars checkouts, trusted non-Cloudflare scheduling, backup automation, full audit dashboards or SLO/uptime reporting.

See [P0 release gates](../ROADMAP.md) and the [Security Policy](../SECURITY.md). Do not claim production certification until the recovery drill and provider end-to-end tests have passed.
