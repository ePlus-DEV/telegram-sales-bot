# AI and contributor instructions

## Purpose
Build a small, secure, source-available Telegram shop for Cloudflare Workers + D1 and portable Node/Docker deployments backed by remote Turso/libSQL. Do not claim other database engines are supported without an adapter and migrations/tests.

## Non-negotiable requirements
1. No credentials, Telegram token, bank account details, webhook secrets, or customer inventory in commits, issues, build logs, or test snapshots.
2. Digital goods and services sold inside Telegram use Telegram Stars (XTR), not SePay/VietQR/payOS. Bank transfer is for physical goods/services only; follow current Telegram policy.
3. All payment settlements are validated server-side and idempotent. Each Telegram Buy callback ID maps to exactly one order; never allow two distinct Stars pre-checkout approvals for the same order. Treat webhooks as untrusted before authenticating.
4. Keep DB schema migrations forward-only, with corresponding tests. Never erase production orders.
4a. Multi-bot hosting must fail closed: each hostname maps to exactly one bot with distinct token, webhook secret, database, bank credentials, and Web Admin session store. Never silently fall back to the legacy global credentials or DB.
5. Keep zero-always-on free deployment possible via Cloudflare Workers + D1. For Vercel/Railway/Render/Koyeb use durable external Turso/libSQL, never ephemeral local SQLite for payment or inventory storage. Avoid mandatory VPS, Redis or paid dependencies.
6. Do not edit marketing/SEO/public copy unrelated to the assigned task.
7. Work on a feature branch, open a PR to main, run `npm run check && npm test`; never auto-merge without explicit instruction.
8. Do not modify production or set up live payment credentials for users without their explicit access.
9. For every added gateway: verify event signatures/auth, account, amount, reference, currency and replay handling; add negative tests.
10. No fraud, counterfeit accounts, resale of unauthorized credentials, or bypassing payment-provider terms.

## Development
Node.js 24 preferred. Run `npm run check`, `npm test` and validate the Docker build when changing runtimes. Keep Telegram/SePay webhook paths stable across all platforms. Keep changes small, readable, and bilingual-friendly. Document any unimplemented production requirement explicitly.

## Reconciliation invariants
- Never expire a Stars order whose pre_checkout_query was approved. A successful_payment can be delayed.
- Never re-issue an uncertain Stars refund operation without checking Telegram first; retain immutable charge IDs.
- Record late/mismatched SePay transfers for explicit review, never credit them against a different order.
- D1 and Turso must have identical forward-only migrations. Add negative/replay/race tests for payment changes.

## Web Admin requirements
- Admin routes are server-side authenticated. No client-only admin role checks, localStorage tokens or hard-coded passwords.
- Every mutation requires HttpOnly session, same-origin validation, CSRF and SQL-bound parameters; record a safe audit event.
- Never expose raw inventory keys, DB tokens, payment secrets, or admin password in HTML, API, logs or PR descriptions.
- Use forward-only migrations on both D1 and Turso. Validate unauthorized, CSRF, XSS, rate-limit and ledger invariant cases in CI.

## Localization conventions
- Never hard-code new Telegram user-facing text in payment handlers. Add both vi/en messages to `src/i18n.js` with stable keys; preserve refund, currency, account and ledger semantics.
- Web Admin static labels belong in `src/admin/locales.js`. Never translate user-provided product names, credentials, data or key contents.
- Telegram manual locale selection must persist across Workers and Turso runtimes and override language_code. Unsupported languages fall back to Vietnamese.
- Add tests for locale switching, auto-detection, fallback, background notifications and English admin login. Do not break legacy Vietnamese flows.

## Documentation maintenance
- Keep README concise: feature summary, actual deployment status, safe Deploy badges, getting-started links and roadmap. Detailed runbooks belong in `docs/` and `deploy/*/README.md`; use `docs/README.md` as the documentation index and keep `docs/DATABASES.md` and `docs/ARCHITECTURE.md` aligned with actual code.
- Treat [ROADMAP.md](ROADMAP.md) as the project-level delivery plan; distinguish implemented code, partial functionality, deployment verification and release gates.
- Never imply that CI means verified payments or production readiness. Do not claim a host was deployed unless an end-to-end test actually ran.
- Keep English/Vietnamese getting-started guides consistent and run `npm run docs:check` after changing Markdown links (including runbooks under `deploy/`). Avoid hardcoding changing cloud free quotas unless verified against the provider's current official documentation.

## Staging verification rules
- PR CI may run disposable SQLite migrations and local Worker mocks, but must never deploy or call a live payment provider.
- `.github/workflows/staging-validation.yml` must remain manual-only, scoped to main and GitHub Environment staging, with read-only permissions. Never introduce scheduled execution, webhook registration, order mutations or production secrets.
- Staging HTTP smoke must only send intentionally unauthenticated Telegram/SePay requests and safe Admin authentication/logout flows; enforce staging-only HTTPS hostnames and no redirect following.
- Always distinguish offline checks, a remote staging HTTP/DB check, and a supervised payment E2E test. Passing one does not imply the others passed.

## Feature-first development priority
- Staging/live provider E2E execution is deferred until requested; CI and local tests still run for every PR. Do not claim live readiness.
- Complete Web Admin features incrementally on independent branches with Draft PRs and tests, before staging rollout.
- Only offer **aggregate inventory CSV** (product IDs and counts); do not export raw keys. Admin bulk imports must be bounded, non-echoing and CSRF protected.
- Financial dashboard figures must be labeled as **recorded order totals**, not bank balances or audited net revenue.
