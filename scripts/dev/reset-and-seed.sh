#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

COMPOSE=(docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml)

: "${COMPANY_NAME:=Haulio Demo Logistics}"
: "${ADMIN_EMAIL:=admin@demo.test}"
: "${ADMIN_PASSWORD:=demo1234}"
: "${ADMIN_NAME:=Admin}"
: "${RESET_UPLOADS:=false}"

: "${ORG_NAME:=$COMPANY_NAME}"
: "${TARGET_TRUCKS:=10}"
: "${TARGET_TRAILERS:=10}"
: "${TARGET_LOADS:=10}"
: "${TARGET_DRIVERS:=15}"
: "${TARGET_DISPATCHERS:=10}"
: "${SEED_PASSWORD:=$ADMIN_PASSWORD}"

echo "[prod-local] Ensuring containers are running..."
pnpm prod:local

echo "[prod-local] Applying schema (migrate deploy)..."
if ! "${COMPOSE[@]}" run --rm api pnpm --filter @truckerio/db exec prisma migrate deploy; then
  echo "[prod-local] migrate deploy failed; falling back to schema reset + db push"
  "${COMPOSE[@]}" exec postgres psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-haulio}" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE EXTENSION IF NOT EXISTS citext;"
  "${COMPOSE[@]}" run --rm api pnpm --filter @truckerio/db exec prisma db push
fi

echo "[prod-local] Resetting company/org data..."
"${COMPOSE[@]}" run --rm \
  -e COMPANY_NAME="$COMPANY_NAME" \
  -e ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e ADMIN_NAME="$ADMIN_NAME" \
  -e RESET_UPLOADS="$RESET_UPLOADS" \
  api pnpm --filter @truckerio/api exec tsx scripts/company-reset.ts

echo "[prod-local] Seeding fleet, loads, drivers, dispatchers..."
"${COMPOSE[@]}" run --rm \
  -e ORG_NAME="$ORG_NAME" \
  -e TARGET_TRUCKS="$TARGET_TRUCKS" \
  -e TARGET_TRAILERS="$TARGET_TRAILERS" \
  -e TARGET_LOADS="$TARGET_LOADS" \
  -e TARGET_DRIVERS="$TARGET_DRIVERS" \
  -e TARGET_DISPATCHERS="$TARGET_DISPATCHERS" \
  -e SEED_PASSWORD="$SEED_PASSWORD" \
  api pnpm --filter @truckerio/api exec tsx scripts/seed-org-data.ts

echo
echo "[prod-local] Done."
echo "Web: http://localhost:3000"
echo "API: http://localhost:4000"
echo "Admin: $ADMIN_EMAIL"
echo "Password: $ADMIN_PASSWORD"
