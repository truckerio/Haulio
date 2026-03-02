# Product Build Journal

## 2026-01-25
- Removed Yard Storage from Ops OS UI and routing. Feature is reserved for Yard OS.
- Decision: Yard Storage belongs to Yard OS (YMS), not Ops OS.
  - Prevent reintroduction of storage UI or yard inventory workflows in Ops OS.
  - Keep schema fields for backward compatibility only.
  - Maintain integration via minimal signals (e.g., trailer availability), not a Storage UI.

## 2026-01-25 (Planned)
- Phase 5: Finance Foundation (planned next).
  - Why: close the loop from delivery → invoice → settlement → payout with auditability.
  - Non-goals: no real ACH, no factoring partner, no card issuing, no ML.
  - Done means: ledger + wallets + holds + payouts + idempotency + audit log, then freeze.

## 2026-02-28
- Phase 5 start: settlement finance-state idempotency hardening.
  - Added explicit settlement transition guards for finalize/paid paths.
  - Added idempotent response behavior for repeated finalize/paid requests.
  - Added pure transition tests under `apps/api/src/lib/settlement-state.test.ts`.
  - Added mock banking adapter payout receipts with idempotency key support on paid transitions.
  - Added immutable double-entry journal builders for payout transitions (`finance-ledger`).
  - Added persistent finance journal store and route wiring for paid mutations (`finance-ledger-store`).
  - Added finance journal schema migration for immutable entry/line persistence.
  - Added read-only finance wallet balances endpoint backed by journal lines (`GET /finance/wallets`).
  - Added wallet write-through tables and materialization helper for paid transitions.
  - Added unified finance hold-policy checks with blocked transition audit events for payable/settlement.
  - Added Phase 5 smoke script covering payout -> journal -> wallet chain with idempotency checks.

## 2026-03-01
- Phase 5 lock hardening:
  - Added payable lifecycle audit actions for finance mutations:
    - `PAYABLE_RUN_CREATED`
    - `PAYABLE_RUN_PREVIEWED`
    - `PAYABLE_RUN_HOLD_APPLIED`
    - `PAYABLE_RUN_HOLD_RELEASED`
    - `PAYABLE_RUN_FINALIZED`
  - Added finance mutation audit contract test to prevent drift (`finance-mutation-audit-contract.test.ts`).
  - Added repeatable Phase 5 gate command: `pnpm ci:phase5`.

- Phase 6 start (observability-first, read-only):
  - Added `GET /finance/journals` with capability guard and org scoping.
  - Added `/finance` Journals tab and read-only journal stream panel with filters.
  - Added journal drilldown drawer with line-level details, metadata preview, and anomaly explanations.
  - Added CSV export for filtered journal stream.
  - Added `/finance` summary rail with wallet snapshot, latest payouts, and journal health flags.
  - Added immutable journal history contract test (`finance-journal-contract.test.ts`).
  - Added web finance journals contract test (`app/finance/finance-journals-contract.test.ts`).
  - Added web finance summary rail contract test (`app/finance/finance-summary-rail-contract.test.ts`).
  - Added phase gate command `pnpm ci:phase6` and `docs/PHASE6_PASS.md`.
  - Added `docs/PHASE6_START.md`.

## 2026-03-02
- Phase 9 start + pass: finance spreadsheet UX principles hardening.
  - Added sortable columns to finance spreadsheet for faster triage scans.
  - Added in-surface summary chips (blocked, ready, amount) and refresh recency signal.
  - Improved table scan hierarchy with sticky stage context and clearer row rhythm.
  - Added Phase 9 finance UX contract test and phase scripts:
    - `demo:smoke:phase9`
    - `ci:phase9`
  - Added docs:
    - `docs/PHASE9_START.md`
    - `docs/PHASE9_PASS.md`
