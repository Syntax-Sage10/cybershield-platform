#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export AGENT_TOKEN="$(grep '^AGENT_TOKEN=' .env | cut -d= -f2-)"
exec agent/.venv/bin/python agent/agent.py "$@"
