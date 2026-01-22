#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.demo"
if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE="$ROOT_DIR/.env"
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing .env.demo or .env. Copy .env.example to .env.demo and edit values."
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

missing=()
for var in DATABASE_URL WEB_ORIGIN NEXT_PUBLIC_API_BASE UPLOAD_DIR; do
  if [ -z "${!var:-}" ]; then
    missing+=("$var")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing required env vars: ${missing[*]}"
  exit 1
fi

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
  echo "Starting Postgres (docker-compose)..."
  $compose_cmd -f "$ROOT_DIR/docker-compose.yml" up -d postgres
else
  echo "Docker not available. Start Postgres manually and ensure DATABASE_URL is reachable."
  echo "Example: postgres://postgres:postgres@localhost:5432/truckerio"
fi

echo "Applying migrations..."
if ! pnpm --filter @truckerio/db exec prisma migrate deploy; then
  echo "Migration failed."
  echo "If you are on demo/dev, run: docker compose down -v then pnpm demo:up"
  exit 1
fi

echo "Generating Prisma client..."
pnpm --filter @truckerio/db exec prisma generate

echo "Starting API + Worker + Web..."
pnpm dev
