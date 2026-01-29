# Driver Ops — Proposed Final (5‑Year Mature)

This proposal defines a stable, driver‑first operating surface that scales from solo to 300+ drivers without overlapping Dispatch or Finance responsibilities.

---

## Page List (Driver Ops)

1) **Driver Home** (`/driver`)
   - Current load summary + next action
   - Immediate blockers (POD rejected, tracking off, compliance issue)
   - Quick actions: Arrive, Depart, Upload POD, Start/Stop Tracking
   - Pay snapshot + pending settlements

2) **Driver Load View** (within `/driver`, load detail panel)
   - Stop timeline + appointment windows
   - Next step CTA with clear reason
   - Recovery flows (missed stop, late arrival, doc rejected)

3) **Driver Docs & Compliance** (panel within `/driver`)
   - Required driver docs (CDL, Med Card, etc.)
   - Status badges: OK / Expiring / Expired
   - Upload with explicit “blocked” messaging if required

4) **Driver Settlements** (`/driver/settlements`)
   - Read‑only settlement list
   - Status: Draft / Finalized / Paid
   - Future finance links (Phase 5) for payout details

5) **Driver Profile (Read‑only)**
   - Contact, license expiry, pay rate, assigned truck/trailer
   - No editing (admin/ops only)

---

## Responsibilities per Page

### Driver Home
- **Purpose:** “What do I do next?”
- **Primary actions:** Arrive/Depart, Upload POD, Start Tracking
- **Secondary actions:** Send note, Call dispatcher
- **Blocking messages:** POD rejected, missing required doc, tracking off

### Driver Load View
- **Purpose:** step-by-step workflow with explicit stop windows
- **Signals:** late risk, missed appointment, delay reason prompt
- **Error recovery:** allow correction/undo with explicit audit trail

### Driver Docs & Compliance
- **Purpose:** prevent driver compliance from becoming an ops-only blind spot
- **Signals to ops:** compliance expiring triggers Task Inbox; driver sees same warning

### Driver Settlements
- **Purpose:** transparency of pay status without finance controls
- **Read-only:** driver cannot change or dispute in Phase 4

---

## Explicit Boundaries

### What Driver Ops **does**
- Stop updates and POD/doc uploads
- Phone-based tracking on assigned loads
- Driver-visible compliance requirements
- Read-only settlement visibility

### What Driver Ops **does not**
- Dispatch assignments or routing decisions
- Billing/POD verification
- Invoice generation
- Settlement generation or payout execution

---

## Driver State Model (Explicit)

**States (driver-level):**
- `OFF_DUTY` (manual)
- `AVAILABLE` (manual)
- `ASSIGNED` (system: driver assigned to active load)
- `EN_ROUTE` (system: after first depart)
- `AT_STOP` (system: after arrive)
- `DELAYED` (manual: delay reason provided)
- `DELIVERED` (system: final stop arrived)
- `POD_PENDING` (system: delivered but POD missing)
- `DOC_REJECTED` (system: POD/doc rejected)
- `WAITING_PAY` (system: settlement draft/finalized)
- `PAID` (system: settlement paid)

**Manual vs system-driven:**
- Manual: OFF_DUTY/AVAILABLE/DELAYED reason
- System: ASSIGNED/EN_ROUTE/AT_STOP/DELIVERED/POD_PENDING/DOC_REJECTED/WAITING_PAY/PAID

---

## Driver Home — Priority Order

1) **Next Action** (single CTA)
2) **Blocking message** (if any)
3) **Current load summary**
4) **Tracking status**
5) **Pay preview + settlements**
6) **Docs/compliance warnings**

---

## Driver Load View — Next Action Rules

- If next stop not arrived → **Arrive**
- If arrived (pickup/yard) and not departed → **Depart**
- If delivered and POD missing → **Upload POD**
- If POD rejected → **Re‑upload POD**
- If tracking off while in transit → **Enable tracking**

---

## Driver Compliance & Docs

- **Required driver docs** shown with due dates and status
- **Expiring soon** shows warning (same as Task Inbox)
- **Expired** shows blocking banner (driver cannot mark stops without acknowledging)
- **Feeds Tasks:** `DRIVER_COMPLIANCE_EXPIRING` tasks still created

---

## Driver Settlements & Pay

- **Read‑only** in Phase 4
- Show gross/deductions/net and status
- **Future Finance link** placeholder for Phase 5 payouts (no actual payout UI)

---

## Signals to Ops

Driver Ops emits signals to:
- **Dispatch:** tracking status, stop events, delay reason
- **Task Inbox:** compliance expiring, missing POD, doc rejected
- **Today:** drivers needing action (POD pending, tracking off, compliance expiring)

---

## What NOT to Include (explicit)
- Dispatch assignment UI
- Billing or doc verification actions
- Settlement generation
- Any finance payouts (Phase 5 only)

