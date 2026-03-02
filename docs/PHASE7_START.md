# Phase 7 START (Finance Command Layer)

Date: March 2, 2026

## Goal
Start Phase 7 by adding an action-first finance command layer on top of existing receivables/bulk APIs, without rewriting billing or settlement workflows.

## Implemented
- `/finance` now includes a `Commands` tab.
- New panel: `FinanceCommandPanel`
  - lane-based queues powered by `GET /finance/receivables?limit=200`
  - lanes:
    - `Invoice now` (`GENERATE_INVOICE`)
    - `Retry QBO sync` (`RETRY_QBO_SYNC`)
    - `Collections follow-up` (`FOLLOW_UP_COLLECTION`)
    - `Settlement handoff` (`GENERATE_SETTLEMENT`)
  - bulk preview/execute reusing existing endpoints:
    - `POST /finance/receivables/bulk/generate-invoices`
    - `POST /finance/receivables/bulk/qbo-sync`
    - `POST /finance/receivables/bulk/send-reminders`
  - capability gates:
    - read access via `canAccessFinance`
    - mutation access via `canBillActions`
  - fail-closed behavior on 403 mutation responses with restricted indicator.

## Validation Commands
```bash
pnpm --filter @truckerio/api run test:finance
pnpm --filter @truckerio/api exec tsc -p tsconfig.json --noEmit
pnpm --filter @truckerio/web run test:finance
pnpm --filter @truckerio/web run typecheck
pnpm ci:phase7
```
