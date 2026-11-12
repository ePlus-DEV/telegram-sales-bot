# Product roadmap — ePlus Telegram Sales Bot

[← README](README.md) · [Documentation](docs/README.md) · [Open issues](https://github.com/ePlus-DEV/telegram-sales-bot/issues) · [Pull requests](https://github.com/ePlus-DEV/telegram-sales-bot/pulls)

> **Current phase: pre-production MVP hardening.** Roadmap milestones are plans, not promises of completion dates. A green CI run means automated checks passed; it does **not** demonstrate a successful real-money flow or operational readiness.

## Status legend

- **Implemented** — code exists on `main`, with some automated tests; may still need deployment verification.
- **Partial** — initial workflow exists; important edge cases or usability remain.
- **Planned** — not available in the current application.
- **Release gate** — required evidence before a production release, independent of feature completion.

## Current capabilities

| Area | State | Evidence / limitations |
| --- | --- | --- |
| Telegram shop & catalog | Implemented | `src/index.js`, `src/purchase.js`; no cart |
| Stars invoices + key delivery | Partial | Checkout, reserved inventory, delivery and outbox implemented; abandoned approved checkouts need reconciliation |
| VietQR + SePay | Partial | Authenticated bank webhook, mismatch/late review; no live provider E2E verification |
| Payment reliability | Partial | Replays, callback idempotency, expiry before pre-checkout, uncertain-refund review; at-least-once notification delivery |
| Web Admin | Partial | Product CRUD, single-key intake, physical order fulfillment, review UI; no SSO/RBAC or bulk operations |
| Two languages | Implemented | Bot and admin `vi/en`, Telegram language preference; product copy not localized |
| Multi-platform deployment | Partial | Code/config for Workers, Vercel, Railway, Render, Koyeb and Docker; live deploy matrix unverified |

## P0 — Release blockers (next)

| Item | State | Acceptance criteria |
| --- | --- | --- |
| Deploy and validate staging | Planned | Working HTTPS endpoint + persistent DB; migrations 0001–0006; deployed domain and webhook verified; no production secrets in preview |
| Payment E2E test matrix | Planned | Stars success/replay/failed notification, SePay valid/invalid/duplicate/late credit, inventory and unauthorized admin cases all verified in a controlled test environment |
| Approved Stars checkout recovery | Partial · [#5](https://github.com/ePlus-DEV/telegram-sales-bot/issues/5) | Never release reserved stock while charge may arrive; document reconciliation of orphaned approvals and late successful payments |
| Refund and dispute runbook | Partial · [#5](https://github.com/ePlus-DEV/telegram-sales-bot/issues/5) | Reconcile uncertain `refundStarPayment` result, bank refunds (manual), customer communication and audit evidence |
| Backup and restore drill | Planned | Document and test DB backup, restore into isolated staging, data integrity and recovery after failure |
| Observability and alerts | Planned | Detect paid-but-undelivered orders, unsent outbox records, failed webhooks, login anomalies, quota exhaustion |
| Auth/data security review | Planned | External/admin security review, secret rotation, permissions, plaintext-key storage risk mitigation |
| Provider-specific reliability | Planned | Verify Vercel Functions, Node reverse proxy, cold-start effects and cron/manual maintenance across hosting options |

**No `v1.0.0` or production-ready claim until these release gates are proven.**

## P1 — Usable store management

| Item | State | Acceptance criteria |
| --- | --- | --- |
| Web Admin enhancements | Partial · [#6](https://github.com/ePlus-DEV/telegram-sales-bot/issues/6) | Search/filter/page products and orders; analytics; audit viewing; inventory operations beyond single-key add |
| Product localization | Planned | Per-locale `name` and `description`, explicit fallback, migration, tests and English/Vietnamese editing UI |
| Physical order management | Planned | Delivery address, shipping method/fee, physical stock, tracked fulfillment events and customer updates |
| Key inventory protection | Planned | Encryption/rotation plan, bulk import/export policy, no secret leakage in UI/API/logs |
| Self-service shop onboarding | Planned | First-run setup, configuration validation and clear deployment diagnostics |
| Role-based admin | Planned | Optional SSO, scoped roles, critical actions requiring confirmation, audit trail |

## P2 — Commerce extensions

| Item | State | Notes |
| --- | --- | --- |
| payOS for eligible physical goods | Planned | Signed server-side callbacks, amount/order validation, replay tests, legal/provider compliance |
| Additional eligible VN gateways | Planned | Evaluate MoMo/VNPay only when compatible with Telegram's product-type rules |
| Cart + multi-item orders | Planned | Atomic stock/pricing and safe payment settlement |
| Promotions and referrals | Planned | Coupon rules, limits, fraud prevention, attribution |
| More locales | Planned | Translation coverage/quality checks, no modification of payment identifiers |

## Release milestones

1. **MVP engineering foundation — implemented:** bot, payment adapters, admin, localization, multi-host configs and CI.
2. **Staging validation — next:** operator walkthroughs and scenario-based E2E records for a dedicated test bot + database.
3. **Release candidate:** P0 gates, data migration/restore drill, monitoring, usability review, security audit, issue triage.
4. **v1.0.0:** only after release candidate passes; then expand P1/P2 independently.

## Maintaining this roadmap

When opening a PR: link the relevant issue/roadmap item, include test evidence and any required migrations or deployment actions. Update the state only after code is merged and verified. **Do not automatically close issue #5 or #6** until their unimplemented acceptance criteria are met; partial implementation is not completion.

Use [GitHub Issues](https://github.com/ePlus-DEV/telegram-sales-bot/issues) for detailed scope and [PRs](https://github.com/ePlus-DEV/telegram-sales-bot/pulls) for implementation review. Revisit priorities after each staging test cycle.
