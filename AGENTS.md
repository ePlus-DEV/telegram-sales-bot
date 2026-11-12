# AI and contributor instructions

## Purpose
Build a small, secure, source-available Telegram shop for Cloudflare Workers + D1.

## Non-negotiable requirements
1. No credentials, Telegram token, bank account details, webhook secrets, or customer inventory in commits, issues, build logs, or test snapshots.
2. Digital goods and services sold inside Telegram use Telegram Stars (XTR), not SePay/VietQR/payOS. Bank transfer is for physical goods/services only; follow current Telegram policy.
3. All payment settlements are validated server-side and idempotent. Each Telegram Buy callback ID maps to exactly one order; never allow two distinct Stars pre-checkout approvals for the same order. Treat webhooks as untrusted before authenticating.
4. Keep DB schema migrations forward-only, with corresponding tests. Never erase production orders.
5. Keep zero-always-on free deployment possible via Cloudflare Workers + D1. For Vercel/Railway/Render/Koyeb use durable external Turso/libSQL, never ephemeral local SQLite for payment or inventory storage. Avoid mandatory VPS, Redis or paid dependencies.
6. Do not edit marketing/SEO/public copy unrelated to the assigned task.
7. Work on a feature branch, open a PR to main, run `npm run check && npm test`; never auto-merge without explicit instruction.
8. Do not modify production or set up live payment credentials for users without their explicit access.
9. For every added gateway: verify event signatures/auth, account, amount, reference, currency and replay handling; add negative tests.
10. No fraud, counterfeit accounts, resale of unauthorized credentials, or bypassing payment-provider terms.

## Development
Node.js 24 preferred. Run `npm run check`, `npm test` and validate the Docker build when changing runtimes. Keep Telegram/SePay webhook paths stable across all platforms. Keep changes small, readable, and bilingual-friendly. Document any unimplemented production requirement explicitly.
