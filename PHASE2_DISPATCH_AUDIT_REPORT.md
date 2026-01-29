# Phase 2 Dispatch Audit Report

Date: 2026-01-24

## Summary Table (Contract Items #2-#10)

| Contract Item | Status | Notes |
| --- | --- | --- |
| 2) Role + permission gating | PASS | UI blocks without LOAD_ASSIGN; API enforces LOAD_ASSIGN for dispatch view. |
| 3) Enterprise performance | PASS | Dispatch list is paginated + lightweight; heavy detail fetched per selected load. |
| 4) Worklist ordering | PASS | Needs Assignment > At Risk > Healthy, then next stop time. |
| 5) Views (board/cards/compact) | PASS | All views use paginated data. |
| 6) Availability-first assignment | PASS | Available-only defaults; show unavailable toggle with reasons. |
| 7) Driver signals + popover | PASS | Placeholder signals + info panel; no new page added. |
| 8) Operating entity filter | PASS | Server-side filter + URL/localStorage persistence. |
| 9) Risk flags | PASS | Needs Assignment, Tracking Off, Overdue Stop Window visible on cards. |
| 10) Refetch strategy | PASS | Asset lists cached; post-actions refresh only selected load and patch list. |

## Evidence (file references)

### 2) Role + permission gating
- UI guard (no access state): `apps/web/app/dispatch/page.tsx:311-327`.
- API gating for dispatch list: `apps/api/src/index.ts:767-772`.

### 3) Enterprise performance
- Dispatch list is paginated + lightweight: `apps/api/src/index.ts:781-905`.
- Heavy detail fetched only for selected load: `apps/api/src/index.ts:1283-1330` and `apps/web/app/dispatch/page.tsx:216-236`.

### 4) Worklist ordering
- Priority ordering computed client-side: `apps/web/app/dispatch/page.tsx:297-323`.
- Risk flags from server + next stop time used for ordering: `apps/api/src/index.ts:845-904`.

### 5) Views (board/cards/compact)
- Board/cards/compact render the same paginated dataset: `apps/web/app/dispatch/page.tsx:602-750`.
- Pagination controls: `apps/web/app/dispatch/page.tsx:771-785`.

### 6) Availability-first assignment
- Availability endpoint: `apps/api/src/index.ts:2562-2685`.
- Available-only default + Show unavailable toggle: `apps/web/app/dispatch/page.tsx:436-478`.
- Unavailable reason display and disabled options: `apps/web/app/dispatch/page.tsx:438-470`, `apps/web/app/dispatch/legs-panel.tsx:72-116`.

### 7) Driver signals + info popover
- Driver signals in selector (placeholder values): `apps/web/app/dispatch/page.tsx:445-450`.
- Info panel modal: `apps/web/app/dispatch/page.tsx:495-520`.

### 8) Operating entity filter
- Server-side filter in buildLoadFilters: `apps/api/src/index.ts:313-350`.
- Filter UI + persistence (URL + localStorage): `apps/web/app/dispatch/page.tsx:94-120`, `apps/web/app/dispatch/page.tsx:585-608`.
- OE list endpoint: `apps/api/src/index.ts:2558-2560`.

### 9) Risk flags
- Needs Assignment, Tracking Off, Overdue Stop Window computed in list response: `apps/api/src/index.ts:848-903`.
- Risk flags visible on cards/compact view: `apps/web/app/dispatch/page.tsx:665-722`.

### 10) Refetch strategy
- Asset lists fetched once per session: `apps/web/app/dispatch/page.tsx:122-147`.
- Post-action refresh only selected load + patch list: `apps/web/app/dispatch/page.tsx:238-292`.

## New/Updated Endpoints
- `GET /loads?view=dispatch&page&limit&operatingEntityId...` (paginated, lightweight).
- `GET /loads/:id/dispatch-detail` (heavy detail for selected load only).
- `GET /dispatch/availability?loadId=...` (available/unavailable assets with reasons).
- `GET /operating-entities` (list for dispatch filter; LOAD_ASSIGN permission).

## Notes / Tradeoffs
- Worklist ordering is primarily driven by server risk flags but final sorting is done client-side within the current page.
- Driver signals are placeholders ("-") until metrics are available; UI is ready for future data without new routes.

## Deferred (Explicitly Out of Phase 2)
- Drag-and-drop scheduling
- Full map/geo visualization
- HOS/PTO scheduling
- Bulk multi-assign
- Chat/collaboration feed
- Advanced optimization / ETA prediction

