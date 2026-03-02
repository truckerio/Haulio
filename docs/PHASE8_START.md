# Phase 8 START (Safety/Support Read-Heavy Workbench)

Date: March 2, 2026

## Goal
Harden read-heavy operations surfaces for `SAFETY` and `SUPPORT` roles on `/loads` and `/trips`, without changing dispatch/billing/tracking workflows.

## Scope
- Keep capability-first authorization and fail-closed behavior.
- Remove mutation-first controls from read-heavy roles where possible in UI.
- Keep investigation flow fast (queue chips, row drilldown, trip/load detail navigation).

## File Targets
- `apps/web/app/loads/page.tsx`
- `apps/web/components/dispatch/TripsWorkspace.tsx`
- `apps/web/app/loads/loads-role-workbench.test.ts` (new)
- `apps/web/app/trips/trips-role-workbench.test.ts` (new)
- `apps/web/package.json`
- `package.json`
