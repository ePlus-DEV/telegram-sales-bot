# Contributing

Thanks for helping with ePlus Telegram Sales Bot.

1. Open an issue for larger changes, especially payment or data-model changes.
2. Fork or create a feature branch from the latest `main`.
3. Run `npm run check`, `npm test`, and `npm run docs:check`.
4. Add positive and negative tests for payment logic, replay protection, inventory, and access control.
5. Open a PR with scope, test evidence, backward-compatibility notes and any migrations.
6. Do not include credentials, production personal data, raw payment payloads, or plaintext customer keys.

See [AGENTS.md](AGENTS.md) for mandatory payment/platform compliance.

## Documentation contributions

Keep the top-level [README](README.md) brief and link to focused guides under [docs/](docs/README.md). Update [ROADMAP.md](ROADMAP.md) with accurate statuses and unresolved release gates; do not label an untested payment integration production-ready. Check all local Markdown links with `npm run docs:check` and include migration/hosting impacts in your PR description.

For deployment or payment changes, run `npm run staging:check-migrations` and read [staging validation](docs/STAGING_VALIDATION.md). The manual staging workflow is not a substitute for real provider E2E verification, and PRs must not configure production secrets.
