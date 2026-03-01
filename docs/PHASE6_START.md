# Phase 6 START (Finance Observability)

Date: March 1, 2026

## Goal
Start Phase 6 with read-only finance observability surfaces, without changing dispatch/billing execution workflows.

## Implemented
- New read-only API route:
  - `GET /finance/journals`
  - Guard: `requireCapability("viewSettlementPreview", "runSettlements")`
  - Strict org scoping
  - Optional filters: `entityType`, `eventType`, `entityId`, `limit`
  - Returns immutable journal headers + lines + idempotency keys

## Validation
```bash
pnpm --filter @truckerio/api run test:finance
pnpm --filter @truckerio/api exec tsc -p tsconfig.json --noEmit
```
