# Phase 7 PASS (Finance Command Layer)

Date: March 2, 2026

## Scope Locked
- Added finance command queue surface under `/finance?tab=commands`.
- Reused existing bulk mutation endpoints for invoice/QBO/reminder command execution.
- Kept settlement command as handoff lane to existing payables workflow (no workflow rewrite).
- Preserved capability-first and fail-closed behavior on command mutations.
- Added command contract test coverage to finance web test suite.

## Required Commands
```bash
pnpm --filter @truckerio/api run test:finance
pnpm --filter @truckerio/api exec tsc -p tsconfig.json --noEmit
pnpm --filter @truckerio/web run test:finance
pnpm --filter @truckerio/web run typecheck
pnpm ci:phase7
```

## Expected Outcome
- Finance API suite remains green.
- Web finance contract suite includes command panel checks and passes.
- `ci:phase7` is green.
