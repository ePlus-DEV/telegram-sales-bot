# Security Policy

This is an early MVP, **not** a hardened payment system.

For a vulnerability, do **not** post tokens, customer keys, bank transactions, or exploit details in a public issue. Use GitHub private vulnerability reporting if enabled for this repository, or contact the maintainers through their existing organization support channels.

## Production checklist
- Use unique random Telegram and SePay webhook secrets stored as Worker secrets, never in the repository.
- Keep D1 or Turso admin access and backups tightly restricted; never store payment data on an ephemeral host filesystem.
- Validate real SePay webhook delivery with the precise bank account and transaction.
- Test Stars invoice, successful payment, refund, inventory and duplicate-event behavior.
- The payment notification outbox supports retry; monitor stuck outbox entries and use `/retryalerts` or Cloudflare cron. The transport is at-least-once (Telegram does not provide an idempotency key for sendMessage).
- Add alerting and recovery for late settlement, expired reservations, actual refunds, and paid-but-missing stock before production.
- Review current Telegram rules for digital vs physical payments.
- Add rate limiting, admin audit log, inventory encryption and a proper refund/cancellation flow before handling sensitive credentials or scaling up.

Do not enable live transactions until a security and operations review is complete.
