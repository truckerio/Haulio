# Vault + Samsara Fuel Audit (Current State)

## Scope
This audit covers existing document storage/flows and Samsara integration usage, with evidence from the repo.

## A) Document Vault / Docs Storage Audit

### Existing DB models
- `Document` (load-scoped docs only): `packages/db/prisma/schema.prisma`
  - Fields: `orgId`, `loadId`, `stopId?`, `type`, `status`, `source`, `filename`, `originalName`, `mimeType`, `size`, `uploadedById`, timestamps.
  - Enums: `DocType` (POD/RATECON/BOL/LUMPER/SCALE/DETENTION/OTHER) and `DocStatus` (UPLOADED/VERIFIED/REJECTED).
- `LoadConfirmationDocument`: `packages/db/prisma/schema.prisma`
  - Stores uploaded load confirmation files + extracted text/json (for rate con ingestion).
- No org-level or driver/truck document model exists today (no “VaultDocument”).

### Existing upload endpoints (API)
- Load docs upload (ops): `POST /loads/:loadId/docs` in `apps/api/src/index.ts`
- Driver POD upload: `POST /driver/docs` in `apps/api/src/index.ts`
- Load confirmations upload: `POST /load-confirmations/upload` in `apps/api/src/index.ts`
- Driver/user profile photo upload: `POST /driver/profile/photo` and `POST /profile/photo` in `apps/api/src/index.ts`

### Storage mechanism
- Local filesystem under `uploads/` (via `apps/api/src/lib/uploads.ts`).
  - Uses `multer.memoryStorage()` then writes to disk in `saveDocumentFile()` / `saveLoadConfirmationFile()`.
  - Paths: `uploads/docs`, `uploads/org/<orgId>/load-confirmations`, `uploads/profiles`, `uploads/invoices`, `uploads/packets`.
- No S3/Supabase in active use; `apps/api/src/lib/storage.ts` is a stub.

### UI screens using docs today
- Load details → Documents tab (upload, verify/reject): `apps/web/app/loads/[id]/page.tsx`
- Driver app (POD upload + compliance prompt): `apps/web/app/driver/page.tsx`
- Load confirmations inbox + detail: `apps/web/app/loads/confirmations/page.tsx`, `apps/web/app/loads/confirmations/[id]/page.tsx`
- Admin → Documents settings (POD rules + required docs): `apps/web/app/admin/documents/page.tsx`

### Expiration/reminder behavior
- Driver compliance uses `Driver.licenseExpiresAt` and `Driver.medCardExpiresAt` only (not document files).
  - Worker creates tasks: `apps/worker/src/index.ts` (`ensureComplianceTasks()`).
- No expiration fields on `Document` or `LoadConfirmationDocument`.
- No reminders for org-level docs (insurance, permits, registration).

### Current capability assessment
- Upload/view load docs: ✅ (POD/RateCon/BOL/etc)
- Driver doc uploads (non-POD): ❌ (explicitly “not supported” in driver UI)
- Org/truck/driver compliance document vault: ❌
- Expiration tracking for uploaded docs: ❌
- Reminders or dashboard summary for expiring docs (org/truck/driver): ❌

## B) Samsara Integration Audit (Fuel)

### Existing Samsara integration code
- API client wrapper: `apps/api/src/lib/samsara.ts`
  - Uses `SAMSARA_API_BASE` and `SAMSARA_TIMEOUT_MS`.
  - Current calls: `/fleet/vehicles`, `/fleet/vehicles/locations` only.
- Integration endpoints: `apps/api/src/index.ts`
  - `GET /api/integrations/samsara/status`
  - `POST /api/integrations/samsara/connect`
  - `POST /api/integrations/samsara/disconnect`
  - `GET /api/integrations/samsara/vehicles`
  - `POST /api/integrations/samsara/test`
  - `GET /api/integrations/samsara/truck-mappings`
  - `POST /api/integrations/samsara/map-truck`
- UI settings page: `apps/web/app/admin/integrations/page.tsx`

### Config + token storage
- Stored in `TrackingIntegration.configJson` (per-org): `packages/db/prisma/schema.prisma`
  - Provider type: `TrackingProviderType.SAMSARA`
  - `configJson` contains `apiToken` (stored on connect).
- Mapping between Haulio trucks and Samsara vehicles:
  - `TruckTelematicsMapping` model stores `externalId` per truck.

### Existing Samsara usage
- Vehicle list and mapping only (no fuel endpoints).
- Tracking fallback: uses `fetchSamsaraVehicleLocation()` when no phone ping exists (`/tracking/load/:loadId/latest`).
- No scheduled sync or worker job for Samsara data.
- No fuel / energy reports called today.

### Fuel/energy endpoints in use today
- ❌ None found (no calls to fuel/energy reports in `apps/api/src/lib/samsara.ts` or `apps/api/src/index.ts`).

### “Last sync” storage
- ❌ Not tracked (no model fields for last fuel sync; only `TrackingIntegration.updatedAt`).

### Current capability assessment
- Connection + vehicle mapping: ✅
- Telemetry locations: 🟡 (only for vehicle location fallback)
- Fuel/energy summary: ❌
- Sync jobs/worker for Samsara: ❌

## Summary of Gaps (MVP Requirements)
- No org/truck/driver document vault or expiration logic (needs new model + UI).
- No expiring doc summary in Today (requires new query + UI item).
- Samsara fuel summary not implemented (needs API client, data model, sync, UI).

## Post-implementation note
This audit captured the pre-MVP state. The new Vault + Fuel MVP implementation is documented in
`VAULT_AND_FUEL_IMPLEMENTATION_PLAN.md` with a concrete file map of the changes.
