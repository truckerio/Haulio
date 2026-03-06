# Trip-Root 5-Year Maturity Plan (Load + Trip Unification)

Last updated: March 3, 2026  
Repository: `demo-truckerio1-phase1`

Command naming reference:
- `docs/PHASE_COMMAND_NAMESPACES.md`

Canonical shipment execution commands:
- `pnpm shipment:phase1`
- `pnpm shipment:phase2`
- `pnpm shipment:phase3`
- `pnpm shipment:phase4`
- `pnpm shipment:phase5`

## 1) Executive Decision

Adopt a trip-root operating model:

- `Trip` is operational truth (dispatch/execution authority).
- `Load` remains commercial and finance truth (AR/AP/invoice/payable integrity).
- UI and API expose a unified `Shipment` experience so users do not manage two separate mental models.

This preserves existing accounting correctness while removing dispatcher workflow fragmentation.

## 2) North-Star Outcomes (by Year 5)

1. Single operational workspace for dispatch actions (trip-root).
2. Finance remains load-accurate with zero reconciliation drift.
3. No visible-action-403 in primary role workflows.
4. Full auditability of every mutation (who, when, from, to, why, source).
5. Stable platform SLOs and low change-failure rate.

## 3) Current Baseline (2026)

From current codebase:

- Domain model already split correctly: `Load`, `Trip`, `TripLoad`.
- Dispatch already has one workbench with `loads` and `trips` lenses.
- Kernel/state enforcement, role capability system, phase smoke suites, and drift checks already exist.

Baseline constraints to preserve:

1. Do not break finance authority objects (`Invoice`, `Settlement`, `PayableRun`, receivables/payables logic).
2. Do not remove multi-load trip capability (consolidation/LTL).
3. Do not break role-based fail-closed behavior.

## 4) Target Architecture (End State)

### 4.1 Product surfaces

- Dispatch Workbench (single top-level for operators)
  - Primary lens: Trips
  - Secondary lens: Loads (contextual/commercial)
  - Shared inspectors: Exceptions, notes, docs, assignment, timeline
- Finance Workbench
  - Receivables/Payables/Journals/Policy from load-level truth
- Safety, Support, Driver, Admin remain role-focused workbenches

### 4.2 Domain authority

- Execution mutations: trip-root command handlers.
- Commercial mutations: load-root command handlers.
- Finance mutations: finance authority objects only.
- Cross-domain writes must pass kernel + policy checks.

### 4.3 API contract

Add unified facade:

- Read: `/dispatch/shipments`
- Commands:
  - `POST /shipments`
  - `PATCH /shipments/:id/commercial`
  - `PATCH /shipments/:id/execution`
  - `POST /shipments/:id/assign`
  - `POST /shipments/:id/status`
  - `POST /shipments/:id/group` (multi-load trip ops)

Existing `/loads` and `/trips` endpoints remain compatibility layer until final cutover.

### 4.4 Audit contract (mandatory)

Every mutation writes immutable audit payload with:

1. actor: user id, role
2. time: UTC timestamp
3. source: route + method + client surface
4. entity and authority: trip/load/finance object
5. `before` and `after` snapshots
6. structured diff of changed fields
7. reason code (if provided)

## 5) Program Plan (5 Years)

## Year 1 (2026): Unify Workflow Without Breaking Core Systems

### Q1

1. Build `ShipmentView` projection for reads (trip + load snapshot).
2. Add `/dispatch/shipments` read endpoint.
3. Keep current endpoints; no destructive migration.

### Q2

1. Trip detail embeds full load-commercial panels.
2. Dispatcher can complete end-to-end tasks from one surface.
3. Add command wrappers for assignment/status/docs from trip context.

### Q3

1. Add dual-write-safe command layer (idempotency required).
2. Introduce shipment command audit schema and timeline integration.
3. Add support runbooks and role task scripts.

### Q4

1. Feature-flag rollout by org and role.
2. Default Dispatch to trip-root shipment workflow.
3. Freeze net-new business logic on legacy direct-write routes.

Year 1 gate:

