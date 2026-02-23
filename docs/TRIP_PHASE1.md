# Trip Dispatch Phase 1

This phase introduces a non-breaking trip model so dispatch can assign by `tripNumber` while existing load and manifest flows continue to work.

## What was added

- New models:
  - `Trip`
  - `TripLoad` (join table between trip and loads)
- New enum:
  - `TripStatus` = `PLANNED | ASSIGNED | IN_TRANSIT | ARRIVED | COMPLETE | CANCELLED`
- Bridge:
  - `POST /manifests/:id/dispatch-as-trip` creates a trip from an existing manifest (idempotent per manifest).

## Why this is non-breaking

- `Load` remains the billing/customer unit.
- Existing `loadNumber` and current manifest endpoints stay intact.
- Driver-facing flow still reads load assignment fields (`assignedDriverId`, `truckId`, `trailerId`).
- Trip assignment now propagates those same assignment fields to all loads in the trip.

## API summary

- `GET /trips`
- `GET /trips/:id`
- `POST /trips`
- `POST /trips/:id/loads`
- `POST /trips/:id/assign`
- `POST /trips/:id/status`
- `POST /manifests/:id/dispatch-as-trip`

## Typical flow

1. Create trip with a `tripNumber` (or auto-generate) and initial loads.
2. Assign driver/truck/trailer on trip once via `/trips/:id/assign`.
3. Add/remove loads on trip as needed.
4. Move status through `/trips/:id/status`.
5. Use load-level finance/doc lifecycle as before.

## Migration

Apply:

```bash
pnpm -w prisma:generate
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5433/haulio' pnpm --filter @truckerio/db exec prisma migrate deploy
```

If using a resettable local DB:

```bash
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5433/haulio' pnpm --filter @truckerio/db exec prisma db push
```
