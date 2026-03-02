# God-Level TMS UI Consolidation Report

## 1) Purpose and Scope

This report defines the end-state UI strategy and execution plan for Haulio based on:

- the current Phase 1-10 implementation direction,
- the role/capability model already in the product,
- user feedback patterns from TMS review ecosystems,
- and core usability/UI principles.

This is a UI/IA and execution report only.

- No business workflow rewrites are introduced.
- Dispatch remains trip-first execution authority.
- Load remains commercial authority.
- Finance remains receivables/payables/journals authority.

## 2) Key Decision: Workbench Consolidation

### Decision
Use **role-centered workbenches** as primary navigation, not multiple parallel top-level operational pages.

### Why
Across industry review signals, users consistently want:

- fewer hops,
- one dense operational board per function,
- clear action priority,
- and less duplicate context.

### Top-level workbench model

1. Dispatch Workbench
2. Finance Workbench
3. Safety Workbench
4. Support Workbench
5. Driver Workspace
6. Admin Workspace

For dispatch users, `Trips`, `Loads`, and operational queue views are **lenses inside one Dispatch Workbench**, not competing top-level destinations.

## 3) External Signal Summary (What users repeatedly ask for)

Sources reviewed:

- GetApp dispatch/TMS category pages
- G2 review threads and product review summaries
- Industry TMS role responsibility references

Reference links:

- https://www.getapp.com/transportation-logistics-software/transportation-management/f/dispatch-management/
- https://www.getapp.com/transportation-logistics-software/transportation-dispatch/f/dispatch-management/
- https://www.g2.com/products/trucker-tools/reviews
- https://www.techtarget.com/searcherp/definition/transportation-management-system-TMS

Pattern summary:

- Dispatch: real-time visibility, fewer check calls, fast reassignment.
- Billing/Finance: queue-style spreadsheet workflows, reduced manual touches, accounting clarity.
- Drivers: simple and low-friction flows.
- Safety: alert-driven compliance context with clear drill-down.
- Support: read-heavy, full timeline, minimal mutation controls.
- Managers/Admin: one source of truth and high-confidence status at a glance.

## 4) Principles to Apply

### 4.1 Usability and UX principles

1. Nielsen heuristics
2. WCAG POUR and measurable accessibility checks
3. Visual hierarchy fundamentals
4. Gestalt grouping principles
5. Decision/cognitive laws: Fitts, Hick, Jakob, Tesler, Doherty
6. Responsive summary-detail behavior
7. Functional motion only
8. Read-heavy vs mutation-heavy separation

### 4.2 Practical interpretation for Haulio

- Every screen has one dominant task mode.
- High-frequency actions are above fold.
- Hidden state is minimized; status is always visible.
- Role-incompatible actions are not rendered.
- Dense default where users scan tables/queues all day.

## 5) IA and Navigation Blueprint

## 5.1 Primary nav by role

- DISPATCHER / HEAD_DISPATCHER -> Dispatch Workbench
- BILLING -> Finance Workbench
- SAFETY -> Safety Workbench
- SUPPORT -> Support Workbench
- DRIVER -> Driver Workspace
- ADMIN -> Admin Workspace

### 5.2 Secondary nav

Lower-frequency pages are moved under secondary menus, not promoted as primary work surfaces.

Secondary workflows must remain discoverable within one click from their owning workbench.

## 6) Detailed UI Behavior by Workbench

## 6.1 Dispatch Workbench (Trip-first)

### Purpose
Single execution cockpit for assignment, live tracking, exceptions, and stop progression.

### Structure

- Top: dense command/filter row (search, status, assignee, exception severity, date range)
- Center: primary execution grid (trip rows by default)
- Right rail (optional/persistent): selected row context (assignment, tracking, blockers, docs)
- Lens switcher inside same surface: `Trips` (default), `Loads` (secondary), `Exceptions`

### Rules

- Trips are operational authority.
- Load lens never overrides trip authority.
- Assignment and start/stop tracking remain capability-gated.
- Notes, stops, appointment windows remain always visible in detail context.
- Lens switching must preserve active filters and selection context by default.
- Lens command availability must stay consistent with capabilities and not shift unexpectedly per lens.

