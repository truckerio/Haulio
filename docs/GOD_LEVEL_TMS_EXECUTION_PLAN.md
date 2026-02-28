# God-Level TMS OS Execution Plan

Last updated: February 27, 2026  
Repository: `demo-truckerio1-phase1`

## 1) Purpose
This document is the execution tracker to consolidate Haulio into a role-first, trip-first TMS OS without rewriting core workflows.

Primary outcomes:
- State consolidation (single mutation spine)
- Surface consolidation (role workbenches)
- Intelligence activation (action-first queues)
- Hierarchy enforcement (capability-first auth/UI)

## 2) Scope + Constraints
- Keep core workflows intact: dispatch, billing, docs, tracking, settlements.
- Allow UI/IA consolidation and authorization hardening.
- Enforce: no “visible action that 403s” UX.
- Preserve carrier-first authority:
  - `Trip` = execution authority
  - `Load` = commercial authority
  - `Invoice/Settlement/Payables` = financial authority

## 3) Canonical Roles + Workbenches
- Roles: `ADMIN`, `DISPATCHER`, `HEAD_DISPATCHER`, `BILLING`, `DRIVER`, `SAFETY`, `SUPPORT`
- Primary workbenches:
  - Dispatch cockpit: `/dispatch` (trip-first default for dispatch roles)
  - Finance cockpit: `/finance`
  - Safety/support ops surface: `/loads` + `/trips` (read-heavy)
  - Driver portal: `/driver`

## 4) Execution Timeline (16 Weeks)
- Weeks 1-4: Phase A/B (contract + capability spine)
- Weeks 5-8: Phase C (state kernel shadow + endpoint migration)
- Weeks 9-12: Phase D (UI workbench hardening + role routing/nav)
- Weeks 13-16: Phase E (enforcement + rollout + drift prevention)

## 5) Master Tracker
Use this table as the top-level PM tracker.

| Workstream | Owner | Start | Due | Status (`Not Started/In Progress/Blocked/Done`) | Evidence |
|---|---|---|---|---|---|
| A. Canonical state contract |  |  |  | In Progress | `docs/STATE_KERNEL_SPEC.md`, `docs/STATE_AUTHORITY_MATRIX.md`, `apps/api/src/lib/state-kernel/*` |
| B. Capability contract + auth parity |  |  |  | In Progress | `apps/api/src/lib/capabilities.ts`, `apps/web/lib/capabilities.ts`, authz/capability tests |
| C. State kernel shadow rollout |  |  |  | Done | `docs/STATE_KERNEL_ROLLOUT.md`, `apps/api/src/index.ts`, `apps/api/scripts/smoke-kernel-first-wave.ts`, `pnpm ci:kernel:phase3` |
| D. Workbench UI hardening |  |  |  | Done | dispatch/trip/load role-first contracts + tests (`apps/web/lib/navigation.test.ts`, `apps/web/components/dispatch/dispatch-grid-contract.test.ts`, `apps/web/components/dispatch/timeline-utils.test.ts`, `apps/web/app/trips/trip-cockpit-layout.test.ts`, `apps/web/app/loads/load-overview-layout.test.ts`) |
| E. Enforcement + CI drift gates |  |  |  | In Progress | phase pass docs + ongoing drift cleanup |

---

## 6) Phase A: Canonical State Contract

### File-Level Targets
- `packages/db/prisma/schema.prisma`
- `apps/api/src/lib/load-status.ts`
- `apps/api/src/modules/dispatch/execution-authority.ts`
- `apps/api/src/lib/events.ts`
- `apps/api/src/lib/audit.ts`
- `apps/api/src/lib/load-audit.ts`
- New folder: `apps/api/src/lib/state-kernel/`
  - `types.ts`
  - `transitions.ts`
  - `invariants.ts`
  - `apply-transition.ts`
  - `shadow-compare.ts`
- New docs:
  - `docs/STATE_KERNEL_SPEC.md`
  - `docs/STATE_AUTHORITY_MATRIX.md`

### Implementation Checklist
| Task | Owner | Start | Due | Status | Evidence |
|---|---|---|---|---|---|
| Define canonical state domains (`execution/doc/finance/compliance`) |  |  |  | Done | `docs/STATE_KERNEL_SPEC.md` |
| Define authority ownership (Trip/Load/Finance objects) |  |  |  | Done | `docs/STATE_AUTHORITY_MATRIX.md` |
| Additive schema migration for kernel metadata (no destructive changes) |  |  |  | Not Started | migration id |
| Add transition + invariant engine under `state-kernel/` |  |  |  | Done | `apps/api/src/lib/state-kernel/*` |
| Emit standardized transition audit/events |  |  |  | In Progress | `STATE_KERNEL_DIVERGENCE` audit rows |

