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
