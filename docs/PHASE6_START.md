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
- Finance cockpit surface:
  - Added `Journals` tab on `/finance`
  - New read-only `FinanceJournalsPanel` wired to `/finance/journals`
  - Capability-gated and fail-closed on 403 with `Restricted` label
  - Added journal drilldown drawer for selected entries
  - Drilldown includes line-level details, metadata preview, and anomaly explanations
- Finance summary rail:
  - Added read-only `FinanceSummaryRail` on `/finance` across tabs
  - Shows wallet snapshot (`/finance/wallets`)
  - Shows latest payout events (`/finance/journals`)
  - Computes journal anomaly flags (unbalanced totals, incomplete line sets, duplicate idempotency keys)
  - Capability-gated and fail-closed on 403

## Validation
```bash
pnpm --filter @truckerio/api run test:finance
pnpm --filter @truckerio/api exec tsc -p tsconfig.json --noEmit
pnpm --filter @truckerio/web run test:finance
pnpm --filter @truckerio/web run typecheck
```
