# Web Admin — features and operating guide

[← Documentation](README.md) · [Commands](COMMANDS.md) · [Configuration](CONFIGURATION.md) · [Operations](OPERATIONS.md) · [Roadmap](../ROADMAP.md)

This page is the **canonical feature reference for the Web Admin in current code**, not a production-verified deployment. Set a strong `ADMIN_DASHBOARD_PASSWORD`, apply migrations 0001–0006, use HTTPS and open `https://YOUR_HOST/admin`. The dashboard uses server-side sessions, CSRF tokens and an Origin check; no client-side JavaScript is needed.

## Navigation

| Tab | Available features |
| --- | --- |
| Overview | Active products, paid physical orders awaiting dispatch, available digital keys, unresolved bank reviews and notification retries; cumulative recorded VND/Stars payments |
| Products & inventory | Create/edit/hide products; search by name or numeric ID; filter physical/digital and active/hidden; 20 rows/page |
| Orders | Search by order ID or Telegram customer ID, filter SePay/Stars and status (including expiry/refund sidecars), 20 rows/page; mark paid physical orders fulfilled |
| Reconciliation | Review unmatched/mismatched/late bank credits; record acknowledgement; read unresolved Stars refund states |
| Audit log | Last 50 non-sensitive mutation records (action, target ID and time); no raw keys |

**Search/filter behavior:** All search inputs use bound SQL parameters, not string-interpolated queries. The UI preserves supported filters while paginating. The maximum page is capped and no unrestricted order export is exposed.

## Manage digital inventory

- **Single key:** choose a digital product in the Products tab, add one key, and submit.
- **Bulk import:** under *Bulk key import*, specify a digital product ID and paste one key per line. Maximum **50 lines**, each at most **200 characters**, total field size 12,000 characters. Duplicate lines in one request are rejected. Keys already present for that product are skipped.
- Import actions require a valid server-side session, Origin and CSRF. Database operations are batched; audit logs contain only product IDs and counts, **never key values**.
- Key material is still stored as plaintext in the current D1/Turso database, so restrict database and backup access; encryption/rotation and real physical stock reservations are still roadmap items.

## Inventory CSV (counts only)

The Products tab includes `/admin/export/inventory.csv`, available to authenticated dashboard users. The download contains only:

```csv
product_id,kind,total,available,reserved,delivered
1,digital,12,8,2,2
```

This is an **aggregate stock report**; it does **not** contain raw keys, product names, Telegram IDs or payment secrets. The CSV has no user-controlled text fields, reducing spreadsheet-formula injection risks.

## Recorded-payment summary — interpretation

Overview cards show the amounts recorded in **PAID/FULFILLED orders** with a payment reference. A confirmed Stars refund is removed from the count. Separate totals are shown in VND and Stars; they are **never added together as a currency**.

These figures are **not accounting revenue, merchant balances or settlement confirmations**. They are cumulative order snapshots and do not include all possible corrections, fees, manual bank refunds or unresolved disputes. Reconcile with SePay, bank statements and Telegram before using them for financial reports.

## Security and other limitations

- No anonymous access, no unsafe inventory export, and no bulk action without CSRF validation.
- The Audit tab shows recent metadata; it is not a cryptographically tamper-evident or externally stored audit log.
- The physical-order fulfillment action is an administrative status change; it does **not** arrange shipping or provide an automatic customer update.
- Search and page size are bounded; bulk inventory is intentionally limited.
- SSO/RBAC, physical warehouse management, complete shipping lifecycle, encryption/rotation, advanced analytics and full refund disputes remain **unimplemented** and are tracked in [Roadmap](../ROADMAP.md) / [issue #6](https://github.com/ePlus-DEV/telegram-sales-bot/issues/6).

Automated tests validate these flows on disposable SQLite mocks; **that does not add a SQLite production runtime adapter**. Remote staging and live-provider payment tests remain separate release gates. See [Databases](DATABASES.md) and [Staging validation](STAGING_VALIDATION.md).
