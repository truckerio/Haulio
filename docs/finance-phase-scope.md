# Phase 5 — Finance Foundation (Planned)

This phase integrates **Finance** into existing Ops OS flows. It is not a new product or app.

## Goals
- Add a minimal finance backbone that supports invoicing → settlements → payouts.
- Provide auditability, idempotency, and tenant isolation from day one.

## Non-goals (explicitly out of scope)
- Real ACH, banking, or money transmission
- Factoring partner integrations
- Card issuing
- ML/forecasting/analytics products
- New standalone Finance app or product name

## Must-have components
- **Double-entry ledger** (immutable journal entries)
- **Wallets** (org-level and counterparty balances)
- **Holds** and **payouts**
- **Idempotency** for all money-moving operations
- **Audit log** for all finance actions
- **Mock adapter** (`FINANCE_BANKING_ADAPTER=mock`) as the only adapter in Phase 5

## Lifecycle integration (required)
Delivered + POD approved → Ready to invoice → Invoice issued → Settlement finalized → Payout → Mark paid

## Architecture constraints
- Finance must integrate into **existing Ops OS** flows and routes.
- All finance writes must be **transactional** and **org-scoped**.
- All ledger entries must be **immutable**; corrections use reversal entries.

## Security & RBAC
- Strict org scoping for every query and write.
- Role-based access enforced on all finance endpoints and UI surfaces.

## Testing requirements
- Ledger correctness (double-entry invariants)
- Idempotency for every mutation
- Multi-tenant isolation
- Auth/RBAC coverage for finance actions

## Definition of done
- Finance foundation is implemented, audited, and frozen.
- No additional finance features are added in Phase 5 beyond the scope above.
