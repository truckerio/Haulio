# Product Build Journal

## 2026-01-25
- Removed Yard Storage from Ops OS UI and routing. Feature is reserved for Yard OS.
- Decision: Yard Storage belongs to Yard OS (YMS), not Ops OS.
  - Prevent reintroduction of storage UI or yard inventory workflows in Ops OS.
  - Keep schema fields for backward compatibility only.
  - Maintain integration via minimal signals (e.g., trailer availability), not a Storage UI.

## 2026-01-25 (Planned)
- Phase 5: Finance Foundation (planned next).
  - Why: close the loop from delivery → invoice → settlement → payout with auditability.
  - Non-goals: no real ACH, no factoring partner, no card issuing, no ML.
  - Done means: ledger + wallets + holds + payouts + idempotency + audit log, then freeze.

## 2026-02-28
- Phase 5 start: settlement finance-state idempotency hardening.
  - Added explicit settlement transition guards for finalize/paid paths.
  - Added idempotent response behavior for repeated finalize/paid requests.
  - Added pure transition tests under `apps/api/src/lib/settlement-state.test.ts`.
  - Added mock banking adapter payout receipts with idempotency key support on paid transitions.
  - Added immutable double-entry journal builders for payout transitions (`finance-ledger`).
  - Added persistent finance journal store and route wiring for paid mutations (`finance-ledger-store`).
  - Added finance journal schema migration for immutable entry/line persistence.
  - Added read-only finance wallet balances endpoint backed by journal lines (`GET /finance/wallets`).
  - Added wallet write-through tables and materialization helper for paid transitions.
  - Added unified finance hold-policy checks with blocked transition audit events for payable/settlement.
  - Added Phase 5 smoke script covering payout -> journal -> wallet chain with idempotency checks.

## 2026-03-01
- Phase 5 lock hardening:
  - Added payable lifecycle audit actions for finance mutations:
    - `PAYABLE_RUN_CREATED`
    - `PAYABLE_RUN_PREVIEWED`
    - `PAYABLE_RUN_HOLD_APPLIED`
    - `PAYABLE_RUN_HOLD_RELEASED`
    - `PAYABLE_RUN_FINALIZED`
  - Added finance mutation audit contract test to prevent drift (`finance-mutation-audit-contract.test.ts`).
  - Added repeatable Phase 5 gate command: `pnpm ci:phase5`.

- Phase 6 start (observability-first, read-only):
  - Added `GET /finance/journals` with capability guard and org scoping.
  - Added `/finance` Journals tab and read-only journal stream panel with filters.
  - Added journal drilldown drawer with line-level details, metadata preview, and anomaly explanations.
  - Added CSV export for filtered journal stream.
  - Added `/finance` summary rail with wallet snapshot, latest payouts, and journal health flags.
  - Added immutable journal history contract test (`finance-journal-contract.test.ts`).
  - Added web finance journals contract test (`app/finance/finance-journals-contract.test.ts`).
  - Added web finance summary rail contract test (`app/finance/finance-summary-rail-contract.test.ts`).
  - Added phase gate command `pnpm ci:phase6` and `docs/PHASE6_PASS.md`.
  - Added `docs/PHASE6_START.md`.

## 2026-03-02
- Phase 9 start + pass: finance spreadsheet UX principles hardening.
  - Added sortable columns to finance spreadsheet for faster triage scans.
  - Added in-surface summary chips (blocked, ready, amount) and refresh recency signal.
  - Improved table scan hierarchy with sticky stage context and clearer row rhythm.
  - Added Phase 9 finance UX contract test and phase scripts:
    - `demo:smoke:phase9`
    - `ci:phase9`
  - Added docs:
    - `docs/PHASE9_START.md`
    - `docs/PHASE9_PASS.md`

