# Trucker.io V1 Hardening Report

## Commands run + results
- `pnpm --filter @truckerio/db exec prisma format`
  - Initial failure: Prisma `@db.Numeric` unsupported for Postgres.
  - Fixed schema to `@db.Decimal`, rerun succeeded.
- `pnpm --filter @truckerio/db exec prisma validate` ✅
- `pnpm --filter @truckerio/db exec prisma migrate dev --skip-seed` ❌
  - Error: Postgres not reachable at `localhost:5432`.
  - Attempted `docker-compose up -d` ❌ (Docker daemon not running).
- `pnpm --filter @truckerio/api exec tsc -p tsconfig.json --noEmit` ❌
  - Missing `@types/node` (dependency install failed due to registry/network).
- `pnpm --filter @truckerio/worker exec tsc -p tsconfig.json --noEmit` ❌
  - Missing `@types/node` (same root cause).
- `pnpm --filter @truckerio/web exec tsc -p tsconfig.json --noEmit` ✅ after fixes
- `pnpm -r lint` → no lint scripts configured.
- `pnpm -r test` → no test scripts configured.
- `pnpm install` ❌ (registry unreachable: `ENOTFOUND registry.npmjs.org`).

## Issues found (by severity)
### Critical
- Prisma schema used unsupported `@db.Numeric` for Postgres → validation/format failed.
- Invoice PDF rendered totals from `Load.rate` instead of invoice line items (risk of mismatch).
- Task creation lacked deterministic dedupe keys (worker could create duplicates under concurrency).
- Load locking only blocked rate edits (customer/contract fields could be modified after invoice).

### High
- Missing tenant guard helper increased risk of future cross-org access bugs.
- Web typecheck errors in `today` page and UI typings (button variants, DocType unions).

### Medium
- Driver earnings formatting used float math on Decimal values.
- Offline queue doc types not aligned with expanded DocType enums.

## Fixes made (paths)
### Multi-tenant safety
- Added org-scoped helper `apps/api/src/lib/tenant.ts`.
- Applied helper to task assignment + document verify/reject flows in `apps/api/src/index.ts`.
- Hardened file serving with org checks in `apps/api/src/index.ts`.

### Money/decimal correctness
- Added shared Decimal utilities `packages/db/src/money.ts` and re-exported in `packages/db/src/index.ts`.
- Updated invoice generation to compute `Invoice.totalAmount` from line items in `apps/api/src/index.ts`.
- Updated invoice PDF to render line items + totals from invoice data in `apps/api/src/lib/invoice.ts`.
- Settlement math now uses Decimal-safe helpers in `apps/api/src/index.ts`.
- Driver earnings now return formatted strings (Decimal-safe) in `apps/api/src/index.ts`; UI adjusted in `apps/web/app/driver/page.tsx`.

### Task idempotency
- Added `Task.dedupeKey` + unique constraint in `packages/db/prisma/schema.prisma`.
- New migration `packages/db/prisma/migrations/20260202093000_task_dedupe/migration.sql`.
- `apps/api/src/lib/tasks.ts` updated to support dedupe upserts.
- Worker now uses deterministic dedupe keys with upserts in `apps/worker/src/index.ts`.
- API-generated tasks now pass dedupe keys for POD, missing-doc, detention follow-up, dispute in `apps/api/src/index.ts`.
  - Scheme: `MISSING_DOC:POD:load:{loadId}`, `PAYMENT_FOLLOWUP:invoice:{invoiceId}`, `DRIVER_COMPLIANCE_EXPIRING:driver:{driverId}`, `COLLECT_POD:stop:{stopId}`, `STOP_DELAY_FOLLOWUP:stop:{stopId}`, `INVOICE_DISPUTE:invoice:{invoiceId}`.

### Load locking
- Expanded locked field enforcement to `rate`, `customerId/customerName`, `customerRef`, `bolNumber`, and `miles` in `apps/api/src/index.ts`.
- Admin override now logs changed fields + reason.

### Schema robustness
- Replaced `@db.Numeric` → `@db.Decimal` in `packages/db/prisma/schema.prisma`.
- Updated shared DocType union in `packages/shared/src/index.ts`.
- Fixed today page invalid quotes and web type errors in `apps/web/app/today/page.tsx`, `apps/web/app/dispatch/page.tsx`, `apps/web/app/driver/page.tsx`, `apps/web/lib/offlineQueue.ts`.

## Remaining risks / TODOs
- Migrations not applied: Postgres not running locally; re-run `prisma migrate dev` when DB is available.
- `@types/node` not installed due to registry network issue; typecheck for API/worker still blocked.
- No lint/test scripts configured; consider adding for CI.

## New scripts
- `apps/api/scripts/tenant-guard.ts`
  - Verifies cross-org access is blocked for `/loads/:id` and `/docs/:id/verify`.
  - Requires API running and DB available.
- `apps/api/scripts/invoice-concurrency.ts`
  - Fires parallel invoice generation requests and checks invoice numbers.
  - Requires API running and DB available.

Run with:
```
pnpm --filter @truckerio/api exec tsx scripts/tenant-guard.ts
pnpm --filter @truckerio/api exec tsx scripts/invoice-concurrency.ts
```

## Production checklist (quick)
- Apply DB migrations (run concurrent index migration without a transaction).
- Ensure `UPLOAD_DIR` and `WEB_ORIGIN` are set.
- Run API + Worker together (worker creates follow-up tasks).
- Seed/validate `OrgSettings` for invoice prefix/terms/detention settings.
- Verify PDF generation dependencies (Puppeteer) in the runtime environment.
