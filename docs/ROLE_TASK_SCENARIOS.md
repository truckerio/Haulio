# Role Task Scenarios (Wave 0 Baseline)

Date: March 2, 2026

## Interaction Cost Budgets
- Assign driver to trip: `<= 3` clicks
- Mark stop complete/departed: `<= 2` clicks
- Trigger invoice-ready action: `<= 2` clicks
- Open blocker root cause from row: `<= 1` click
- Start tracking from dispatch: `<= 2` clicks

## Dispatcher / Head Dispatcher
1. Assign driver/truck/trailer to trip.
2. Start tracking and monitor in-transit progress.
3. Resolve blockers and advance stop execution.

Success criteria:
- Complete all three tasks without leaving Dispatch Workbench.
- No visible action that returns known `403`.

## Billing
1. Scan readiness queue.
2. Trigger invoice actions.
3. Record payable/settlement progression context.

Success criteria:
- Spreadsheet-first throughput, minimal context switching.
- Blockers visible at row level.

## Safety
1. Scan compliance and risk flags.
2. Drill into driver/trip issue context.
3. Record safety-note context where allowed.

Success criteria:
- Read-heavy flow with clear severity.
- No finance/dispatch mutation actions visible.

## Support
1. Search entity timeline.
2. Trace issue across dispatch/docs/finance events.
3. Add internal support context where allowed.

Success criteria:
- High timeline fidelity.
- Restricted actions clearly labeled or hidden.

## Driver
1. View current assignment.
2. Complete stop progression actions.
3. Submit required docs/proof.

Success criteria:
- Next action is obvious.
- Low-friction, low-clutter interaction path.

## Admin
1. Inspect cross-domain status.
2. Validate role/capability and drift guardrails.
3. Drill down to operational or finance context.

Success criteria:
- One source of truth for system health.
- No duplicate dashboard confusion.

