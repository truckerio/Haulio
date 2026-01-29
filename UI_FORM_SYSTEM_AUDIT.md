# UI Form System Audit

Date: 2026-01-25

## Summary
This audit lists all UI controls found under `apps/web` and flags consistency/accessibility issues per file.

Legend:
- A) OK (has persistent label)
- B) Fix (placeholder-as-label)
- C) Fix (missing htmlFor/id)
- D) Fix (no error/hint support)
- E) Fix (checkbox/switch missing visible label)

## Findings by file

- `apps/web/app/billing/page.tsx`
  - Controls: multiple `<input>` and `<textarea>` fields for reject reasons and invoice status updates.
  - Issues: B, C, D (placeholders used as labels; no consistent label/id; inconsistent error/hint).

- `apps/web/app/dashboard/page.tsx`
  - Controls: search input + status/priority/type selects + assignment select.
  - Issues: B, C, D (placeholder-as-label on search; selects lack labels; no hint/error structure).

- `apps/web/app/today/page.tsx`
  - Controls: admin scope segmented control only (no explicit label).
  - Issues: C (needs visible label or aria-label in a form system).

- `apps/web/app/loads/page.tsx`
  - Controls: search input, refine panel selects, create load form inputs, filters.
  - Issues: B, C, D (widespread placeholder-as-label, missing explicit labels, no standard error/hint).

- `apps/web/app/loads/[id]/page.tsx`
  - Controls: select/input for freight, upload/verify sections, etc.
  - Issues: B, C, D (placeholder-as-label in freight fields; missing consistent label system).

- `apps/web/app/loads/confirmations/page.tsx`
  - Controls: file input.
  - Issues: C, D (missing explicit label and consistent hint/error).

- `apps/web/app/loads/confirmations/[id]/page.tsx`
  - Controls: multiple Inputs/select for draft fields and stops.
  - Issues: B, C, D (placeholder-as-label; no form system).

- `apps/web/app/dispatch/page.tsx`
  - Controls: driver dropdown button, multiple selects, search/filter inputs, stop updates.
  - Issues: B, C, D, E (placeholder-as-label; missing labels; checkbox lacks label wrapper).

- `apps/web/app/dispatch/legs-panel.tsx`
  - Controls: selects + inputs + checkbox.
  - Issues: B, C, D, E (missing labels; placeholder-as-label; checkbox label not standardized).

- `apps/web/app/dispatch/manifest-panel.tsx`
  - Controls: multiple selects + inputs.
  - Issues: B, C, D (placeholders used as labels).

- `apps/web/app/admin/page.tsx`
  - Controls: extensive settings, operating entity, customer, driver forms.
  - Issues: B, C, D, E (placeholder-as-label; missing explicit labels; checkboxes without standardized labels).

- `apps/web/app/settlements/page.tsx`
  - Controls: select + date inputs + filters.
  - Issues: B, C, D (placeholder-as-label; no standard label structure).

- `apps/web/components/BulkLoadImport.tsx`
  - Controls: file inputs + checkbox.
  - Issues: C, D, E (missing label; checkbox not standardized).

- `apps/web/components/ImportWizard.tsx`
  - Controls: file input + textarea.
  - Issues: B, C, D (placeholder-as-label; missing labels).

- `apps/web/app/driver/page.tsx`
  - Controls: inputs + textarea.
  - Issues: B, C, D (placeholder-as-label; missing labels).

- `apps/web/app/page.tsx`, `apps/web/app/forgot/page.tsx`, `apps/web/app/invite/[token]/page.tsx`, `apps/web/app/reset/[token]/page.tsx`
  - Controls: login/invite/reset inputs using placeholders as labels.
  - Issues: B, C, D.

- `apps/web/components/app-shell.tsx`
  - Controls: navigation search input (placeholder-as-label).
  - Issues: B, C (needs visible or sr-only label with id).

## Next steps
- Implement FormField system and migrate all controls to use labels + consistent hint/error rendering.
- Replace placeholder-as-label with example placeholders.
- Ensure every control has id/htmlFor and aria-describedby/aria-invalid when errors exist.
