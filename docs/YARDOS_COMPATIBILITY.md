# YardOS Compatibility (Phase 1)

Goal: keep `demo-truckerio1` and YardOS as separate apps, but make them feel like one ecosystem.

## What is implemented

### Shared contracts
- `packages/shared/src/yardos.ts`
- Exported from `packages/shared/src/index.ts`
- Defines payload contracts for:
  - Context sync
  - Plan preview
  - Plan apply
  - Plan reject
  - Event polling

### API integration endpoints
In `apps/api/src/index.ts`:

- `GET /integrations/yardos/context`
  - Returns scoped loads + trailers + trailer defaults
  - Supports query: `loadIds`, `trailerId`, `limit`

- `POST /integrations/yardos/plan-preview`
  - Stateless summary check for placements/violations
  - Returns weight + axle + violation summary

- `POST /integrations/yardos/plan-apply`
  - Applies trailer assignment to touched loads (if `trailerId` provided)
  - Emits events + outbox signal per load
  - Writes audit log (`YARDOS_PLAN_APPLIED`)

- `POST /integrations/yardos/plan-reject`
  - Records plan rejection event + audit log (`YARDOS_PLAN_REJECTED`)

- `GET /integrations/yardos/events`
  - Cursor-based feed for YardOS sync/polling

All endpoints are team-scope aware.

### Web handoff integration
- `apps/web/lib/yardos.ts`
  - `buildYardOsPlanningUrl(...)`
- `apps/web/components/dispatch/WorkbenchRightPane.tsx`
  - Adds `Open in Yard OS` button
- `apps/web/app/dispatch/page.tsx`
  - Passes selected load/trailer/org/team context into YardOS launch URL
- `apps/web/.env.example`
  - Adds optional `NEXT_PUBLIC_YARDOS_BASE_URL`

## Local setup

In `apps/web/.env.local` set:

```bash
NEXT_PUBLIC_API_BASE=/api
NEXT_PUBLIC_YARDOS_BASE_URL=http://localhost:3101/planning-studio
```

Then run:

```bash
pnpm --filter @truckerio/api dev
pnpm --filter @truckerio/web dev
```

Open Dispatch, select a load, then click `Open in Yard OS`.

## Current boundary

This phase provides:
- stable contract,
- API apply/reject lifecycle,
- user-facing deep-link handoff from Dispatch.

It does not yet provide:
- service-to-service auth,
- webhook push from TruckerIO to YardOS,
- full bi-directional command center sync.
