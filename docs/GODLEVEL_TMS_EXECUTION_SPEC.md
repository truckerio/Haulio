# God-Level TMS Execution Spec

Last updated: February 27, 2026

## 1) Scope
This document defines implementation targets for carrier-first consolidation in this repository without changing core business workflows.

Core rules:
- Trip remains execution authority.
- Load remains commercial authority.
- Finance objects remain billing/settlement authority.
- Authorization and UI visibility must stay capability-first and fail-closed.

## 2) File-Level Targeting

### 2.1 State consolidation (API)
- `apps/api/src/lib/state-kernel/**`
  - kernel state types, transition rules, invariants, and shadow compare.
- `apps/api/src/index.ts`
  - mutation route integration points and shadow hooks.
- `docs/STATE_KERNEL_SPEC.md`
  - kernel contract.
- `docs/STATE_AUTHORITY_MATRIX.md`
  - domain authority definition.
- `docs/STATE_KERNEL_ROLLOUT.md`
  - runtime rollout mechanics and gates.

### 2.2 Role/capability control plane
- `packages/db/prisma/schema.prisma`
  - canonical role enum.
- `apps/api/src/lib/authz/capabilities.ts`
  - backend role -> capability map.
- `apps/api/src/index.ts`
  - capability-based route guards.
- `apps/web/lib/capabilities.ts`
  - frontend capability source of truth.
- `apps/web/components/auth/user-context.tsx`
  - capability hydration for UI.

### 2.3 Dispatch workbench (trip-first)
- `apps/web/app/dispatch/page.tsx`
  - workspace defaulting, trips-first behavior, inspector interactions.
- `apps/web/components/dispatch/TripsWorkspace.tsx`
  - trip-focused operational board.
- `apps/web/components/dispatch/WorkbenchRightPane.tsx`
  - command rail and execution actions.

### 2.4 Load detail surface
- `apps/web/app/loads/[id]/page.tsx`
  - overview organization, always-visible stops/notes, right rail retention.

### 2.5 Trip execution cockpit
- `apps/web/app/trips/[id]/page.tsx`
  - stops, notes, timeline, assignment/docs/tracking/settlement rail.

### 2.6 Navigation + landing
- `apps/web/components/app-shell.tsx`
  - role-based nav sections and secondary grouping.
- `apps/web/app/(auth)/post-login/page.tsx`
  - post-login role landing.
- `apps/web/app/(auth)/login/login-client.tsx`
  - role-aware redirect on login success.

## 3) Phase Gates

### Gate A: Capability parity and role trust
Done means:
- Backend authz parity tests pass.
- Frontend capability tests pass.
- No UI action shown that predictably 403s for canonical roles.

Verification:
- `pnpm --filter @truckerio/api run test:authz`
- `pnpm --filter @truckerio/web run test:capabilities`

### Gate B: State kernel shadow baseline
Done means:
- Kernel unit tests pass.
- Shadow logging is active with no request regressions.
- Divergence logs queryable by org and route.

Verification:
- `pnpm --filter @truckerio/api run test:kernel`
- audit SQL in `docs/STATE_KERNEL_ROLLOUT.md`

### Gate C: Surface consolidation baseline
Done means:
- Dispatch defaults to trips workspace for dispatch roles in carrier/both mode.
- Trip detail and load overview maintain always-visible execution-critical sections.
- Navigation keeps dispatch role focus with non-core pages in secondary grouping.

Verification:
- route smoke checks by role across `/dispatch`, `/trips/[id]`, `/loads/[id]`, `/finance`.

### Gate D: Controlled enforce pilot
Done means:
- Shadow divergence on high-traffic routes is triaged and stable.
- `STATE_KERNEL_ENFORCE=true` validated on controlled org scope.
- Rollback verified through flag disable.

Verification:
- runtime toggles and rollback steps in `docs/STATE_KERNEL_ROLLOUT.md`.

## 4) Workbench UI Specs

## 4.1 Dispatch Workbench (Trip-first)
Layout:
- Dense grid + inspector model with trip workspace as default for dispatch roles.
- Operational scan data above fold: assignment, stop timing, exceptions, tracking state.

Interaction rules:
- Primary action set is capability-gated.
- Mutation controls hidden or marked restricted when capability missing.
- Trip remains control surface; nested loads are contextual details.

## 4.2 Finance Workbench
Layout:
- Queue-first receivables table with blockers, readiness, sync state, and actions.
- Bulk actions remain explicit and permission-gated.

Interaction rules:
- Billing actions visible to finance-capable roles only.
- No dispatch execution controls in finance workspace.

## 4.3 Safety Workbench (read-focused baseline)
Layout:
- Read-priority visibility into loads/trips/driver context.
- Compliance signals visible without exposing finance or dispatch mutation controls.

Interaction rules:
- Write controls restricted unless explicitly capability-enabled.
- Timeline/notes visibility allowed where policy supports read-only troubleshooting.

## 4.4 Support Workbench (read-focused baseline)
Layout:
- Cross-domain troubleshooting visibility (dispatch/docs/tracking/billing states).
- Emphasis on search/history/context over mutation controls.

Interaction rules:
- Internal-note style interactions only where capability explicitly allows.
- No assignment/billing mutation controls exposed.

## 5) Migration Mechanics

### 5.1 Shadow mode
- Keep legacy mutation paths active.
- Run kernel in parallel and compare post-state.
- Emit `STATE_KERNEL_DIVERGENCE` audit entries on mismatch.

### 5.2 Divergence logging
- Audit model is source of truth for mismatches.
- Track route + method + state domain diff keys in metadata.
- Prioritize high-frequency mutation routes first.

### 5.3 Enablement sequence
1. Shadow on, enforce off.
2. Observe divergence by org/route.
3. Triage and close drift.
4. Pilot enforce for controlled scope.
5. Expand enforce after stable parity.

### 5.4 Rollback
- Immediate rollback: `STATE_KERNEL_ENFORCE=false`.
- Keep shadow and divergence logging enabled for diagnosis.

## 6) Test and Parity Checklist

API:
- `pnpm --filter @truckerio/api run test:kernel`
- `pnpm --filter @truckerio/api run test:authz`
- `pnpm --filter @truckerio/api exec node --import tsx src/modules/dispatch/queue-view.test.ts`

Web:
- `pnpm --filter @truckerio/web run test:capabilities`
- `pnpm --filter @truckerio/web run typecheck`

Manual:
- Role landing and nav visibility checks.
- Dispatch/load/trip panel visibility checks by capability.
- Kernel divergence query checks after mutation traffic.
