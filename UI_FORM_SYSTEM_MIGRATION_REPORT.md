# UI Form System Migration Report

## Summary
Standardized form controls across apps/web using a shared FormField system with persistent labels, consistent hints/errors, and accessible ids. Added lightweight primitives for textarea/select/checkbox and updated high-traffic pages to remove placeholder-as-label patterns.

## New/Updated UI Primitives
- `apps/web/components/ui/form-field.tsx` — persistent label + hint/error + aria wiring
- `apps/web/components/ui/label.tsx` — consistent label styling
- `apps/web/components/ui/form-row.tsx` — responsive 2-column row helper
- `apps/web/components/ui/textarea.tsx` — styled textarea
- `apps/web/components/ui/select.tsx` — styled native select
- `apps/web/components/ui/checkbox.tsx` — checkbox + CheckboxField wrapper
- `apps/web/components/ui/form-section.tsx` — optional section header

## Migrated Files (high-level)
- Admin: `apps/web/app/admin/page.tsx`
- Loads: `apps/web/app/loads/page.tsx`
- Load detail: `apps/web/app/loads/[id]/page.tsx`
- Load confirmations: `apps/web/app/loads/confirmations/page.tsx`, `apps/web/app/loads/confirmations/[id]/page.tsx`
- Dispatch: `apps/web/app/dispatch/page.tsx`, `apps/web/app/dispatch/legs-panel.tsx`, `apps/web/app/dispatch/manifest-panel.tsx`
- Billing: `apps/web/app/billing/page.tsx`
- Settlements: `apps/web/app/settlements/page.tsx`
- Task Inbox: `apps/web/app/dashboard/page.tsx`
- Auth: `apps/web/app/page.tsx`, `apps/web/app/forgot/page.tsx`, `apps/web/app/reset/[token]/page.tsx`, `apps/web/app/invite/[token]/page.tsx`
- Imports: `apps/web/components/BulkLoadImport.tsx`, `apps/web/components/ImportWizard.tsx`
- Driver portal (notes + file inputs accessibility): `apps/web/app/driver/page.tsx`

## Known Exceptions
- Driver portal file uploads retain custom drop/button UI but now include explicit `aria-label` for the hidden file input. The visible “Upload”/“Upload POD” text serves as the label.

## Accessibility Notes
- All standard inputs/selects/textarea are now paired with labels via FormField.
- Errors/hints are rendered below fields and never replace labels.
- `aria-invalid` and `aria-describedby` are provided by FormField.
- Search inputs use visible labels where possible; where not, labels use `sr-only`.

## Remaining Work
- None identified in apps/web after the global audit scan.