## 6.2 Trip Detail (Execution cockpit)

### Layout

- Left: stop chain and appointment windows (always visible)
- Center: notes + activity stream (always visible)
- Right: command rail (assignment, docs/POD, tracking, financial snapshot, blockers)

### Interaction

- No accordion hiding for critical execution info.
- Status and blockers are visible without tab switching.
- Mutation actions shown only if capability present.

## 6.3 Load Detail (Commercial container)

### Layout

- Overview retains existing actions/engine
- Stops and notes always visible in primary region
- Existing right rail retained

### Interaction

- No functional rewrite.
- Commercial and billing readiness context remains clear.

## 6.4 Finance Workbench (Spreadsheet-first)

### Purpose
Primary billing/payables/journals workspace optimized for queue throughput.

### Structure

- Header card: compact title + global activity icon placement (same drawer behavior)
- Summary rail: wallet/payout/journal health
- Main: dense spreadsheet grid (default mode only)
- Inline row expansion/preview details integrated in grid (not duplicated in separate panel)

### Controls

- Persistent filters
- Sorting
- Pagination
- Bulk actions
- Fullscreen icon-only toggle for max grid focus

### Rules

- Quick view context merged into spreadsheet interactions.
- Duplicate context panels removed when they repeat table content.
- Readiness/blockers are visible at row level.

## 6.5 Safety Workbench

### Purpose
Compliance and risk scan surface.

### Structure

- Risk table with color severity
- Expiration and HOS/compliance alert grouping
- Drill-down links to trip/load/driver context

### Rules

- Mostly read-heavy controls.
- No finance mutations.
- No dispatch reassignment mutations unless explicitly allowed.

## 6.6 Support Workbench

### Purpose
Troubleshooting and timeline investigation with broad visibility.

### Structure

- Search-first timeline and event stack
- Entity pivot: load/trip/driver/customer
- Restriction-aware action area

### Rules

- Read-heavy by default.
- Internal notes allowed where capability permits.
- Operational/finance mutations hidden unless capability explicitly present.

## 6.7 Driver Workspace

### Purpose
Minimal friction, next-action clarity.

### Structure

- Current task card
- Stop/task progression
- Simple proof/doc submission points

### Rules

- Large targets
- Low complexity
- Clear success/error state text

## 6.8 Admin Workspace

### Purpose
System health, governance, and high-level oversight.

### Rules

- Cross-domain summary with drill-down
- No duplicate dashboards that mirror other workbenches without added value

## 7) Cross-Cutting UI System Rules

1. Dense mode default for dispatch/finance/safety/support tables.
2. Consistent status chip semantics across workbenches:
   - Red = blocked/risk
   - Amber = attention required
   - Blue = informational
   - Green = complete/ready
   - Grey = neutral/unknown
3. One primary CTA per region; secondary actions demoted visually.
4. Always-visible system status and last-refresh indication where needed.
5. Keyboard and focus order must support core workflows.
6. Global activity drawer remains unchanged functionally; only placement is optimized in header cards.
7. No “action exists but 403” UI paths.
8. Command zones must be consistent between center and right rail; no duplicated decision points.

## 8) Capability and Authorization Alignment

- UI gating source: `apps/web/lib/capabilities.ts`
- Backend auth source: capability helpers and policy checks

### Required guarantees

1. Canonical roles only:
   - ADMIN
   - DISPATCHER
   - HEAD_DISPATCHER
   - BILLING
   - DRIVER
   - SAFETY
   - SUPPORT
2. DISPATCHER and HEAD_DISPATCHER execution parity remains intact.
3. SAFETY and SUPPORT do not gain finance/dispatch mutation actions accidentally.
4. Fail-closed behavior on unexpected 403 remains enabled.

## 9) Implementation Board (Execution Order)

## Wave 0: Audit + baseline

- Build role-by-role audit matrix and score major screens.
- Capture baseline metrics: completion time, misclicks, backtracks, help-needed.

