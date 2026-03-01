# Phase 5 PASS (Finance Foundation)

Date: March 1, 2026

## Scope Locked
- Immutable payout journals for payable and settlement paid transitions.
- Wallet materialization (`FinanceWalletBalance`, `FinanceWalletSnapshot`) with idempotent write-through.
- Unified hold policy enforcement for finalize and paid transitions.
- Finance mutation audit coverage for payable + settlement finance actions.
- End-to-end payout -> journal -> wallet idempotency smoke.

## Required Commands
```bash
pnpm --filter @truckerio/api run test:finance
pnpm --filter @truckerio/api exec tsc -p tsconfig.json --noEmit
DATABASE_URL=<DATABASE_URL> API_BASE=<API_BASE> pnpm demo:smoke:phase5
pnpm ci:phase5
```

## Expected Outcome
- Finance tests pass.
- API typecheck passes.
- `demo:smoke:phase5` prints `smoke-phase5-finance-chain: PASS`.
- `ci:phase5` is green.
