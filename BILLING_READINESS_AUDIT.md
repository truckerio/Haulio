# Billing Readiness Audit

## Scope
Audit of billing-related models, API routes, UI pages, and worker jobs, plus a record of the Billing Readiness implementation added in Phase B.

## What existed before Phase B

### Data models (Prisma)
- `Document` with `DocType` = POD, RATECON, BOL, LUMPER, SCALE, DETENTION, OTHER; `DocStatus` = UPLOADED/VERIFIED/REJECTED. (`packages/db/prisma/schema.prisma`)
- `LoadCharge` with accessorial-like types (LINEHAUL, LUMPER, DETENTION, LAYOVER, OTHER, ADJUSTMENT). (`packages/db/prisma/schema.prisma`)
- `Invoice` + `InvoiceLineItem` with status tracking. (`packages/db/prisma/schema.prisma`)
- `Settlement` + `SettlementItem`. (`packages/db/prisma/schema.prisma`)
- `Load` status-driven billing milestones (`READY_TO_INVOICE`, `INVOICED`, `PAID`) and `podVerifiedAt`. (`packages/db/prisma/schema.prisma`)

### API routes (billing + docs)
- POD verify/reject:
  - `POST /docs/:id/verify` and `POST /docs/:id/reject` (`apps/api/src/index.ts`)
- Billing queue:
  - `GET /billing/queue` returns delivered/ready/invoiced loads (`apps/api/src/index.ts`)
- Invoice generation and packet:
  - `POST /billing/invoices/:loadId/generate`
  - `POST /billing/invoices/:invoiceId/packet`
  - `POST /billing/invoices/:invoiceId/status` (dispute/paid/short-paid/void)
  - `GET /invoices/:id/pdf` (`apps/api/src/index.ts`)
- Accessorials as charges:
  - `GET /loads/:id/charges`
  - `POST /loads/:id/charges`
  - `PATCH /loads/:id/charges/:chargeId`
  - `DELETE /loads/:id/charges/:chargeId` (`apps/api/src/index.ts`)

### UI pages
- Billing queue UI (POD verification, invoice status):
  - `apps/web/app/billing/page.tsx`
- Load detail Billing tab with invoice generate + charges:
  - `apps/web/app/loads/[id]/page.tsx`
- Admin automation/settings for invoice terms + POD requirements + detention rate:
  - `apps/web/app/admin/automation/page.tsx`

### Worker jobs
- Invoice aging tasks (payment follow-ups) based on invoice terms:
  - `apps/worker/src/index.ts`

## Phase B additions (Billing Readiness)

### Data model changes
- Added `BillingStatus` enum and billing fields on `Load`:
  - `billingStatus`, `billingBlockingReasons`, `invoicedAt`, `externalInvoiceRef` (`packages/db/prisma/schema.prisma`)
- Added `Accessorial` model with status + proof tracking and related enums:
  - `AccessorialType`, `AccessorialStatus`, `Accessorial` model, relations (`packages/db/prisma/schema.prisma`)
- Added new doc types for billing readiness:
  - `RATE_CONFIRMATION`, `ACCESSORIAL_PROOF` (`packages/db/prisma/schema.prisma`)

### API additions
- Billing readiness evaluation:
  - `apps/api/src/lib/billing-readiness.ts`
  - Evaluated on load status changes, doc uploads/verify/reject, accessorial actions, invoice status updates.
- Readiness queue:
  - `GET /billing/readiness` (`apps/api/src/index.ts`)
- Accessorial CRUD and approval:
  - `POST /loads/:id/accessorials`
  - `PATCH /accessorials/:id`
  - `POST /accessorials/:id/approve`
  - `POST /accessorials/:id/reject` (`apps/api/src/index.ts`)
- Billing actions:
  - `POST /billing/readiness/:loadId/mark-invoiced`
  - `POST /billing/readiness/:loadId/quickbooks` (`apps/api/src/index.ts`)
- QuickBooks stub integration:
  - `apps/api/src/integrations/quickbooks/index.ts`

### UI additions
- New readiness queue UI:
  - `apps/web/app/billing/readiness/page.tsx`
- Load billing tab updated:
  - Readiness summary + blocking reasons
  - Accessorial list + add/approve/reject + proof upload
  - “Mark invoiced” + optional “Send to QuickBooks” (`apps/web/app/loads/[id]/page.tsx`)
- Sidebar navigation link:
  - `apps/web/components/app-shell.tsx`

### Tests + seed/demo
- Billing readiness unit tests:
  - `apps/api/src/lib/billing-readiness.test.ts`
- Seed updates for readiness demo data:
  - `packages/db/prisma/seed.ts`

### Environment variables (new)
- `QUICKBOOKS_ENABLED`, `QUICKBOOKS_COMPANY_ID`, `QUICKBOOKS_ACCESS_TOKEN`
- `NEXT_PUBLIC_QUICKBOOKS_ENABLED`
  - (`.env.example`, `.env.docker.example`)

## What is still missing for a “full” Billing Readiness product
- Full QuickBooks OAuth + invoice creation + attachment upload (currently stubbed).
- Dispute workflows beyond invoice status (no dedicated dispute entity or resolution UI).
- Accessorial auto-calc from detention/stop data (manual entry only).
- A billing packet checklist per customer (still using org-level required docs).

## Risk notes / edge cases
- Invoice generation still uses verified required docs; readiness uses doc presence. This can cause “Ready” loads to fail invoice generation if docs are uploaded but unverified.
- Accessorial proof is tracked via `proofDocumentId`; missing proof blocks readiness even if status is approved.
- Readiness is persisted on load updates; existing loads may need a one-time evaluation (handled by `/billing/readiness` and load detail read).

## Files touched in Phase B
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/seed.ts`
- `apps/api/src/lib/billing-readiness.ts`
- `apps/api/src/lib/billing-readiness.test.ts`
- `apps/api/src/integrations/quickbooks/index.ts`
- `apps/api/src/index.ts`
- `apps/api/package.json`
- `apps/web/app/billing/readiness/page.tsx`
- `apps/web/app/loads/[id]/page.tsx`
- `apps/web/components/app-shell.tsx`
- `apps/web/lib/billing-readiness.ts`
- `apps/web/app/dispatch/page.tsx`
- `packages/shared/src/index.ts`
- `.env.example`
- `.env.docker.example`
