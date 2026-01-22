#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

compose_cmd=""
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    if docker compose version >/dev/null 2>&1; then
      compose_cmd="docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
      compose_cmd="docker-compose"
    fi
  fi
fi

if [ -n "$compose_cmd" ]; then
  echo "Stopping Postgres (docker-compose)..."
  $compose_cmd -f "$ROOT_DIR/docker-compose.yml" down
else
  echo "Docker not available. Stop Postgres manually if needed."
fi

if [ "${1:-}" = "--clean" ]; then
  echo "Resetting demo org data..."
  pnpm --filter @truckerio/api exec tsx scripts/demo-reset.ts
fi

echo "If API/Worker/Web are running in this terminal, stop them with Ctrl+C."
