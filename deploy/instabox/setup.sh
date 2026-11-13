#!/usr/bin/env bash
# InstaBox create --setup-file deploy/instabox/setup.sh
# Provisions source/build ONLY. Does not accept secrets, expose ports, register
# Telegram webhooks, migrate databases, or enable live payments.
set -Eeuo pipefail
umask 077

REPO_URL="https://github.com/ePlus-DEV/telegram-sales-bot.git"
BRANCH="${BOT_GIT_REF:-main}"
WORKDIR="/data/home/telegram-sales-bot"

if [[ ! "${BRANCH}" =~ ^[a-zA-Z0-9._/-]+$ ]]; then
  echo "Invalid git ref" >&2
  exit 2
fi

command -v git >/dev/null || { echo "Git is required" >&2; exit 1; }
command -v docker >/dev/null || { echo "Docker is required (select agent-browser/ci template)" >&2; exit 1; }
docker compose version >/dev/null || { echo "Docker Compose plugin is required" >&2; exit 1; }

mkdir -p /data/home
if [[ -e "${WORKDIR}" ]]; then
  echo "Directory already exists: ${WORKDIR}. Review manually; refusing overwrite." >&2
  exit 1
fi
git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${WORKDIR}"
cd "${WORKDIR}/deploy/instabox"
if [[ ! -f app.env.example ]]; then
  echo "This branch does not contain deploy/instabox assets; merge PR first or choose a branch with the files." >&2
  exit 1
fi
cp app.env.example app.env
chmod 600 app.env

# Source-only image build; it does not have access to secrets.
docker compose config --quiet
docker compose build

echo "InstaBox setup complete. Nothing listening or published."
echo "Next: instabox ssh <machine>, edit /data/home/telegram-sales-bot/deploy/instabox/app.env"
echo "Then run: cd /data/home/telegram-sales-bot/deploy/instabox && bash run.sh --init-db"
echo "The --init-db option is ONLY for a new empty test Turso database."