### Gate A (Definition of Done)
- Every mutable operational status has one canonical transition path in spec.
- No unresolved ambiguous state names in active use.
- Transition engine implemented and testable in isolation.

### Required Tests/Checks
```bash
pnpm --filter @truckerio/api exec tsc -p tsconfig.json --noEmit
pnpm --filter @truckerio/api run test:dispatch
pnpm --filter @truckerio/api run test:notes
```

---

## 7) Phase B: Capability Contract + Authorization Parity

### File-Level Targets
- `apps/api/src/lib/capabilities.ts`
- `apps/api/src/lib/permissions.ts`
- `apps/api/src/lib/rbac.ts`
- `apps/api/src/lib/dispatch-role-parity.ts`
- `apps/api/src/index.ts` (guard cleanup for mutation endpoints)
- `apps/web/lib/capabilities.ts`
- `apps/web/components/auth/user-context.tsx`
- `apps/web/components/rbac/route-guard.tsx`
- `apps/web/lib/api.ts`
- `apps/web/components/app-shell.tsx`

### Implementation Checklist
| Task | Owner | Start | Due | Status | Evidence |
|---|---|---|---|---|---|
| Confirm canonical role list is shared in API + Web |  |  |  | Done | `apps/api/src/lib/capabilities.ts`, `apps/web/lib/capabilities.ts` |
| Remove remaining ad-hoc role checks from mutation surfaces |  |  |  | In Progress | web guard cleanup commits |
| Enforce dispatcher/head-dispatcher parity on execution capabilities |  |  |  | Done | `pnpm --filter @truckerio/api run test:authz` |
| Fail-closed UI behavior for 403 on actions |  |  |  | Done | capability fail-closed helpers in web |
| Ensure safety/support do not get write finance/dispatch actions |  |  |  | Done | capability maps + authz tests |

### Gate B (Definition of Done)
- `DISPATCHER` and `HEAD_DISPATCHER` parity for docs, charges, tracking start.
- `SAFETY` and `SUPPORT` read-heavy behavior with no accidental mutations.
- UI never shows live controls that guaranteed-fail due to missing capability.

### Required Tests/Checks
```bash
pnpm --filter @truckerio/api run test:authz
pnpm --filter @truckerio/web run test:capabilities
pnpm --filter @truckerio/api exec tsc -p tsconfig.json --noEmit
pnpm --filter @truckerio/web run typecheck
```

---

## 8) Phase C: State Kernel Shadow Mode + Endpoint Migration

### File-Level Targets
- `apps/api/src/index.ts` (high-mutation routes)
- `apps/api/src/lib/state-kernel/*`
- `apps/api/src/lib/audit.ts`
- `apps/api/src/lib/events.ts`
- `apps/api/src/lib/load-status.ts`
- `apps/api/src/modules/dispatch/execution-authority.ts`
- `infra/docker/docker-compose.prod-local.yml`
- `.env.example`
- `.env.prod.local.example`

### Endpoint Priority (First Wave)
- Load assignment/unassignment routes
- Stop delay/arrival/departure lifecycle routes
- `/loads/:id/docs` mutations
- `/loads/:id/charges` mutations
- `/tracking/load/:id/start|stop|ping` mutations

### Shadow Mode Flags
- `STATE_KERNEL_SHADOW=true`
- `STATE_KERNEL_ENFORCE=false`
- `STATE_KERNEL_DIVERGENCE_LOG=true`

### Implementation Checklist
| Task | Owner | Start | Due | Status | Evidence |
|---|---|---|---|---|---|
| Add shadow evaluator on targeted mutation endpoints |  |  |  | Done | route hooks in `apps/api/src/index.ts` for charges/docs/tracking/stops/trips + status transitions |
| Log divergence payloads (`legacyAfter` vs `kernelAfter`) |  |  |  | Done | `STATE_KERNEL_DIVERGENCE` meta now includes `kernelPatch`, `violationCodes`, `hasBlockingKernelViolations` |
| Add endpoint-level transition regression tests |  |  |  | Done | `apps/api/src/lib/state-kernel/first-wave-routes.test.ts` + `pnpm --filter @truckerio/api run test:kernel` |
| Run shadow in prod-local and validate zero critical divergences |  |  |  | Done | `pnpm demo:kernel:report` PASS for `cmluiq46j0000c8vh3s1fzz5p` (Wrath Logistics), February 27, 2026 |

