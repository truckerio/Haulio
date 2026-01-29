# Dispatch Current State Report

Date: 2026-01-24

## 1) Page location & file map
- Route: `/dispatch`
- Page component: `apps/web/app/dispatch/page.tsx`
- Subcomponents:
  - `apps/web/app/dispatch/legs-panel.tsx`
  - `apps/web/app/dispatch/manifest-panel.tsx`
- Shared UI primitives used: `apps/web/components/ui/*` (Card, Button, Input, SectionHeader, RefinePanel, SegmentedControl, StatusChip, EmptyState)

## 2) Current UI capabilities
- Assignment focus card (first unassigned load, otherwise first load).
- Assign/unassign driver, truck, trailer for a load.
- Manual stop updates (arrive, depart, delay reason/notes).
- Leg planning (create legs, assign assets to legs, set leg status).
- Manifest management (create trailer manifest, update manifest status, add/remove loads).
- Views:
  - Cards view (default)
  - Board view by load status
  - Compact table view
- Filters:
  - Search text
  - Status filter
  - Assigned/unassigned filter
  - Driver/truck/trailer filters
  - Date range (from/to)
  - Destination text search
  - Min/max rate
- No drag-and-drop.
- No map/geo visualization.
- No explicit team/region/operating-entity filters.

## 3) Current data model + API calls (with file references)
### Loads list (dispatch view)
- UI call: `/loads?view=dispatch&...` in `apps/web/app/dispatch/page.tsx:33-77`.
- API: `app.get("/loads")` handles `view=dispatch` branch and returns heavy load payload (no pagination): `apps/api/src/index.ts:749-804`.
- Included data in dispatch view:
  - `Load` + `customer`, `driver`, `truck`, `trailer`, `operatingEntity`, `stops`, `legs`.

### Assignment & status actions
- Assign load: `POST /loads/:id/assign` (sets assigned driver/truck/trailer; sets status to ASSIGNED). `apps/api/src/index.ts:2397-2455`.
- Unassign load: `POST /loads/:id/unassign` (clears assigned assets; status back to PLANNED when needed). `apps/api/src/index.ts:2457-2528`.
- Stop arrive/depart: `POST /loads/:loadId/stops/:stopId/arrive|depart`. `apps/api/src/index.ts:2756-2798`.
- Stop delay update: `POST /stops/:id/delay`. `apps/api/src/index.ts:2512-2546`.

### Legs (leg plan + assignment)
- Create leg: `POST /loads/:id/legs`. `apps/api/src/index.ts:1702-1762`.
- Assign assets to leg: `POST /legs/:id/assign`. `apps/api/src/index.ts:1783-1845`.
- Update leg status: `POST /legs/:id/status`. `apps/api/src/index.ts:1853-1890`.

### Manifests
- List manifests: `GET /manifests`. `apps/api/src/index.ts:1900-1912`.
- Create manifest: `POST /manifests`. `apps/api/src/index.ts:1914-1972`.
- Update manifest status: `POST /manifests/:id/status`. `apps/api/src/index.ts:1974-2008`.
- Add loads to manifest: `POST /manifests/:id/items`. `apps/api/src/index.ts:2011-2067`.
- Remove load from manifest: `DELETE /manifests/:id/items/:loadId`. `apps/api/src/index.ts:2069-2112`.

### Assets
- Drivers: `GET /assets/drivers`. `apps/api/src/index.ts:2548-2556`.
- Trucks: `GET /assets/trucks`. `apps/api/src/index.ts:2553-2556`.
- Trailers: `GET /assets/trailers`. `apps/api/src/index.ts:2558-2560`.

### DB entities used
- `Load`, `Stop`, `Driver`, `Truck`, `Trailer`, `LoadLeg`, `TrailerManifest`, `TrailerManifestItem`, `Event`.
  - Schema: `packages/db/prisma/schema.prisma`.

## 4) Current roles/permissions behavior
- UI: Dispatch page is a client page with no role gating in the UI; any authenticated user can load the page.
- API permissions:
  - `/loads?view=dispatch`: `requireAuth` only (no role restriction). `apps/api/src/index.ts:749`.
  - Load assignment and leg actions require `Permission.LOAD_ASSIGN`. `apps/api/src/index.ts:2397`, `1702`, `1783`, `1853`.
  - Stop arrive/depart/delay requires `Permission.STOP_EDIT`. `apps/api/src/index.ts:2512`, `2756`, `2776`.
  - Manifest endpoints require role ADMIN or DISPATCHER. `apps/api/src/index.ts:1900-2069`.
  - Asset lists: drivers requires LOAD_ASSIGN or SETTLEMENT_GENERATE; trucks/trailers require ADMIN/DISPATCHER. `apps/api/src/index.ts:2548-2560`.

## 5) Current performance profile (10k-load risks)
- `/loads?view=dispatch` returns all matching loads with stops and legs (no pagination). This will scale poorly with 10k loads.
- Board view renders all loads in memory; no virtualization or incremental rendering.
- After every action (assign, stop update, leg update, manifest change), the page refetches the full loads list and asset lists.
- Manifest panel uses `/manifests` with included items and loads, no pagination.
- Loads in board view show `load.events?.[0]` but dispatch view does not include events; this results in missing/blank "Last update" and a wasted field access.

## 6) Missing capabilities for maturity (ranked by impact)
1) **Scalable dispatch data model + pagination**: dispatch view loads all data at once; needs server-side pagination or server-rendered board buckets with lazy loading.
2) **Role-appropriate access**: UI lacks role gating; billing/driver users can access dispatch page but actions will 403.
3) **Operational visibility**: no live map, no ETA/late risk, no exceptions queue, no SLA visibility.
4) **Team/region routing**: no support for dispatch team, terminal, region, or operating-entity scoping in filters or permissions.
5) **Workflow controls**: no drag-and-drop scheduling, no multi-assign, no bulk actions, no shift/coverage view.
6) **Asset constraints**: no HOS, equipment compatibility, driver availability, or conflict detection.
7) **Audit and collaboration**: no inline notes/activity feed on dispatch cards; no conflict resolution or approvals.

## 7) Minimal recommended changes (not implementations)
- Add server-side pagination for dispatch view and a lightweight card payload (stops summary vs full stops).
- Add role-based access for the dispatch page (UI guard + API guard for `view=dispatch`).
- Introduce scoped filters for operating entity, terminal/region, and team.
- Split board view into paginated buckets (per status) or lazy-load buckets.
- Add a lightweight "last update" field (or include recent event) for board cards.
- Add basic exceptions (overdue arrival, tracking off) as flags to prioritize loads.

## 8) Open questions
- None that block this audit; code paths for all current dispatch flows are present.

