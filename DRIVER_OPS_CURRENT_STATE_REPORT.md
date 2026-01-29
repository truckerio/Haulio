# Driver Ops — Current State Report

Date: 2026-01-25

## Routes & UI Surfaces

### Driver portal routes (apps/web)
- `/driver` — Driver home / current load workflow. File: `apps/web/app/driver/page.tsx`
  - Current load summary (load number, customer, status)
  - Next step CTA derived from stop state (arrive/depart/upload POD)
  - Trip tracking controls (start/stop/ping) + last ping
  - Document checklist + upload (POD and other required docs)
  - Offline upload queue (local IndexedDB via `apps/web/lib/offlineQueue.ts`)
  - Optional driver note submission
  - Pay summary (estimated weekly) + pending settlements preview
  - Navigation actions: Google Maps directions, call dispatcher
- `/driver/settlements` — Driver settlements view. File: `apps/web/app/driver/settlements/page.tsx`
  - Filters by status (Pending/Paid/All) + date ranges (this/last/last 4 weeks)
  - Lists settlements (read-only)

### Driver-related surfaces in Ops UI
- Admin drivers management: `apps/web/app/admin/page.tsx`
  - Create driver login, set pay rate, license/med card expiry
  - Required driver docs list
  - Driver list overview
- Dispatch assignment panels: `apps/web/app/dispatch/legs-panel.tsx`, `apps/web/app/dispatch/page.tsx`
  - Assign driver/truck/trailer for loads and legs
- Load detail & loads list surfaces show driver assignments and tracking state
  - `apps/web/app/loads/page.tsx`, `apps/web/app/loads/[id]/page.tsx`

## Key UI Screens (Driver Portal)

### `/driver` (Driver Home)
- **Current Load** card: load number, customer, status
- **Pay** card: estimated pay + pending settlements
- **Next Step** card: arrive/depart/Upload POD/Waiting/Done
- **Trip Tracking**: start/stop phone tracking + send ping
- **Stop Info**: next stop + navigation + call dispatcher
- **Document Checklist**: required docs from settings, per-doc upload
- **Optional Note**: driver note to dispatch
- **Offline Queue**: queued uploads retry

### `/driver/settlements`
- List of settlements (pending/paid)
- Date range filters and totals summary

## API Endpoints (Driver-facing + Driver state)

### Driver endpoints (role: DRIVER)
- `GET /driver/current` — returns current assigned load (stops, docs, driver, customer)
- `GET /driver/settings` — requiredDocs + driver doc requirements + POD reminder config
- `GET /driver/earnings` — miles this week + estimated pay
- `POST /driver/stops/:stopId/arrive` — arrive at stop (assigned driver only)
- `POST /driver/stops/:stopId/depart` — depart stop (assigned driver only)
- `POST /driver/note` — add driver note on load
- `POST /driver/undo` — undo most recent stop action within 5 minutes
- `POST /driver/docs` — upload document (POD, etc.) as DRIVER_UPLOAD

### Tracking endpoints (roles: ADMIN/DISPATCHER/DRIVER, with assignment check for DRIVER)
- `POST /tracking/load/:loadId/start`
- `POST /tracking/load/:loadId/stop`
- `POST /tracking/load/:loadId/ping`
- `GET /tracking/load/:loadId/latest`
- `GET /tracking/load/:loadId/history`

### Settlements (driver read-only)
- `GET /settlements` — driver can only see own settlements
- `GET /settlements/:id` — driver can only see own settlement detail

### Admin driver management
- `POST /admin/drivers` — create driver login + driver record (ADMIN only)
- `GET /assets/drivers` — driver list for assignments (permission-gated)

## Worker Jobs (Driver-related)
- `apps/worker/src/index.ts`
  - `ensureComplianceTasks()` creates `DRIVER_COMPLIANCE_EXPIRING` tasks when license/med card expiring

## Data Model (Driver-relevant)

### Core models
- `Driver` — `name`, `phone`, `license`, `licenseState`, `licenseExpiresAt`, `medCardExpiresAt`, `payRatePerMile`
- `Load` — `assignedDriverId`, `status`, `stops`, `docs`, `deliveredAt`, `podVerifiedAt`
- `Stop` — arrival/departure timestamps, status, appointment windows
- `Document` — doc uploads from driver (`source=DRIVER_UPLOAD`), POD status
- `LoadTrackingSession`, `LocationPing` — tracking sessions + pings
- `Settlement`, `SettlementItem` — pay periods and settlement items
- `Task` — driver compliance tasks, can reference `driverId`

## Permissions / Roles
- Driver portal endpoints require role `DRIVER`.
- Tracking endpoints allow DRIVER if assigned to the load.
- Driver can only access settlements belonging to their driver record.
- Admin/Dispatcher/Billing can access broader driver data via Admin/Dispatch UI.

## What the driver sees vs Ops sees
- **Driver**: current load, next step, stop actions (arrive/depart), tracking controls, doc uploads, pay preview + settlements list, add driver note.
- **Ops**: driver assignments (dispatch), driver compliance (admin), driver settlements (billing/admin), driver tasks (task inbox, worker).

---

## Gaps vs 5-Year Maturity

### High impact
- **No explicit driver state machine** (state inferred from stops and load status). No “Available/Assigned/En Route/At Stop/Delivered/Waiting Pay” lifecycle.
- **No clear compliance gating**: expiring docs create tasks, but driver UI doesn’t surface compliance blocks or required driver docs.
- **Limited driver visibility on schedule**: no timeline of next stops, appointments, or delays beyond the next action.
- **No explicit “blocked” messages** (e.g., “POD rejected,” “tracking off,” “settlement not ready”).

### Medium impact
- **Ops visibility for driver risk**: dispatch can see assignment but not a unified “driver blocked/late/missing doc” signal.
- **No driver profile / status surface** in Ops (beyond admin list); no “driver status” summary.
- **Offline resilience only for uploads** (stop actions are not queued offline).

### Low impact
- **No driver preferences** (notification settings, timezone, preferred comms).
- **Basic “call dispatcher” fixed number** (not org-configurable).

---

## Files referenced
- `apps/web/app/driver/page.tsx`
- `apps/web/app/driver/settlements/page.tsx`
- `apps/web/app/admin/page.tsx`
- `apps/web/app/dispatch/page.tsx`
- `apps/web/app/dispatch/legs-panel.tsx`
- `apps/web/app/loads/page.tsx`
- `apps/web/app/loads/[id]/page.tsx`
- `apps/web/lib/offlineQueue.ts`
- `apps/api/src/index.ts`
- `apps/worker/src/index.ts`
- `packages/db/prisma/schema.prisma`
