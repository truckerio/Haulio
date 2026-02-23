# YardOS (Standalone)

This is a standalone YardOS product workspace. It runs independently from TruckerIO.

## Structure

- `apps/web` → Planning Studio UI (Next.js)
- `apps/api` → YardOS integration API (Express + TypeScript)
- `packages/contracts` → Shared API/domain types
- `packages/planning-core` → Deterministic consolidation + slotting engine

## Features included

- Load pool + trailer selection
- Suggested consolidation plans (A/B/C)
- Deterministic pallet slot placement
- Plan preview (weight, fill, axle balance, violations)
- Plan apply / reject actions
- Event feed endpoint + UI strip
- Load file import (CSV/JSON) into load pool
- Load pool filtering/sorting/selection controls
- Trailer specification editor with API persistence

## Run locally

```bash
cd yardos
pnpm install
pnpm dev
```

Default ports:

- Web: `http://localhost:3101`
- API: `http://localhost:4100`

## Key API routes

- `GET /health`
- `GET /integrations/yardos/context`
- `POST /integrations/yardos/suggested-plans`
- `POST /integrations/yardos/plan-preview`
- `POST /integrations/yardos/plan-apply`
- `POST /integrations/yardos/plan-reject`
- `GET /integrations/yardos/events`
- `POST /integrations/yardos/import-loads` (multipart `file`, optional `mode=append|upsert|replace`)
- `GET /integrations/yardos/import-template.csv`
- `POST /integrations/yardos/trailer-spec`

## Load File Import

From the Planning Studio load pool:

1. Choose a `.csv` or `.json` file.
2. Pick import mode:
   - `upsert` updates existing load IDs and inserts new loads
   - `append` inserts only new IDs
   - `replace` clears current loads then imports file loads
3. Click `Import file`.

CSV headers supported:

`id,loadNumber,pallets,weightLbs,cubeFt,lane,stopWindow,constraints,destinationCode,status`

## Notes

- State persists to local JSON file (`apps/api/data/yardos-db.json`, configurable via `YARDOS_DATA_FILE`).
- Planning engine is deterministic: same input -> same placements.
- Next phase: production DB, auth, role model, and 3D trailer module.
