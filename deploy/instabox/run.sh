#!/usr/bin/env bash
# Run inside the InstaBox machine after manually entering TEST secrets.
# Usage: bash run.sh [--init-db]
# --init-db is an explicit write to the Turso database; don't rerun on real data.
set -Eeuo pipefail
cd "$(dirname "$0")"
umask 077

if [[ $# -gt 1 || ( $# -eq 1 && "${1}" != "--init-db" ) ]]; then
  echo "Usage: bash run.sh [--init-db]" >&2
  exit 2
fi

if [[ ! -f app.env ]]; then
  echo "Create app.env from app.env.example; use a TEST bot and TEST Turso database." >&2
  exit 1
fi

# The app and environment must live on the persistent /data mount.
if [[ "$(pwd -P)" != /data/* ]]; then
  echo "InstaBox state must be located on persistent /data, not ephemeral root filesystem." >&2
  exit 1
fi

docker compose config --quiet
docker compose build
# Fail closed on missing credentials/invalid formats, with variable names only.
docker compose run --rm --no-deps bot node scripts/staging/preflight.mjs --provider=turso

if [[ "${1:-}" == "--init-db" ]]; then
  echo "Applying migrations to selected TEST Turso database; do not run on existing orders."
  docker compose run --rm --no-deps bot node scripts/migrate-turso.mjs
fi

docker compose up -d
# Basic local HTTP readiness. Database/TG/provider E2E must be tested separately.
curl --fail --silent --show-error --retry 5 --retry-delay 2 http://127.0.0.1:3000/healthz
printf '\nBot HTTP started locally on port 3000.\n'
echo "Run on YOUR computer: instabox port publish <machine> 3000 --public"
echo "Use the printed HTTPS URL; never guess it or register real bot webhooks here."
