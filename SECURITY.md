# Security Policy

This is an early MVP, **not** a hardened payment system. See [payment flows](docs/PAYMENTS.md), [operations](docs/OPERATIONS.md) and [database handling](docs/DATABASES.md).

For a vulnerability, do **not** post tokens, customer keys, bank transactions, or exploit details in a public issue. Use GitHub private vulnerability reporting if enabled for this repository, or contact the maintainers through their existing organization support channels.

## Production checklist
- Use unique random Telegram and SePay webhook secrets stored in the **hosting provider's secret store** (Cloudflare Worker secrets, PaaS settings or restricted VM files), never in the repository.
- Keep D1 or Turso admin access and backups tightly restricted; never store payment data on an ephemeral host filesystem.
- Validate real SePay webhook delivery with the precise bank account and transaction.
- Test Stars invoice-link recovery, single pre-checkout approval, successful payment, refund, inventory and duplicate-event behavior.
- The payment notification outbox supports retry; monitor stuck outbox entries and use `/retryalerts` or Cloudflare cron. The transport is at-least-once (Telegram does not provide an idempotency key for sendMessage).
- Add alerting and recovery for late settlement, expired reservations, actual refunds, and paid-but-missing stock before production.
- Review current Telegram rules for digital vs physical payments.
- Add rate limiting, admin audit log, inventory encryption and a proper refund/cancellation flow before handling sensitive credentials or scaling up.

Do not enable live transactions until a security and operations review is complete.

## Payment reconciliation
- Keep pending approvals reserved; never release keys based only on age after a Stars pre-checkout was approved.
- Verify Stars refund outcomes in Telegram if the API times out; do not retry an unknown refund automatically.
- Review unallocated/late bank transfers through `/bankreviews`; `/ackbank` records human review only.
- Apply **all migrations 0001–0006** to the correct database before enabling current code, and verify Cloudflare's scheduled Worker or an explicitly configured trusted Node maintenance process. The shipped Node runner is **single-bot only**.

## Admin Dashboard
- Generate a unique 32+ character `ADMIN_DASHBOARD_PASSWORD` and store it in hosting secret settings. Never commit a default password.
- Dashboard is disabled without a 16+ character secret. Use only HTTPS (Secure/HttpOnly/SameSite cookies) and the server-side session table; logout revokes the session.
- Mutations require CSRF token and Origin validation, parameterized SQL, and append-only audit events without sensitive payloads.
- Login attempts are throttled per edge IP when available and globally otherwise; consider identity-aware proxy/SSO for production.
- No raw credentials are rendered in HTML, but digital inventory remains plaintext in D1/Turso until encryption-at-rest and key rotation are implemented.

## Language preferences
- The Telegram locale table stores only user ID, language and auto/manual source. It must not store credentials or payment data.
- Admin's language cookie carries only `vi` or `en`; it is never an authorization token. Keep session/CSRF protections independent of language.
- Translated payment strings must not alter the bank memo, Stars amount, user IDs or refund authorization/processing.
