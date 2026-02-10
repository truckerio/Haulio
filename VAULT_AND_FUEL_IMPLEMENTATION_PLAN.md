# Vault + Fuel MVP — Implementation Plan

## Guiding principles
- Keep changes scoped to Admin/Settings + Documents/Vault + Integrations + background sync.
- Reuse existing storage (`uploads/`) and auth/role guards.
- Preserve existing load/dispatch/billing flows.
- Admin-only for settings + vault actions.

## Part 1: Document Vault MVP

### 1) Data model (Prisma)
- Add new model `VaultDocument` in `packages/db/prisma/schema.prisma`:
  - `id`, `orgId`
  - `scopeType` enum: `ORG | TRUCK | DRIVER`
  - `scopeId` nullable
  - `docType` enum (vault-specific): `INSURANCE | REGISTRATION | PERMIT | OTHER | CARGO_INSURANCE | LIABILITY | IFTA | TITLE`
  - `filename`, `originalName`, `mimeType`, `size`, `storageKey`
  - `expiresAt` nullable, `referenceNumber` nullable, `notes` nullable
  - `uploadedById` (User), `uploadedAt`, `updatedAt`
  - Indexes: `[orgId, scopeType, docType]`, `[orgId, expiresAt]`
- Add enum for scope + type in schema.

### 2) Storage
- Reuse `apps/api/src/lib/uploads.ts`
  - Add helper: `saveVaultDocumentFile(file, orgId)` → writes to `uploads/org/<orgId>/vault/<docId>/<filename>`.
  - Store relative `storageKey` in DB.

### 3) API endpoints (apps/api/src/index.ts)
- Admin-only:
  - `GET /admin/vault/docs` (filters + pagination)
  - `POST /admin/vault/docs` (multipart upload + metadata)
  - `GET /admin/vault/stats` (counts: valid/expiring/expired/missing?; minimal for Today)
  - `GET /admin/vault/doc-types` (optional; can be static in UI)
- Doc download:
  - `GET /admin/vault/docs/:id/download` (authorized, streams file)

### 4) UI pages (apps/web)
- Add Documents → Vault page:
  - `apps/web/app/admin/documents/vault/page.tsx`
  - Reuse `AdminSettingsShell`, `AppShell`, `Card`, `Table`, `Input`, `Select`, `Drawer`.
  - Filters: search, type, scope, status.
  - Table columns: `Document`, `Scope`, `Status`, `Expires`, `Uploaded by`, `Updated`.
  - CTA: “Upload document” → right drawer.
  - Drawer fields: type, file, scope selector (company / truck / driver), optional expiration/reference/notes.

### 5) Today summary (Admin only)
- Extend `/today` in `apps/api/src/index.ts` to include doc expiration count.
- Add new warning item for admins: “Documents expiring soon”.
- Update `apps/web/app/today/page.tsx` to display the item.

### 6) Tests
- Add unit tests for expiration logic:
  - e.g. `apps/api/src/lib/vault-status.ts` + tests under `apps/api/test` (or existing test structure).
- Add API auth tests if a test harness exists; otherwise include manual QA steps.

## Part 2: Samsara Fuel Summary MVP

### 1) Data model (Prisma)
- New model `FuelSummary` (name can be `TelematicsFuelSummary`):
  - `id`, `orgId`, `truckId`
  - `providerType` (enum, reuse `TrackingProviderType`)
  - `periodStart`, `periodEnd`, `days`
  - `fuelUsed`, `distance`, `fuelEfficiency`
  - `source` (enum or string: `SAMSARA`)
  - `lastSyncedAt`
  - Index: `[orgId, truckId, periodStart, periodEnd]`
- Optional: add `fuelLastSyncedAt` to `TrackingIntegration` (or store in configJson).

### 2) Samsara API client additions (apps/worker/src/samsara-fuel.ts)
- Add `fetchSamsaraFuelReport(token, vehicleIds, startMs, endMs)`:
  - Use Samsara fuel/energy vehicle report endpoint.
  - Return per-vehicle aggregates (fuel used, distance, efficiency).
  - Optional env override: `SAMSARA_FUEL_REPORT_PATH` (to match tenant API version).

### 3) Sync job (apps/worker)
- Add cron-style job to `apps/worker/src/index.ts`:
  - For each org with connected Samsara + truck mappings:
    - Pull last 7 days + 30 days fuel summary.
    - Upsert `FuelSummary` by `(orgId, truckId, periodStart, periodEnd, providerType)`.
  - Record `lastSyncedAt` per org (in integration config or separate table).
- Use throttling to avoid rate limits (batch by org, vehicle IDs).

### 4) API endpoints (apps/api/src/index.ts)
- `GET /admin/fuel/summary?range=7d|30d`
  - Admin-only.
  - Joins `FuelSummary` with `Truck`.
- `GET /admin/fuel/status`
  - Returns connected status, mapped vehicles count, last sync time.

### 5) UI (apps/web)
- Integrations → Samsara section: add “Fuel Summary” CTA + status.
  - Update `apps/web/app/admin/integrations/page.tsx`.
- Fuel Summary page:
  - `apps/web/app/admin/integrations/samsara/fuel/page.tsx` (or `/admin/reports/fuel`).
  - Table: Truck, Fuel used (7d), Distance (7d), MPG (7d), Last sync.
  - Filters: 7d/30d toggle; optional team filter if needed.
  - Badge: “Data source: Samsara”.

## QA Checklist (manual)
- Upload vault doc (org + truck + driver) and confirm status logic (valid/expiring/expired).
- Verify today shows expiring docs for Admin only.
- Confirm doc download works and enforces org scoping.
- Connect Samsara, map trucks, run worker; Fuel Summary shows values.

## Implemented file map (this change set)

**Document Vault**
- `packages/db/prisma/schema.prisma` (Vault enums + `VaultDocument`)
- `apps/api/src/lib/uploads.ts` (`saveVaultDocumentFile`)
- `apps/api/src/lib/vault-status.ts` + `apps/api/src/lib/vault-status.test.ts`
- `apps/api/src/index.ts` (`/admin/vault/*` endpoints, Today summary)
- `apps/web/app/admin/documents/page.tsx` (Vault entry)
- `apps/web/app/admin/documents/vault/page.tsx` (Vault UI)
- `apps/web/components/admin-settings/AdminDrawer.tsx` (eyebrow prop)

**Samsara Fuel Summary**
- `packages/db/prisma/schema.prisma` (`FuelSummary` + `FuelSummarySource`)
- `apps/worker/src/samsara-fuel.ts` (Samsara fuel sync)
- `apps/worker/src/index.ts` (scheduled sync)
- `apps/api/src/index.ts` (`/admin/fuel/status`, `/admin/fuel/summary`)
- `apps/web/app/admin/integrations/page.tsx` (Fuel summary CTA + status)
- `apps/web/app/admin/integrations/samsara/fuel/page.tsx` (Fuel Summary UI)
- `apps/api/package.json` (test:vault script)

## Hardening updates (post-MVP)
- Vault status now treats missing expiry as `Needs details` for required doc types; `Missing` is no longer derived from null expiry.
- Vault default view emphasizes “Needs attention” (expired, expiring soon, needs details) with URL-persisted filters.
- Fuel sync health uses `TrackingIntegration.lastFuelSyncAt`/`lastFuelSyncError` and surfaces “Needs attention” if stale (>12h) or error.
