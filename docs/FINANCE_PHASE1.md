# Finance Phase 1 Plan

## Goals
- Single finance workspace with one receivables board and one payables workspace.
- Backend-only billing readiness logic (frontend stops deriving readiness/status).
- Admin-configurable org finance policy.
- Async/retryable QuickBooks sync state visible per receivable/invoice.
- Backward compatibility for existing billing endpoints and pages.

## Current Dependency Map

### Readiness/status computed today
- Backend canonical logic: `apps/api/src/lib/billing-readiness.ts`
- Backend side-effect recompute on GET:
  - `GET /loads/:id` in `apps/api/src/index.ts`
  - `GET /billing/readiness` in `apps/api/src/index.ts`
- Frontend heuristics (drift source):
  - `apps/web/lib/billing-readiness.ts`
  - `apps/web/lib/load-derivations.ts` (`deriveBillingStatus`, `deriveDocsBlocker`)

### Readiness/status consumed today
- Finance receivables UI: `apps/web/components/finance/ReceivablesPanel.tsx`
  - Uses both `/billing/readiness` and `/billing/queue`
- Load detail billing tab: `apps/web/app/loads/[id]/page.tsx`
- Loads list cards/chips: `apps/web/app/loads/page.tsx`

### Billing/settlement actions today
- Billing queue/invoice/status endpoints in `apps/api/src/index.ts`
- Settlements endpoints in `apps/api/src/index.ts`
- Worker aging tasks: `apps/worker/src/index.ts`

## New Canonical Contracts

### Org Finance Policy
`GET /admin/finance-policy`

```json
{
  "policy": {
    "requireRateCon": "ALWAYS",
    "requireBOL": "NEVER",
    "requireSignedPOD": "DELIVERED_ONLY",
    "requireAccessorialProof": "WHEN_ACCESSORIAL_PRESENT",
    "requireInvoiceBeforeReady": true,
    "requireInvoiceBeforeSend": true,
    "allowReadinessOverride": false,
    "overrideRoles": [],
    "factoringEnabled": false,
    "factoringEmail": null,
    "factoringCcEmails": [],
    "factoringAttachmentMode": "LINK_ONLY",
    "defaultPaymentTermsDays": 30,
    "updatedAt": "2026-02-14T00:00:00.000Z"
  }
}
```

`PUT /admin/finance-policy` (admin only)

```json
{
  "requireRateCon": "BROKERED_ONLY",
  "requireBOL": "DELIVERED_ONLY",
  "requireSignedPOD": "ALWAYS",
  "requireAccessorialProof": "WHEN_ACCESSORIAL_PRESENT",
  "requireInvoiceBeforeReady": true,
  "requireInvoiceBeforeSend": true,
  "allowReadinessOverride": true,
  "overrideRoles": ["ADMIN", "BILLING"],
  "factoringEnabled": true,
  "factoringEmail": "ap@factor.example",
  "factoringCcEmails": ["ops@haulio.local"],
  "factoringAttachmentMode": "ZIP",
  "defaultPaymentTermsDays": 30
}
```

### Finance Receivables
`GET /finance/receivables?limit=25&cursor=<id>&stage=DOCS_REVIEW,READY&blockerCode=POD_MISSING&agingBucket=31_60&qboSyncStatus=FAILED&search=LD-`

```json
{
  "items": [
    {
      "loadId": "cm...",
      "loadNumber": "LD-1203",
      "customer": {
        "id": "cm...",
        "name": "Customer A",
        "billTo": "billing@customer.com"
      },
      "amountCents": 152500,
      "deliveredAt": "2026-02-13T18:00:00.000Z",
      "billingStage": "DOCS_REVIEW",
      "readinessSnapshot": {
        "isReady": false,
        "version": "v2",
        "computedAt": "2026-02-14T00:00:00.000Z",
        "blockers": [
          {
            "code": "MISSING_POD",
            "severity": "critical",
            "message": "Signed POD is required",
            "meta": { "requiredByPolicy": true }
          }
        ]
      },
      "invoice": {
        "invoiceId": null,
        "invoiceNumber": null,
        "invoiceSentAt": null,
        "dueDate": null
      },
      "collections": {
        "daysOutstanding": null,
        "agingBucket": "unknown"
      },
      "integrations": {
        "quickbooks": {
          "syncStatus": "NOT_SYNCED",
          "qboInvoiceId": null,
          "lastError": null,
          "syncedAt": null
        }
      },
      "factoring": {
        "lastSubmission": null
      },
      "actions": {
        "primaryAction": "UPLOAD_POD",
        "allowedActions": ["OPEN_LOAD", "VERIFY_DOCS", "GENERATE_INVOICE"]
      }
    }
  ],
  "nextCursor": "cm...",
  "summaryCounters": {
    "total": 25,
    "ready": 9,
    "blocked": 16
  }
}
```

