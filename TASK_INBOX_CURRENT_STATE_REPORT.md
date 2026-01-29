# Task Inbox Current State Report

Date: 2026-01-24

## 1) Page location & routes
- Route: `/dashboard` (nav label: Task Inbox)
- Page component: `apps/web/app/dashboard/page.tsx`
- Subcomponents: none (uses shared UI primitives only)

## 2) Current UI behavior
- Shows two tabs via segmented control: "Mine" and "Role Queue".
- Default tab: "Mine".
- Each task card shows:
  - Priority chip (HIGH -> warning tone)
  - Task type label
  - Title
  - Load number + customer name
- Actions:
  - Mine: "Mark done" (complete task)
  - Mine: "Send to queue" (if assignees endpoint succeeds)
  - Role Queue: "Assign to me" and optional assignee dropdown (if assignees endpoint succeeds)
- Empty state:
  - Mine: "No tasks assigned to you."
  - Role Queue: "No tasks in your role queue."

## 3) Data sources
- `GET /tasks/inbox` for my tasks and role queue tasks.
  - File: `apps/api/src/index.ts:594-612`
- `GET /tasks/assignees` for user list (only if permission allows).
  - File: `apps/api/src/index.ts:614-621`
- `POST /tasks/:id/assign` for assigning or re-queuing.
  - File: `apps/api/src/index.ts:623-666`
- `POST /tasks/:id/complete` to mark done.
  - File: `apps/api/src/index.ts:668-676`
- DB entities involved:
  - `Task`, `Load`, `Driver`, `Customer`, `Invoice`, `User`.
  - Schema: `packages/db/prisma/schema.prisma:746-783`

## 4) Task / item derivation logic
Tasks are created server-side (not from UI). Key sources:
- Load delivery arrival: `TaskType.COLLECT_POD` (Billing) created when delivery stop arrives.
  - `apps/api/src/index.ts:3000-3040`
- Stop departure with detention: `TaskType.STOP_DELAY_FOLLOWUP` (Billing).
  - `apps/api/src/index.ts:3095-3135`
- Invoice generation / packet generation missing docs: `TaskType.MISSING_DOC` (Billing).
  - `apps/api/src/index.ts:4000-4060`, `apps/api/src/index.ts:4090-4150`
- Invoice dispute: `TaskType.INVOICE_DISPUTE` (Billing).
  - `apps/api/src/index.ts:4240-4305`
- Worker-generated tasks:
  - Missing POD after threshold: `TaskType.MISSING_DOC` (Billing).
    - `apps/worker/src/index.ts:11-55`
  - Payment follow-up for overdue invoices: `TaskType.PAYMENT_FOLLOWUP` (Billing).
    - `apps/worker/src/index.ts:65-115`
  - Driver compliance expiring: `TaskType.DRIVER_COMPLIANCE_EXPIRING` (Dispatcher).
    - `apps/worker/src/index.ts:117-160`
- Task creation helpers: `apps/api/src/lib/tasks.ts` (createTask, ensureTask, completeTask).

## 5) Roles & permissions
- Page access: no explicit UI gating; any authenticated user can load the page.
- API:
  - `/tasks/inbox`: `requireAuth` only (no role restriction).
  - `/tasks/assignees`: `requirePermission(TASK_ASSIGN)`.
  - `/tasks/:id/assign`: `requirePermission(TASK_ASSIGN)`.
  - `/tasks/:id/complete`: `requireAuth` only (no explicit permission check).
- UI behavior:
  - If `/tasks/assignees` fails, assignment controls are hidden.
  - Users without TASK_ASSIGN can still call complete on tasks they can see.

## 6) Performance profile
- No pagination for inbox queries.
- `GET /tasks/inbox` includes `load`, `driver`, `customer`, `invoice` on each task.
- Two separate `findMany` queries (my tasks + role queue), each sorted by priority and createdAt.
- Client refetches both lists after any assign/complete action (no partial updates).
- Risks at scale: large task volume will increase payload and render cost.

## 7) Gaps vs 5-year maturity
- No pagination, filtering, or search.
- No due date display or overdue highlighting.
- No task grouping by type/priority or SLA buckets.
- No deep links to relevant entity (load, invoice, stop, doc).
- Minimal role gating (users may see tasks but cannot assign without permission).
- No bulk actions.
- No distinction between tasks created by system vs manual.

## 8) Open questions
- None required; current behavior is fully visible in code.

