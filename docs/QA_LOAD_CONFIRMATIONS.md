# QA checklist: load confirmations + load fields

1) Manual load fields
- Create a load manually and confirm shipper/consignee refs, pallets, and weight show in the UI and invoice PDF.

2) Text-based confirmation PDF
- Upload a text-based confirmation that includes "Pallets: 26" and "Weight: 42,000 lbs" plus shipper/consignee refs.
- Verify status moves to NEEDS_REVIEW or READY_TO_CREATE.
- Confirm the draft is pre-filled with refs, pallets, and weight.
- Create the load and confirm it matches the draft.

3) Idempotent upload
- Upload the same PDF again and verify no duplicate load is created (same doc returned by sha256).

4) Scanned PDF
- Upload a scanned PDF (no extractable text).
- Verify status is NEEDS_REVIEW with message "Scanned PDF: please enter fields manually" and that the draft is editable.