### Divergence Log Contract
Minimum fields in audit meta:
- `route`, `method`, `entityType`, `entityId`
- `legacyBefore`, `legacyAfter`, `kernelAfter`
- `diffKeys`, `userRole`, `orgId`, `timestamp`

### Gate C (Definition of Done)
- Shadow mode enabled for first-wave endpoints.
- Divergence rate is tracked and triaged.
- No high-severity divergence left open.

Gate C Status: PASS (pilot org `cmluiq46j0000c8vh3s1fzz5p`, February 27, 2026)

---

## 9) Phase D: Workbench UI Hardening (Role-First Surfaces)

### 9.1 Dispatch Workbench (`/dispatch`)
#### File-Level Targets
- `apps/web/app/dispatch/page.tsx`
- `apps/web/components/dispatch/DispatchSpreadsheetGrid.tsx`
- `apps/web/components/dispatch/WorkbenchRightPane.tsx`
- `apps/web/components/dispatch/TripsWorkspace.tsx`

#### Layout Rules (Must Hold)
- Trips view default for dispatch roles in `CARRIER`/`BOTH`.
- Dense spreadsheet canvas with dockable inspector/exceptions lanes.
- Load # and Status remain permanent/frozen columns.
- Timeline tab shows pinned notes first then chronology.

#### Interaction Rules (Must Hold)
- Fast filter/search/bulk operations.
- Capability-gated actions only.
- 403 fail-closed behavior with restricted label.

### 9.2 Trip Cockpit (`/trips/[id]`)
#### File-Level Targets
- `apps/web/app/trips/[id]/page.tsx`

#### Layout Rules (Must Hold)
- 3-column cockpit:
  - Left: Stops/Appointments always visible
  - Center: Notes composer/feed always visible + recent activity
  - Right: Command rail (assignment/tracking/docs/finance/blockers)
- Nested loads panel remains within trip authority context.

#### Interaction Rules (Must Hold)
- Notes support type + priority.
- Settlement/miles panels shown only to allowed roles.
- LTL grouping + expand/collapse remains UI-only behavior.

### 9.3 Load Detail Workbench (`/loads/[id]`)
#### File-Level Targets
- `apps/web/app/loads/[id]/page.tsx`
- `apps/web/lib/load-derivations.ts`

#### Layout Rules (Must Hold)
- Overview keeps stops and notes always visible.
- Existing right rail remains (next action/docs/tracking/freight).
- No business-logic workflow rewrites.

#### Interaction Rules (Must Hold)
- Existing docs/billing/audit tabs retained.
- Capability/403 restricted behavior retained on all actions.

### 9.4 Navigation + Landing
#### File-Level Targets
- `apps/web/components/app-shell.tsx`
- `apps/web/app/(auth)/post-login/page.tsx`
- `apps/web/app/(auth)/login/login-client.tsx`
- `apps/web/app/setup/page.tsx`
- `apps/web/middleware.ts`
- `apps/web/lib/capabilities.ts`

#### Rules (Must Hold)
- Landing:
  - Dispatch roles -> `/dispatch?workspace=trips`
  - Billing -> `/finance`
  - Admin -> `/admin`
  - Driver -> `/driver`
  - Safety/Support -> `/loads` (read-heavy surface)
- Dispatch roles de-emphasize activity/dashboard into secondary nav.

### Gate D (Definition of Done)
- Dispatch, trip, and load pages align with role-first scanning behavior.
- No unauthorized actions visible on primary surfaces.
- Role landing and nav reflect capability contract.

Gate D Status: PASS (February 27, 2026)

### Required Tests/Checks
```bash
pnpm --filter @truckerio/web run test
pnpm --filter @truckerio/web run typecheck
```

---

## 10) Phase E: Enforcement + CI Drift Gates + Rollout

### File-Level Targets
- `apps/api/src/lib/state-kernel/*`
- `apps/api/src/index.ts`
- `apps/api/src/lib/dispatch-role-parity.test.ts`
- `apps/web/lib/capabilities.test.ts`
- `docs/PHASE1_PASS.md`
- New: `docs/STATE_KERNEL_ROLLOUT.md`

