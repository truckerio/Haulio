# Product Scope

## Ops OS Scope (In scope)
- Loads lifecycle and Open Load
- Dispatch
- Task Inbox and Today
- Billing and Settlements
- Driver portal for tracking, POD upload, and status updates
- Admin and Audit

## Out of Scope (Ops OS)
### Yard Storage / Yard Management (YMS)
- Trailer yard storage, slotting, and yard inventory are **out of scope** for Ops OS.
- Yard Storage belongs to Yard OS and must not be reintroduced in Ops OS UI.
- Any yard signals should integrate only via minimal status (e.g., trailer availability), not a Storage UI.

### Backward-compatibility note
Some storage-related schema fields remain in Ops OS for compatibility (e.g., `OrgSettings.freeStorageMinutes`, `OrgSettings.storageRatePerDay`). These are retained for Yard OS use and should not be expanded in Ops OS.

## Planned next phase
Phase 5 is planned as **Finance Foundation**. See `docs/finance-phase-scope.md` for constraints and non-goals.
