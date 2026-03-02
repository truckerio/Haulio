# Phase 11 START (UI Consolidation Wave 0: Audit + Baseline Instrumentation)

Date: March 2, 2026

## Scope Locked
- No dispatch/billing/docs/tracking workflow rewrites.
- No authority model changes.
- No role model expansion.
- Instrument and score current UI before Wave 1 consolidation edits.

## Objectives
1. Publish a role-by-role UI principles audit for major workbench surfaces.
2. Publish explicit role task scenarios and interaction budgets.
3. Add lightweight UI telemetry baseline instrumentation (page-view and event queue).
4. Add Phase 11 CI/smoke gates.

## Deliverables
- `docs/UI_PRINCIPLES_AUDIT.md`
- `docs/ROLE_TASK_SCENARIOS.md`
- `docs/UI_BASELINE_METRICS.md`
- `apps/web/lib/ui-telemetry.ts`
- `apps/web/components/telemetry/ui-telemetry-runtime.tsx`
- `apps/web/app/phase11-telemetry-contract.test.ts`
- `apps/web/lib/ui-telemetry.test.ts`

## Commands Targeted
```bash
pnpm demo:smoke:phase11
pnpm ci:phase11
```

