# UI Principles Audit (Wave 0 Baseline)

Date: March 2, 2026  
Scale: `0 = missing`, `1 = partial`, `2 = strong`

## Screen Coverage
- `/dispatch`
- `/trips/[id]`
- `/loads/[id]`
- `/finance`

## Roles Covered
- DISPATCHER
- HEAD_DISPATCHER
- BILLING
- SAFETY
- SUPPORT
- DRIVER
- ADMIN

## Principle Groups
1. Status visibility
2. Real-world language
3. Error prevention/recovery
4. Recognition over recall
5. Efficiency and interaction cost
6. Visual hierarchy and scan density
7. Accessibility/focus/keyboard
8. Consistency/system familiarity
9. Read-heavy vs mutation-heavy separation
10. Capability fail-closed behavior

## Scorecard (Current Baseline)

| Screen | Role focus | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | Total / 20 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `/dispatch` | DISPATCHER/HEAD_DISPATCHER | 2 | 2 | 1 | 2 | 1 | 2 | 1 | 1 | 1 | 2 | 15 |
| `/trips/[id]` | DISPATCHER/HEAD_DISPATCHER | 2 | 2 | 1 | 2 | 1 | 2 | 1 | 1 | 1 | 2 | 15 |
| `/loads/[id]` | DISPATCHER/BILLING | 2 | 2 | 1 | 1 | 1 | 2 | 1 | 1 | 1 | 2 | 14 |
| `/finance` | BILLING/ADMIN | 2 | 2 | 1 | 2 | 2 | 2 | 1 | 2 | 2 | 2 | 18 |
| `/dispatch` (read-only pass) | SAFETY/SUPPORT | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 2 | 12 |
| `/driver` | DRIVER | 1 | 2 | 1 | 2 | 1 | 1 | 1 | 1 | 1 | 2 | 13 |

## Highest-Impact Gaps (Ranked)

1. Dispatch efficiency + interaction-cost budget is not explicitly enforced.
2. Accessibility/focus consistency varies across dense table controls.
3. Read-heavy role surfaces (Safety/Support) need stronger scan-first alignment.
4. Error/partial-failure state patterns need explicit parity across all workbenches.
5. Cross-surface consistency of command zones and status semantics needs contract hardening.

## Wave Priorities Derived

1. Wave 1: Dispatch workbench interaction-cost and state-completeness hardening.
2. Wave 2: Finance keeps spreadsheet dominance and strengthens WCAG/focus parity.
3. Wave 3: Safety/Support read-heavy surfaces and restricted-action clarity.
4. Wave 4: Global consistency pass (status semantics, command zones, state shells).

