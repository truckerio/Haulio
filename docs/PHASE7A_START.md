# Phase 7A START (Finance Spreadsheet UX Hardening)

Date: March 2, 2026

## Scope Locked
- Keep all existing finance workflows and APIs unchanged.
- Keep capability gating and fail-closed behavior unchanged.
- Improve finance operator efficiency with a denser spreadsheet-first layout.

## Implementation Targets
- Keep finance header compact and keep global activity trigger inside the header card.
- De-emphasize summary rail on spreadsheet tab by placing spreadsheet surface first.
- Keep finance table inside viewport with dense spacing and fixed column geometry.
- Show quick view as right-side pane on standard laptop widths (`xl`).
- Keep command-lane visibility from spreadsheet via lane count snapshot.

## Validation Targets
- Web finance contract tests pass.
- Web typecheck passes.
- API finance tests and typecheck remain green.
