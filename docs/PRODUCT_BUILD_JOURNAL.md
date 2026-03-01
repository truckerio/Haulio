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
