# UI Form System Checklist

- [x] No placeholder-as-label used for standard inputs/selects/textarea
- [x] Every control has a persistent label (visible or `sr-only` when appropriate)
- [x] Errors render below controls and do not replace labels
- [x] Hints render below controls when no error exists
- [x] `aria-describedby` and `aria-invalid` wired for inputs via FormField
- [x] Checkbox/switch controls have adjacent visible labels
- [x] Keyboard focus visible on all controls
- [x] No Phase 1/2/4 behavior regressions observed in UI-only changes
