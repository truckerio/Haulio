# Haulio V1 Change Summary

## 1) End-to-end flow now covered
- Load → POD verification → auto invoice creation → invoice status tracking (SENT/ACCEPTED/DISPUTED/PAID/SHORT_PAID/VOID).
- Payment follow-up tasks created via worker for overdue invoices.
- Settlement generation/finalization/paid tracking for driver CPM.
- Driver “Today” + action tasks; ops inbox + billing review loop.

## 2) Schema changes
- Uniqueness: `Load.loadNumber` and `User.email` now scoped by `orgId`.
- Postgres email correctness: `User.email` is CITEXT with case-insensitive unique index.
- Money fields converted from Float → Decimal (@db.Numeric).
- New enums: `TaskType`, `DocSource`, `Permission`, `DriverDocType`, `StopStatus`, `DelayReason`, `SettlementStatus`, notification enums; expanded `DocType`; updated `TaskStatus`/`InvoiceStatus`.
- New models: `Customer`, `InvoiceLineItem`, `Settlement`, `SettlementItem`, `UserNotificationPref`.
- Key model updates:
  - `Load`: `customerId`, `customerRef`, `bolNumber`, `lockedAt`, `rate` Decimal.
  - `Task`: typed, linked object pointers + assignment fields + indexes.
  - `Document`: stop linkage, source, rejection fields + indexes.
  - `Stop`: status/delay/detention fields.
  - `Event`: queryable pointers (stop/leg/doc/task/invoice/customer).
  - `User`: `permissions`, `isActive`, `timezone`.
  - `Driver`: pay override + compliance expirations.
  - `OrgSettings`: typed required docs, detention settings, timezone, invoiceTermsDays, Decimal money.
  - `Session`: revoked/lastUsed/ip/userAgent, index on userId+expiresAt.

## 3) Migrations created
- `20260202090000_multitenant_workflow`
  - CITEXT extension, per-org uniqueness, new enums/models/fields, Decimal conversions.
  - Backfills: stop status, document source, task type, customer creation, load locking.
  - Required docs conversion includes NOTICE logs for unknown values.
- `20260202090500_concurrent_indexes`
  - Non-transactional partial index for open task queue + doc verification index.

## 4) API updates (selected)
- Multi-tenant scoping enforced on tenant tables; load lookups scoped by org.
- Auth: session revoke, lastUsedAt throttling, ip/userAgent capture; revoked/inactive users rejected.
- Task inbox + assignment endpoints; role queue + user assignment.
- Document verify/reject with required reason + events; doc upload supports stopId + source.
- Invoice generation uses transaction with SELECT FOR UPDATE on OrgSettings.
- Invoice status update endpoint (SENT/ACCEPTED/DISPUTED/PAID/SHORT_PAID/VOID) with dispute/payment fields.
- Stop arrive/depart + detention computation + follow-up task.
- Load locking on invoice SENT with admin override event.
- Customer CRUD, settlement endpoints, load → cash timeline endpoint.
- File download now org-scoped.

## 5) Worker changes
- Missing POD task creation (idempotent).
- Invoice aging → PAYMENT_FOLLOWUP tasks using org/customer terms.
- Driver compliance expirations → DRIVER_COMPLIANCE_EXPIRING tasks.

## 6) Web UI updates
- New pages: `apps/web/app/today/page.tsx`, `apps/web/app/settlements/page.tsx`, `apps/web/app/loads/[id]/page.tsx`.
- Task inbox: `apps/web/app/dashboard/page.tsx`.
- Billing: doc verify/reject with reason + invoice status actions.
- Dispatch: stop status/delay/detention display + delay update.
- Loads: customer fields + timeline link.
- Admin: typed required docs + detention/terms/timezone + customer management.

## 7) Breaking changes + deploy order
- Breaking: email and load number uniqueness now per-org; required docs now enum arrays; money fields now Decimal.
- Deploy order: 1) DB migrations (run non-transactional concurrent index step separately) → 2) API → 3) Worker → 4) Web.

## 8) V2 backlog (not implemented)
- Telematics/ELD integrations, maintenance module, instant pay rails, generic rules engine, multi-org membership.

## Hardening Pass
- Fixed Prisma `@db.Numeric` usage → `@db.Decimal` and added task dedupe via `dedupeKey`.
- Added shared money utils (Decimal-safe) and updated invoice/settlement math + PDF rendering from line items.
- Added tenant guard + invoice concurrency scripts under `apps/api/scripts`.
- Hardened load locking, doc verification, and file access org scoping.

## Addendum
- Added authenticated invoice PDF endpoint `GET /invoices/:id/pdf` with safe path resolution + streaming headers.
- Updated billing UI to open invoice PDFs via the new endpoint instead of `/files/invoices/...`.
- Uploads path normalization: store relative `invoices/...` paths, resolve via upload base, added `fix-upload-paths.ts` backfill.

## V1 Ops Improvements
- Settlements API now supports filters (`status`, `driverId`, `from`, `to`, `week`, `groupBy`) and returns `weekKey`/`weekLabel` based on `periodEnd` (Pending = DRAFT+FINALIZED).
- New bulk import endpoints: `POST /imports/preview` + `POST /imports/commit` (employees/drivers, idempotent upserts) and `POST /users/invite-bulk`.
- Added invite acceptance flow (`GET /invite/:token`, `POST /invite/:token/accept`) and `UserInvite` model/migration.
- Moved bulk load import UI from Dispatch to Loads; added `BulkLoadImport` component.
- Settlements UI updated with filters/grouping; driver portal shows pending pay + quick filters.

## Settlements Validation + Audit
- Root cause: invalid settlement periods (start after end) created empty settlements with net/gross 0, which surfaced as 0 in the UI.
- Added API validation for settlement date ranges and empty load sets; finalize/paid now reject settlements with zero items.
- `GET /settlements` now hides invalid periods by default; admins can pass `includeInvalid=true`.
- New audit script: `pnpm --filter @truckerio/api exec tsx scripts/settlements-audit.ts [--fix]`.
