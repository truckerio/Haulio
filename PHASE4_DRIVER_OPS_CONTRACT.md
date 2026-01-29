# Phase 4 — Driver Ops Contract (Freeze Target)

## What Phase 4 WILL include
- Driver Home with a single, explicit **Next Action**
- Driver stop workflow (arrive/depart) with clear confirmation
- POD/doc upload with status and retry/offline queue
- Tracking start/stop/ping with clear status
- Compliance warnings surfaced to driver (expiring/expired docs)
- Read‑only settlements view for drivers
- Signals to Ops: tasks + Today “drivers needing action”

## What Phase 4 WILL NOT include
- Dispatch assignment, planning, or load routing
- Billing / doc verification / invoicing
- Settlement generation or payout controls
- New driver scheduling engine (HOS/PTO)
- New standalone “Driver Ops” product or app

## Acceptance Criteria (must pass)

### A) Clarity
- Driver always sees **current load** or a “No load assigned” state
- Driver always sees **one next action** with reason
- If blocked (POD missing, doc rejected, compliance expired), it is explicit

### B) State integrity
- Driver actions map to stop states (arrive/depart) and do not bypass
- Undo action available only within configured window

### C) Compliance visibility
- Required driver docs shown with status (OK/Expiring/Expired)
- Driver sees the same expiring warning that creates the compliance task

### D) Tracking
- Driver can start/stop tracking for assigned loads
- Last ping time is visible
- Tracking only allowed when assigned to the load

### E) Settlements
- Driver can view own settlements only
- No mutation endpoints exposed to driver

### F) Ops signals
- Driver events create audit log/events
- Tasks created for compliance and POD gaps

### G) RBAC
- Driver endpoints require role DRIVER
- Driver access to load/tracking restricted to assigned loads

## Audit Checklist (PASS/FAIL)
- [ ] Driver home shows current load and next action
- [ ] Arrive/Depart actions are confirmed and logged
- [ ] POD/doc upload works and status updates
- [ ] Compliance warnings visible in driver UI
- [ ] Tracking start/stop/ping works for assigned loads
- [ ] Driver settlements list filters work and are read-only
- [ ] Driver cannot access non‑assigned loads
- [ ] Task Inbox receives compliance/POD tasks

---

Phase 4 is considered **DONE** only when all acceptance criteria pass and the audit checklist is fully green.