- 90%+ dispatcher tasks completed inside dispatch workbench.
- No increase in invoice/payable defect rate.

Year 1 completion implementation notes (current):

1. `GET /dispatch/shipments` is the default dispatch read path.
2. Dispatch and trip workbench operator mutations call shipment command routes:
   - `PATCH /shipments/:id/execution`
   - `PATCH /shipments/:id/commercial`
3. Shipment workflow rollout controls are now org/role aware via env:
   - `SHIPMENT_WORKFLOW_ROLLOUT_ENABLED`
   - `SHIPMENT_WORKFLOW_ORGS`
   - `SHIPMENT_WORKFLOW_ROLES`
4. Session payload (`/auth/me`) now exposes workflow rollout state for UI/use-case gating.
5. Legacy trip mutation routes remain backward compatible, but emit adapter telemetry/audit under rollout:
   - `X-Legacy-Route-Adapter` response header
   - `SHIPMENT_LEGACY_ADAPTER_USED` audit action

These close Year 1 rollout/compatibility requirements without breaking existing integrations.

## Year 2 (2027): Consolidate Mutation Spine

### Q1-Q2

1. Route all dispatch mutations through shipment command handlers.
2. Legacy routes become adapters to command layer.
3. Add central policy engine for execution/commercial/finance transitions.

### Q3-Q4

1. Enforce idempotency keys for all write endpoints.
2. Add outbox-driven side effects for notifications/projections.
3. Introduce reconciliation jobs for projection drift.

Year 2 gate:

- 100% operational writes routed through command layer.
- Adapter parity test suite green for all legacy routes.

## Year 3 (2028): Advanced Execution and Network Complexity

### Q1-Q2

1. Promote `ExecutionGroup` semantics for consolidation and multi-stop complexity.
2. Add split/merge/resequence operations in dispatch workbench.
3. Add deterministic conflict handling for concurrent dispatch edits.

### Q3-Q4

1. Constraint-aware planning (capacity, stop windows, risk thresholds).
2. Exception ownership automation across Dispatch/Safety/Support.
3. Enhanced timeline with causality links (triggered-by).

Year 3 gate:

- Multi-load execution operations have deterministic audit + rollback.
- Exception MTTR improved by at least 30% from 2026 baseline.

## Year 4 (2029): Platformization and Ecosystem

### Q1-Q2

1. Publish stable external shipment lifecycle webhooks.
2. Contract-test adapters for telematics/accounting/document ingestion.
3. Introduce versioned API compatibility policy.

### Q3-Q4

1. Tenant-configurable rules and feature bundles.
2. Platform observability and SLO dashboards by workbench.
3. Harden deployment controls (canary, progressive rollout, auto-rollback).

Year 4 gate:

- Integration failures no longer require hotfixing core workflows.
- 99.9% event delivery reliability for critical lifecycle events.

## Year 5 (2030): Autonomous and Predictive Operations

### Q1-Q2

1. AI-assisted queue prioritization and next-best-action suggestions.
2. Predictive risk scoring for ETA/doc/finance blockers.
3. Human-in-the-loop approvals for high-impact automations.

### Q3-Q4

1. Simulation mode for policy changes before production enablement.
2. Automated remediation flows for low-risk repetitive exceptions.
3. Closed-loop optimization using outcome metrics.

Year 5 gate:

- 40%+ repetitive exception workflows assisted or auto-resolved.
- No regression in auditability, compliance, or financial correctness.

## 6) Streams of Work (Parallel)

Run these continuously across all years.

### 6.1 Product + UX

1. Single-workbench role paths.
2. Dense but accessible grids.
3. Visibility of status, errors, and next actions.

### 6.2 Domain + API

1. Command/query separation.
2. Backward-compatible adapters.
3. Versioned contracts and explicit deprecation policy.

### 6.3 Data + Migrations

1. Additive migrations first.
2. Backfill + verify + cutover + cleanup sequence.
3. Reversible migration playbooks for each milestone.

### 6.4 Security + Compliance

