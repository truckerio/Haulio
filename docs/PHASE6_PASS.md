# Phase 6 PASS (Finance Observability)

Date: March 1, 2026

## Scope Locked
- Read-only journals API (`GET /finance/journals`) with capability guard and org scoping.
- `/finance` journals tab with:
  - filter controls (`entityType`, `eventType`, `entityId`, `limit`)
  - stream list + drilldown drawer
  - line-level details + metadata preview
  - deterministic anomaly explanations
  - CSV export for current filtered stream.
- `/finance` summary rail with:
  - wallet snapshot
  - latest payout events
  - journal health flags.
- Capability-first + fail-closed behavior on finance observability surfaces.

## Required Commands
```bash
pnpm --filter @truckerio/api run test:finance
pnpm --filter @truckerio/api exec tsc -p tsconfig.json --noEmit
pnpm --filter @truckerio/web run test:finance
pnpm --filter @truckerio/web run typecheck
pnpm ci:phase6
```

## Manual Verification
```bash
# bring latest services
docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml up -d --build api web

# open finance cockpit
http://localhost:3000/finance?tab=journals
```

Expected:
- Journals tab renders stream entries.
- Selecting an entry opens drilldown with anomaly section and metadata preview.
- `Export CSV` downloads current filtered journal stream.
- Summary rail is visible above finance tabs and refreshes wallet + journal signals.