## Wave 1: Dispatch consolidation hardening

- Keep one Dispatch Workbench with trip-first default.
- Ensure load/trip/exception are lenses, not competing top-level workflows.

## Wave 2: Finance spreadsheet hardening

- Keep single dense spreadsheet as dominant finance surface.
- Merge duplicated quick-view data into row-level spreadsheet context.
- Maintain fullscreen icon-only toggle.

## Wave 3: Safety and Support optimization

- Enforce read-heavy layouts with clear risk/timeline context.
- Keep mutation controls capability-gated.

## Wave 4: Global consistency pass

- Header compactness and activity icon placement consistency.
- Status chips, spacing, type scale, focus behavior consistency.

## Wave 5: Validation and rollout

- Run full test and smoke gates.
- Pilot rollout and monitor task metrics.

## 10) Testing and Validation Gates

## 10.1 Automated checks

- `pnpm --filter @truckerio/api run test:authz`
- `pnpm --filter @truckerio/api run test:kernel`
- `pnpm --filter @truckerio/web run test:capabilities`
- `pnpm --filter @truckerio/web run typecheck`
- `pnpm demo:smoke`
- `pnpm stress:full`

## 10.2 Manual role smoke checks

For each role, confirm:

1. Landing route is correct.
2. Primary workbench is clear and actionable.
3. No ineligible action appears.
4. Core daily task can be completed without docs/help.

## 10.3 KPI targets

- Task completion time: improve >= 20%
- Misclick/backtrack: reduce >= 30%
- Visible-action 403 attempts: near zero
- “Need help to complete task”: reduce >= 40%

## 11) UX Quality Scorecard Template

Per major screen, score 0-2 for each category:

1. Status visibility
2. Real-world language and labels
3. Undo/recoverability
4. Consistency
5. Error prevention
6. Recognition over recall
7. Efficiency of use
8. Minimalist signal-to-noise
9. Clear error recovery
10. Help discoverability
11. Accessibility checks
12. Dense scan readability

Priority = `(2 - score) x task frequency x role criticality`.

## 12) Definition of Done

This consolidation is complete when:

1. Primary IA is workbench-based and role-aligned.
2. Dispatch is one consolidated trip-first workbench with load lens inside.
3. Finance is one dominant spreadsheet workbench without duplicated context panes.
4. Safety and Support are read-heavy and capability-correct.
5. UI follows the listed principles with measurable score improvement.
6. All quality gates pass without business logic regression.

## 13) Enforcement Clause: State Completeness Mandate

Every workbench screen must explicitly implement and visually differentiate:

1. Loading state
2. Empty state
3. Error state
4. Partial failure state
5. Permission-restricted state
6. Refresh/retry state

No silent fallbacks are allowed.

## 14) Enforcement Clause: Performance Envelope

Dispatch and Finance workbenches must stay inside this envelope:

1. Perceived interaction feedback under 400ms for primary operations.
2. No avoidable layout shift during filter/sort/pagination updates.
3. Prefer skeletons over blocking spinners for grid refreshes.
4. Keep column resize/reflow stable while data refreshes.

## 15) Enforcement Clause: Interaction Cost Budget

Max click budget for top task paths (desktop):

1. Assign driver to trip: <= 3 clicks
2. Mark stop complete/departed: <= 2 clicks
3. Move invoice-ready item to action trigger: <= 2 clicks
4. Open blocker root cause from workbench row: <= 1 click
5. Start tracking from dispatch context: <= 2 clicks

Any regression beyond budget requires explicit sign-off.

## 16) Execution Risk Controls

1. Over-consolidation control:
   - Keep primary views dense, but preserve one-click discoverability for secondary flows.
2. Right-rail drift control:
   - No duplicate context if data is already visible in main grid.
   - Mutations remain in one canonical action zone.
3. Spreadsheet compression control:
   - Preserve minimum readable row height and clear text hierarchy.
4. Lens ambiguity control:
   - Trips, Loads, Exceptions must behave as views over one shared system state.
   - Lens switching cannot reset filters unless user requests reset.