- Phase 10 start + pass: God-level closeout gate.
  - Added consolidated closeout scripts:
    - `demo:smoke:phase10`
    - `ci:phase10`
    - `ci:godlevel:complete`
  - Normalized root smoke/kernel script runners from `exec tsx` to `exec node --import tsx` for runtime compatibility.
  - Updated master execution tracker to include Phase 9 + Phase 10 with done-state evidence.
  - Added docs:
    - `docs/PHASE10_START.md`
    - `docs/PHASE10_PASS.md`

- Phase 11 start + pass: UI consolidation Wave 0 (audit + baseline instrumentation).
  - Added UI consolidation execution report:
    - `docs/GOD_LEVEL_TMS_UI_CONSOLIDATION_REPORT.md`
  - Added Wave 0 audit artifacts:
    - `docs/UI_PRINCIPLES_AUDIT.md`
    - `docs/ROLE_TASK_SCENARIOS.md`
    - `docs/UI_BASELINE_METRICS.md`
  - Added web telemetry baseline runtime and queue utilities:
    - `apps/web/lib/ui-telemetry.ts`
    - `apps/web/components/telemetry/ui-telemetry-runtime.tsx`
  - Mounted telemetry runtime in root web layout.
  - Added Phase 11 contract tests and gates:
    - `apps/web/lib/ui-telemetry.test.ts`
    - `apps/web/app/phase11-telemetry-contract.test.ts`
    - `demo:smoke:phase11`
    - `ci:phase11`

- Phase 12 start + pass: UI consolidation Wave 1 (dispatch state completeness).
  - Added explicit dispatch state handling in `apps/web/app/dispatch/page.tsx`:
    - loading state
    - empty state
    - error + retry state
    - partial-failure warning state
    - refresh visibility state
  - Added dispatch state contract test:
    - `apps/web/app/dispatch/dispatch-phase12-state-contract.test.ts`
  - Added phase gates:
    - `demo:smoke:phase12`
    - `ci:phase12`

- Phase 13 start + pass: UI consolidation Wave 2 (finance state completeness).
  - Hardened summary rail loading path with partial-safe fetch handling (`Promise.allSettled`).
  - Added explicit partial-failure warning state and refresh-state visibility in finance summary.
  - Added stable card heights to reduce layout shift in dense finance scanning mode.
  - Added finance phase contract:
    - `apps/web/app/finance/finance-phase13-state-contract.test.ts`
  - Added phase gates:
    - `demo:smoke:phase13`
    - `ci:phase13`

- Phase 14 start + pass: UI consolidation Wave 3 (safety/support read-heavy hardening).
  - Hardened loads workspace state completeness:
    - loading, error/retry, partial warning, and refresh visibility states.
  - Added explicit fail-closed no-access rendering for non-load-capable roles.
  - Added read-heavy triage snapshot cards for safety/support queues.
  - Added loads phase contract:
    - `apps/web/app/loads/loads-phase14-readheavy-contract.test.ts`
  - Added phase gates:
    - `demo:smoke:phase14`
    - `ci:phase14`

- Phase 15 start + pass: UI consolidation Wave 4 (cross-surface consistency pass).
  - Added shared status semantic map:
    - `apps/web/lib/status-semantics.ts`
  - Applied semantic tone mapping in loads/trips/finance surfaces.
  - Added consistency contracts:
    - `apps/web/lib/status-semantics.test.ts`
    - `apps/web/app/phase15-status-consistency-contract.test.ts`
  - Added phase gates:
    - `demo:smoke:phase15`
    - `ci:phase15`

- Phase 16 start + pass: UI consolidation Wave 5 (final validation + rollout gate).
  - Added final phase gate scripts:
    - `demo:smoke:phase16`
    - `ci:phase16`
  - Bound validation to:
    - `pnpm ci:godlevel:complete`

- Phase 17 start + pass: controlled pilot rollout + stabilization.
  - Added pilot rollout scripts:
    - `demo:smoke:phase17`
    - `ci:phase17`
  - Bound Phase 17 to:
    - `ci:phase16`
    - `demo:smoke`
    - `demo:smoke:roles`
    - `demo:smoke:enforce`
  - Added docs:
    - `docs/PHASE17_START.md`
    - `docs/PHASE17_PASS.md`
