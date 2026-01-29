# Phase 4 — Driver Finance UI Report

Date: 2026-01-25

## Summary
Driver Finance UI is implemented as a read-only view aligned with Driver Ops. No new money logic, payouts, or finance systems were added. Blockers deep-link to Driver Ops anchors for fix actions.

> Note: `DRIVER_OPS_UI_HANDOFF.md` was referenced in requirements but is not present in the repo. Changes were aligned to `DRIVER_OPS_CURRENT_STATE_REPORT.md`, `PHASE4_DRIVER_OPS_CONTRACT.md`, and `DRIVER_OPS_PROPOSED_FINAL.md`.

## Routes added/updated
- **Added**: `/driver/pay` — Pay Home
  - File: `apps/web/app/driver/pay/page.tsx`
- **Updated**: `/driver/settlements` — clarity + driver-friendly labels
  - File: `apps/web/app/driver/settlements/page.tsx`
- **Added**: `/driver/settlements/[id]` — Settlement detail (read-only)
  - File: `apps/web/app/driver/settlements/[id]/page.tsx`
- **Updated**: `/driver` — anchors for docs/tracking/compliance/pay and anchor highlighting
  - File: `apps/web/app/driver/page.tsx`

## Data sources used
- `GET /driver/current` — load + driver profile (existing)
- `GET /driver/earnings` — estimated pay/miles (existing)
- `GET /settlements?status=ALL&groupBy=none` — list for preview + pending counts (existing)
- `GET /settlements/:id` — detail (existing)
- `GET /tracking/load/:id/latest` — tracking status for blocker detection (existing)

No new endpoints were added.

## Blockers + deep links
Blocker codes and deep links are computed in the Driver Pay UI:
- **POD_MISSING** → `/driver#docs` (CTA: Upload POD)
- **DOC_REJECTED** → `/driver#docs` (CTA: Re-upload document)
- **TRACKING_OFF** → `/driver#tracking` (CTA: Enable tracking)
- **COMPLIANCE_EXPIRED** → `/driver#compliance` (CTA: Review compliance)
- **SETTLEMENT_NOT_FINAL** → no CTA (informational)

## UI sections
### /driver/pay
- Header: “Pay — Weekly summary and what’s holding pay”
- Pay Snapshot card (estimated pay, miles, pending count, last paid)
- Blockers section (blocking/warning/info)
- Recent Settlements preview + “View all” CTA

### /driver/settlements
- Header + status/date filters
- Settlement rows with driver-friendly status chips (Processing/Ready/Paid)
- “Why pending?” link to `/driver/pay#blockers`

### /driver/settlements/[id]
- Header + status chip
- Net pay summary
- Earnings and Deductions (if present)
- Loads included list

### /driver
- Anchors added: `#docs`, `#tracking`, `#compliance`, `#pay`
- Anchor highlight ring on navigation
- Map preview placeholder added in Stops card (text-only, no external map)

## Files changed
- `apps/web/app/driver/page.tsx`
- `apps/web/app/driver/pay/page.tsx` (new)
- `apps/web/app/driver/settlements/page.tsx`
- `apps/web/app/driver/settlements/[id]/page.tsx` (new)
- `apps/web/components/driver/driver-shell.tsx` (new)
- `apps/web/components/driver/blocker-card.tsx` (new)
- `apps/web/components/driver/pay-snapshot-card.tsx` (new)
- `apps/web/components/driver/settlement-preview-list.tsx` (new)
- `apps/web/components/driver/money-amount.tsx` (new)
- `apps/web/components/driver/driver-status-chip.tsx` (new)
- `apps/web/components/driver/inline-helper.tsx` (new)

## Notes / constraints
- No new finance logic, payouts, or settlement mutations were introduced.
- Blockers are derived from existing driver/load/tracking data; no new DB fields.
- Map preview is text-only due to lack of coordinate data/keys.