### Implementation Checklist
| Task | Owner | Start | Due | Status | Evidence |
|---|---|---|---|---|---|
| Flip selected endpoints from shadow to enforce |  |  |  | In Progress | pilot enforce flags in prod-local (`STATE_KERNEL_ENFORCE=true`, scoped org list) + `apps/api/src/index.ts` enforce guards (`transitionLoadStatus` + trip mirror sync enforcement) |
| Add CI checks to block direct status writes outside kernel |  |  |  | Done | `scripts/ci/check-load-status-mutation-drift.mjs`, `pnpm ci:drift:status` |
| Add CI checks for capability drift (API vs Web maps) |  |  |  | Done | `scripts/ci/check-role-capability-drift.mjs`, `pnpm ci:drift:roles` |
| Publish smoke script and pass evidence by role |  |  |  | Done | `apps/api/scripts/smoke-role-matrix.ts`, `pnpm demo:smoke:roles`, `docs/PHASE1_PASS.md` |

### Enablement Waves
| Wave | Scope | Shadow | Enforce | Rollback Path |
|---|---|---|---|---|
| 1 | docs/charges/tracking mutations | ON | OFF | disable shadow flag |
| 2 | assignment + stop lifecycle | ON | partial ON | set enforce OFF |
| 3 | remaining operational mutations | ON | ON | set enforce OFF |
| 4 | remove legacy direct mutation branches | N/A | ON | git revert rollout commit |

### Gate E (Definition of Done)
- Kernel enforcement active on target routes.
- CI drift gates active and green.
- Role smoke checks documented and reproducible.

### Required Commands
```bash
pnpm --filter @truckerio/api run test:authz
pnpm --filter @truckerio/api run test
pnpm --filter @truckerio/api exec tsc -p tsconfig.json --noEmit
pnpm --filter @truckerio/web run test
pnpm --filter @truckerio/web run typecheck
pnpm ci:drift
ORG_ID=<ORG_ID> DATABASE_URL=<DATABASE_URL> pnpm ci:kernel:pilot
pnpm prod:local
pnpm demo:smoke
pnpm demo:smoke:roles
ORG_ID=<ORG_ID> DATABASE_URL=<DATABASE_URL> API_BASE=<API_BASE> pnpm demo:smoke:enforce
ORG_ID=<ORG_ID> DATABASE_URL=<DATABASE_URL> API_BASE=<API_BASE> pnpm ci:kernel:phasee
```

---

## 11) Migration Mechanics (Prod-Local + Recovery)

### Standard Runbook
```bash
pnpm prod:local
COMPOSE=(docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml)
"${COMPOSE[@]}" run --rm api pnpm --filter @truckerio/db exec prisma migrate deploy
```

### Failed Migration Recovery
If a migration is marked failed (`P3009` / `P3018`), resolve it first:
```bash
COMPOSE=(docker compose -p prodlocal --env-file .env.prod.local -f infra/docker/docker-compose.prod-local.yml)
"${COMPOSE[@]}" run --rm api pnpm --filter @truckerio/db exec prisma migrate resolve --rolled-back <failed_migration_id>
"${COMPOSE[@]}" run --rm api pnpm --filter @truckerio/db exec prisma migrate deploy
```

### Full Reset Fallback (Local Only)
```bash
pnpm prod:local:reset-seed
```

---

## 12) Role Smoke Matrix (Manual Verification)

| Role | Landing | Must Be Visible | Must Be Restricted |
|---|---|---|---|
| ADMIN | `/admin` | all workbenches + admin controls | none |
| DISPATCHER | `/dispatch?workspace=trips` | dispatch execution, docs upload, charges edit, tracking start | admin-only config |
| HEAD_DISPATCHER | `/dispatch?workspace=trips` | same execution controls as dispatcher | admin-only config |
| BILLING | `/finance` | receivables/payables/billing actions | trip assignment execution controls |
| SAFETY | `/loads` | read-heavy load/trip/compliance visibility | finance and dispatch mutations |
| SUPPORT | `/loads` | read-heavy troubleshooting views | finance and dispatch mutations |
| DRIVER | `/driver` | driver workflow + assigned tracking flow | ops/admin/finance actions |

---

## 13) Reporting Cadence
- Daily: divergence count, authz incidents, blocked tasks.
- Weekly: gate status, KPI trend, rollout readiness.
- Artifacts:
  - `docs/PHASE1_PASS.md`
  - `docs/STATE_KERNEL_ROLLOUT.md`
  - test command outputs and smoke evidence.

## 14) KPI Tracking (Operational Success)
- Dispatch: median time-to-assign, reassign rate, tracking continuity
- Billing: delivered-to-invoice cycle, manual touches per invoice, dispute rate
- Driver: task completion latency, failed task retries
- Safety: critical compliance open count, time-to-resolution
- Management: trip complete -> invoice sent latency, percent fully in-system workflows
