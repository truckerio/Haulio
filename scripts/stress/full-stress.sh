#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ORG_ID="${ORG_ID:-}"
DATABASE_URL="${DATABASE_URL:-}"
API_BASE="${API_BASE:-http://127.0.0.1:4000}"
SMOKE_CYCLES="${SMOKE_CYCLES:-3}"
HEALTH_BURST_REQUESTS="${HEALTH_BURST_REQUESTS:-2000}"
HEALTH_BURST_PARALLEL="${HEALTH_BURST_PARALLEL:-50}"

if [[ -z "$ORG_ID" ]]; then
  echo "Missing ORG_ID. Example: ORG_ID='cmluiq46j0000c8vh3s1fzz5p'" >&2
  exit 1
fi

if [[ -z "$DATABASE_URL" ]]; then
  echo "Missing DATABASE_URL. Example: DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5433/haulio'" >&2
  exit 1
fi

mkdir -p /tmp/haulio-stress
LOG_FILE="${STRESS_LOG_FILE:-/tmp/haulio-stress/stress-$(date +%Y%m%d-%H%M%S).log}"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=== HAULIO FULL STRESS START $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "ROOT_DIR=$ROOT_DIR"
echo "ORG_ID=$ORG_ID"
echo "API_BASE=$API_BASE"
echo "SMOKE_CYCLES=$SMOKE_CYCLES"

echo "-- health wait --"
for i in {1..60}; do
  if curl -fsS "$API_BASE/health" >/dev/null; then
    echo "health ok on attempt $i"
    break
  fi
  sleep 1
  if [[ "$i" -eq 60 ]]; then
    echo "health check failed after 60 attempts" >&2
    exit 1
  fi
done

echo "-- prisma migrate status --"
DATABASE_URL="$DATABASE_URL" pnpm --filter @truckerio/db exec prisma migrate status

echo "-- baseline gates --"
DATABASE_URL="$DATABASE_URL" API_BASE="$API_BASE" pnpm ci:godlevel:complete
ORG_ID="$ORG_ID" DATABASE_URL="$DATABASE_URL" API_BASE="$API_BASE" pnpm ci:kernel:phasee

echo "-- repeated stress cycles --"
for cycle in $(seq 1 "$SMOKE_CYCLES"); do
  echo "cycle=$cycle demo:smoke"
  DATABASE_URL="$DATABASE_URL" API_BASE="$API_BASE" pnpm demo:smoke

  echo "cycle=$cycle demo:smoke:phase2"
  DATABASE_URL="$DATABASE_URL" API_BASE="$API_BASE" pnpm demo:smoke:phase2

  echo "cycle=$cycle demo:smoke:phase3"
  DATABASE_URL="$DATABASE_URL" API_BASE="$API_BASE" pnpm demo:smoke:phase3

  echo "cycle=$cycle demo:smoke:phase5"
  DATABASE_URL="$DATABASE_URL" API_BASE="$API_BASE" pnpm demo:smoke:phase5

  echo "cycle=$cycle demo:smoke:roles"
  DATABASE_URL="$DATABASE_URL" API_BASE="$API_BASE" pnpm demo:smoke:roles

  echo "cycle=$cycle demo:smoke:enforce"
  ORG_ID="$ORG_ID" DATABASE_URL="$DATABASE_URL" API_BASE="$API_BASE" pnpm demo:smoke:enforce

  echo "cycle=$cycle ci:drift"
  pnpm ci:drift
done

echo "-- concurrent health burst --"
seq 1 "$HEALTH_BURST_REQUESTS" | xargs -n1 -P"$HEALTH_BURST_PARALLEL" -I{} sh -lc 'curl -fsS "$0/health" >/dev/null' "$API_BASE"

echo "-- post-stress kernel report --"
ORG_ID="$ORG_ID" DATABASE_URL="$DATABASE_URL" pnpm demo:kernel:report

echo "=== HAULIO FULL STRESS PASS $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "LOG_FILE=$LOG_FILE"
