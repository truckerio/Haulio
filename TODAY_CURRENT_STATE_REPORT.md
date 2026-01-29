# Today Current State Report

Date: 2026-01-24

## 1) Page location & routes
- Route: `/today`
- Page component: `apps/web/app/today/page.tsx`
- Subcomponents: none (uses shared UI primitives only)

## 2) Current UI behavior
- Top stats: three StatCards
  - Cash at risk (links to /billing)
  - Loads needing action (links to /loads)
  - Drivers needing action (links to /dashboard)
- "Today's activity" is a collapsible details section (collapsed by default).
- Activity sections:
  - Loads in motion (lists today's loads)
  - Drivers needing action (lists action tasks)
  - Invoice attention (lists overdue/at-risk invoices)
- Empty states for each section.
- Manual refresh button inside the details section.
- No role-based UI gating visible in the page.

## 3) Data sources
- `GET /today`
  - File: `apps/api/src/index.ts:681-737`
  - Returns: `todayLoads`, `actionTasks`, `invoices`, `cashPosition`.
- DB entities involved:
  - `Load`, `Task`, `Invoice`, `Customer`, `Driver`, `Stop`, `OrgSettings`.
  - Schema: `packages/db/prisma/schema.prisma`.

## 4) Task / item derivation logic
- Today loads:
  - Loads created since midnight and not invoiced.
  - Source: `/today` query: `createdAt >= startOfDay`, `status != INVOICED`.
- Action tasks:
  - Tasks of types: COLLECT_POD, MISSING_DOC, STOP_DELAY_FOLLOWUP, DRIVER_COMPLIANCE_EXPIRING.
  - Sorted by priority desc, dueAt asc.
  - Source: `/today` query in `apps/api/src/index.ts:696-716`.
- Invoices:
  - Only invoices with statuses SENT, ACCEPTED, DISPUTED, SHORT_PAID.
  - Due date computed from terms (customer termsDays or org settings).
  - Overdue flag computed at request time.

## 5) Roles & permissions
- `/today` requires authentication only; no role gating.
- UI does not branch by role.
- Action items include billing-focused tasks even for non-billing users.

## 6) Performance profile
- No pagination.
- `/today` loads include `stops` (full array) and `driver/customer` for each load.
- Tasks include `driver` and `load` relations.
- Invoices include `load` + `customer` relation.
- Single request per page load; manual refresh re-fetches the entire payload.
- Risk at scale: large orgs with many loads/tasks/invoices will return heavy payloads.

## 7) Gaps vs 5-year maturity
- No filtering or personalization by role/team/operating entity.
- No prioritization within sections beyond server ordering.
- No deep links from list items to specific load/invoice/task detail context.
- No pagination or lazy loading for large datasets.
- No SLA indicators (e.g., overdue stop windows, late risk, missed ETA).
- No ability to dismiss or snooze items.

## 8) Open questions
- None required; behavior is fully visible in code.

