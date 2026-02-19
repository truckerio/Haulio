#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but not installed." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required but not installed. Run: corepack enable && corepack prepare pnpm@9.0.0 --activate" >&2
  exit 1
fi

if [ ! -f .env.prod.local ]; then
  cp .env.prod.local.example .env.prod.local
  echo "[prod-local] Created .env.prod.local from template. Fill secrets before sharing outside local dev."
fi

echo "[prod-local] Installing dependencies..."
pnpm install

echo "[prod-local] Starting containers and initializing devkit data..."
"$ROOT_DIR/scripts/dev/reset-and-seed.sh"
