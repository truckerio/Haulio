# State Authority Matrix (Phase A)

Last updated: February 27, 2026

## 1) Objective
Clarify which entity owns which state domain, and where mutation intent should be routed.

## 2) Authority Matrix

| Domain | Primary Authority | Secondary/Derived Objects | Notes |
|---|---|---|---|
| Execution | Trip | Load (mirrored execution signal) | Trip is source of execution truth. |
| Commercial | Load | TripLoad links | Load owns customer/rate/commercial context. |
| Documents | Load/Stop docs | Billing readiness surfaces | Doc quality gates finance progression. |
| Finance (AR/AP) | Invoice / Settlement / PayableRun | Load finance snapshot | Financial authority objects own mutation history. |
| Compliance | Driver/Asset compliance records | Trip/Load risk surfaces | Compliance affects execution eligibility. |

## 3) Mutation Routing Rules (Target)

1. Execution status mutations should originate from trip authority paths.
2. Commercial field mutations should originate from load authority paths.
3. Finance lifecycle mutations should originate from finance authority paths.
4. Cross-domain updates should pass through kernel/invariant checks before commit.

## 4) Current Bridge State (Phase A)
- Existing endpoints remain behavior-compatible.
- Kernel module is introduced as shared contract + shadow comparator.
- Legacy status transitions stay intact while transition kernel is integrated incrementally.

## 5) Drift Controls
- Forbid ad-hoc status mutation logic from diverging across handlers.
- Use transition/kernel helpers for new mutation paths.
- Add tests for:
  - transition legality
  - invariant violations
  - legacy-vs-kernel shadow parity

## 6) Enforcement Phases
- Phase A: define contract + shadow scaffolding.
- Phase B/C: route high-risk mutation endpoints through kernel.
- Later phases: enforce kernel transition path by default and remove legacy direct writes.

