# Team Driver Assignment Audit

## Scope
Audit of current load assignment flow (UI, API, DB, driver app) prior to adding a 2‑driver (PRIMARY + CO_DRIVER) option.

## UI — Dispatch assignment
- Dispatch page + assignment form state: `apps/web/app/dispatch/page.tsx`
  - Assign form state: `assignForm` with `driverId`, `truckId`, `trailerId`.
  - Assign API call: `apiFetch('/loads/:id/assign')` with `{ driverId, truckId, trailerId }`.
- Assignment UI panel: `apps/web/components/dispatch/WorkbenchRightPane.tsx`
  - Driver/truck/trailer selectors.
  - Displays assigned summary using `assignment.assignedSummary` and `loadSummary.assignment`.

## API — Assign endpoint
- Assign handler: `POST /loads/:id/assign` in `apps/api/src/index.ts`.
  - Request payload: `{ driverId, truckId?, trailerId?, overrideReason? }`.
  - Validates driver/truck/trailer exist in org.
  - Enforces ratecon requirement for brokered loads.
  - Updates `Load.assignedDriverId`, `Load.truckId`, `Load.trailerId` and timestamps.
  - Updates active leg driver/truck/trailer if any.
  - Updates asset statuses (driver ON_LOAD, truck/trailer ASSIGNED).
  - Creates events + audit logs.
- Unassign handler: `POST /loads/:id/unassign` in `apps/api/src/index.ts`.
  - Clears `assignedDriverId`/truck/trailer and resets asset statuses if idle.

## DB — Current assignment model
- Load fields: `packages/db/prisma/schema.prisma`
  - `Load.assignedDriverId` (single driver assignment).
  - `Load.truckId`, `Load.trailerId`.
  - Relation: `Load.driver` via `assignedDriverId`.

## Driver app + driver access checks
- Driver UI: `apps/web/app/driver/page.tsx`
  - Uses `/driver/current` and `/driver/settings`.
  - Assumes a single assigned driver.
- Driver API access checks (single driver enforced): `apps/api/src/index.ts`
  - `/driver/current`: filters loads by `assignedDriverId = driver.id`.
  - `/driver/stops/:stopId/arrive` and `/depart`: requires `stop.load.assignedDriverId === driver.id`.
  - `/driver/docs`, `/driver/note`, `/driver/undo`: require `load.assignedDriverId === driver.id`.
  - `/driver/earnings`: sums loads by `assignedDriverId`.
  - Tracking endpoints require driver match on `assignedDriverId`.

## Summary of current behavior
- Dispatch assigns exactly one driver to a load via `assignedDriverId`.
- Driver app only allows the assigned driver to see and act on the load.
- Billing/Today/Tasks/derivations use `assignedDriverId` as the driver of record.

