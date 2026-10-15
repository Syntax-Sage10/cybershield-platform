#!/usr/bin/env bash
# One-shot setup: secrets -> containers -> agent venv -> frontend deps.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  gen() { python3 -c 'import secrets; print(secrets.token_urlsafe(32))'; }
  printf 'POSTGRES_PASSWORD=%s\nAGENT_TOKEN=%s\n' "$(gen)" "$(gen)" > .env
  chmod 600 .env
  echo "Created .env with fresh random secrets."
fi

docker compose up -d --build

python3 -m venv agent/.venv
agent/.venv/bin/pip install --quiet --upgrade pip
agent/.venv/bin/pip install --quiet -r agent/requirements.txt

( cd frontend && npm install )

cat <<MSG

Setup complete.
  1. Agent:     scripts/run-agent.sh --fim-root ~/some/dir      (sudo -E for SYN scans)
  2. Dashboard: cd frontend && npm run dev   ->  http://localhost:3000
MSG
