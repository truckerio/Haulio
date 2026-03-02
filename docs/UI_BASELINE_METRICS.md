# UI Baseline Metrics (Wave 0)

Date: March 2, 2026

## Instrumentation Source
- Client event queue: `apps/web/lib/ui-telemetry.ts`
- Runtime hook: `apps/web/components/telemetry/ui-telemetry-runtime.tsx`
- Storage key: `haulio:ui-telemetry:v1`

## Captured Baseline Event Types
- `page_view`
- `task_start`
- `task_complete`
- `task_error`
- `misclick`
- `backtrack`
- `help_needed`
- `restricted_hidden`

## Manual Collection Protocol
1. Open app in browser with target role account.
2. Perform top three role tasks from `docs/ROLE_TASK_SCENARIOS.md`.
3. Inspect local queue in DevTools:
   - `JSON.parse(localStorage.getItem("haulio:ui-telemetry:v1") || "[]")`
4. Record completion time, errors, misclicks, backtracks.

## Baseline Table Template

| Role | Task | Runs | Median time | Error rate | Misclick rate | Backtrack rate | Help-needed rate |
|---|---|---:|---:|---:|---:|---:|---:|
| DISPATCHER | Assign trip resources | 5 | TBD | TBD | TBD | TBD | TBD |
| DISPATCHER | Start tracking | 5 | TBD | TBD | TBD | TBD | TBD |
| BILLING | Invoice readiness action | 5 | TBD | TBD | TBD | TBD | TBD |
| SAFETY | Resolve compliance drill-down | 5 | TBD | TBD | TBD | TBD | TBD |
| SUPPORT | Troubleshoot timeline path | 5 | TBD | TBD | TBD | TBD | TBD |
| DRIVER | Stop progression action | 5 | TBD | TBD | TBD | TBD | TBD |

## Notes
- Wave 0 establishes collection and scoring structure.
- Wave 1+ will fill measured deltas against this template.

