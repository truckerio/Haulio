#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5433/haulio}"
export ORG_NAME="${ORG_NAME:-Wrath Logistics}"
export TARGET_TRUCKS="${TARGET_TRUCKS:-10}"
export TARGET_TRAILERS="${TARGET_TRAILERS:-10}"
export TARGET_DRIVERS="${TARGET_DRIVERS:-15}"
export TARGET_LOADS="${TARGET_LOADS:-10}"
export TARGET_DISPATCHERS="${TARGET_DISPATCHERS:-10}"
export SEED_PASSWORD="${SEED_PASSWORD:-password123}"

echo "[1/4] Seeding baseline org fleet/users/loads for ${ORG_NAME}..."
pnpm --filter @truckerio/api exec node --import tsx scripts/seed-org-data.ts

echo "[2/4] Seeding LTL manifest consolidation examples..."
pnpm --filter @truckerio/api exec node --import tsx scripts/seed-ltl-examples.ts

echo "[3/4] Seeding FTL + Pool Distribution trip examples and notes..."
pnpm --filter @truckerio/api exec node --import tsx scripts/seed-movement-mode-examples.ts

if [[ "${RUN_TRIP_VERIFY:-false}" == "true" ]]; then
  echo "[4/4] Verifying trip assignment flow on demo loads..."
  TEST_TRIP_NUMBER="EX-TRIP-VERIFY-LTL" TEST_LOAD_NUMBERS="EX-LTL-A1,EX-LTL-A2" \
    pnpm --filter @truckerio/api exec node --import tsx scripts/trip-e2e-check.ts
else
  echo "[4/4] Skipping trip-e2e verification (set RUN_TRIP_VERIFY=true to enable)."
fi

echo "Demo new-feature data seed complete."