1. Capability-gated actions on server and UI.
2. Full audit chain with immutable logs.
3. Least-privilege service credentials and key rotation.

### 6.5 Reliability + Operations

1. SLOs for latency, availability, and event freshness.
2. Alerting on drift, queue backlog, and projection lag.
3. Incident runbooks per command domain.

## 7) No-Loose-Ends Checklist (Definition of Complete)

Every phase must satisfy all items:

1. Architecture doc updated.
2. API contract and compatibility notes updated.
3. Data migration plan + rollback script reviewed.
4. Unit/integration/smoke tests added and passing.
5. Observability added (metrics/logs/alerts).
6. Audit payload reviewed for field completeness.
7. RBAC checks validated by role matrix.
8. UI manual test script completed for core role journeys.
9. Release note and runbook updated.
10. Rollback rehearsed in prod-like environment.

## 8) KPI and SLO Framework

## 8.1 KPI targets

1. Dispatch task completion time: -20% (year 1), -35% (year 3).
2. Misclick/redo rate in dispatch: -30% (year 1).
3. Finance-ready cycle time: -25% (year 2).
4. Visible-action-403 incidents: approach zero by year 1 Q4.
5. Exception MTTR: -30% by year 3.

## 8.2 SLOs

1. Command API availability: 99.9%.
2. P95 mutation latency: < 400ms for core dispatch commands.
3. Projection freshness lag: < 60s (P95).
4. Audit write success: 99.99%.

## 9) Delivery Governance

### 9.1 Cadence

1. Quarterly planning with acceptance gates.
2. Biweekly architecture/risk review.
3. Weekly release readiness check.

### 9.2 Ownership model

1. Product owner: workflow acceptance and KPI outcomes.
2. Platform owner: API contracts, compatibility, SLOs.
3. Data owner: migrations, backfills, reconciliation.
4. UX owner: role workflows and accessibility quality.

## 10) Migration Strategy (Detailed)

1. Shadow read model (`ShipmentView`) on production traffic.
2. Dual-read in UI (old + new), compare silently.
3. Enable new read model by flag for pilot orgs.
4. Introduce command adapters behind existing routes.
5. Shift writes to command layer, keep legacy surface signatures.
6. Decommission direct legacy writes only after parity hold period.

Rollback principle:

- Any cutover must allow same-day rollback by feature flag plus adapter fallback.

## 11) Risk Register and Mitigation

1. Risk: finance drift from operational changes.
   - Mitigation: keep finance authority at load-level, reconciliation job, blocking alerts.
2. Risk: hidden performance regression from projection joins.
   - Mitigation: indexed read models, cache, SLO alerts.
3. Risk: migration deadlocks/data anomalies.
   - Mitigation: additive migrations, small-batch backfill, staged cutover.
4. Risk: operator confusion during transition.
   - Mitigation: in-app training tips, role-based release notes, phased UI toggles.
5. Risk: contract breaks for downstream integrations.
   - Mitigation: versioned adapters and contract tests.

## 12) Release Validation Commands (Current Repo)

Core safety net commands:

```bash
pnpm ci:drift
pnpm ci:kernel:phase3
pnpm demo:smoke
pnpm demo:smoke:roles
pnpm demo:smoke:enforce
pnpm ci:phase10
pnpm ci:phase11
pnpm ci:phase12
pnpm ci:phase13
pnpm ci:phase14
pnpm ci:phase15
```

Long-run validation:

```bash
pnpm stress:full
```

## 13) Immediate Next 90 Days (Actionable Start)

1. Build and expose `/dispatch/shipments` read projection.
2. Add trip-detail embedded load commercial editor.
3. Add shipment command adapters for assign/status/docs.
4. Add unified audit diff helper for shipment commands.
5. Pilot rollout to one org with hard KPI tracking.

## 14) Completion Criteria for "5-Year Maturity Program Defined"

This plan is complete when:

1. A quarterly backlog is created from each yearly section.
2. Each item is mapped to owner + target date + measurable gate.
3. Feature flags and rollback paths are defined for every cutover.
4. KPI and SLO dashboards are set before each phase rollout.