### Factoring send
`POST /billing/loads/:id/send-to-factoring`

```json
{
  "toEmail": "ap@factor.example",
  "overrideReadiness": false,
  "note": "Urgent same-day funding"
}
```

Response:

```json
{
  "submission": {
    "id": "cm...",
    "status": "SENT",
    "attachmentMode": "ZIP",
    "sentAt": "2026-02-14T00:00:00.000Z"
  }
}
```

### Payables foundation
- `POST /payables/runs`
- `POST /payables/runs/:id/preview`
- `POST /payables/runs/:id/finalize`
- `POST /payables/runs/:id/mark-paid`
- `GET /payables/runs`
- `GET /payables/runs/:id`

Idempotency rule:
- Finalize on already finalized run returns same finalized run + checksum, no duplicate side effects.

## Prisma/Migration Plan

### Org policy fields (on `OrgSettings`)
- `requireRateCon FinanceRequirementMode`
- `requireBOL FinanceRequirementMode`
- `requireSignedPOD FinanceRequirementMode`
- `requireAccessorialProof FinanceRequirementMode`
- `requireInvoiceBeforeReady Boolean`
- `requireInvoiceBeforeSend Boolean`
- `allowReadinessOverride Boolean`
- `overrideRoles Role[]`
- `factoringEnabled Boolean`
- `factoringEmail String?`
- `factoringCcEmails String[]`
- `factoringAttachmentMode FactoringAttachmentMode`
- `defaultPaymentTermsDays Int?`

### Invoice sync fields
- `qboSyncStatus QboSyncStatus`
- `qboInvoiceId String?`
- `qboLastError String?`
- `qboSyncedAt DateTime?`
- `qboSyncAttempts Int`
- `qboLastAttemptAt DateTime?`

### New models
- `BillingSubmission` (immutable factoring submission audit trail)
- `PayableRun`
- `PayableLineItem`
- `SettlementPolicyVersion`

### Optional extension
- `CustomerFinancePolicy` for customer-level overrides.
- Phase 1: add model but keep org-only policy active unless customer override exists.

## Backward Compatibility Rollout

1. Add DB + backend policy reads (defaults preserve current behavior).
2. Add `/finance/receivables` and keep old endpoints as wrappers:
   - `/billing/readiness` wraps canonical rows -> legacy shape
   - `/billing/queue` wraps canonical rows -> delivered/ready/invoiced buckets
3. Move finance UI to canonical endpoint.
4. Stop frontend readiness derivations.
5. Remove GET mutation side effects; recompute on writes + worker reconciliation.
6. Add factoring send action + immutable submission records.
7. Add payables runs foundation while preserving existing settlements endpoints.

## QuickBooks Integration Direction
- Invoice-only one-way sync.
- Async queue via invoice `qboSyncStatus` (`NOT_SYNCED`, `SYNCING`, `SYNCED`, `FAILED`).
- Worker retries failed/not-synced invoices with capped attempts.
- UI shows per-row sync state + latest failure.

## Attachment Mode Recommendation
- Default `LINK_ONLY` to avoid attachment size limits and deliverability issues.
- `ZIP` / `PDFS` supported where recipient mailbox policy allows.

## Saved View Presets (server filters)
- `Urgent`: blockers critical OR aging >= 31 days OR QBO failed.
- `Today`: delivered/ready with due actions today.
- `This Week`: due within 7 days.
- `Waiting`: invoice sent/accepted awaiting payment.
- `Done`: collected/settled.
