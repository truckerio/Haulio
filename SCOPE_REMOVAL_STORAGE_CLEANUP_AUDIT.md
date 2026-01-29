# Storage/Yard Storage Cleanup Audit

Search scope: `apps/`, `packages/`, `scripts/`, `docs/`, `README.md` (case-insensitive). Terms: `storage`, `yard storage`, `yard`, `trailer storage`, `/storage`, `YARD_STORAGE_ENABLED`, `slot`, `dock`, `yard os`.

Classification:
- **A** = Yard Storage feature reference (remove/adjust)
- **B** = Generic/technical storage or required schema reference (keep)
- **C** = Document storage (keep)
- **D** = Ambiguous (leave + note)

## Inventory

### Docs & README
- `README.md` — “Back-office suite (Loads, Dispatch, Billing, Storage, Audit, Admin)…” → **A** (removed)
- `docs/PRODUCT_BUILD_JOURNAL.md` — “Removed Yard Storage from Ops OS UI and routing…” → **B** (keep; removal note)
- `docs/product-scope.md` — “Yard/trailer storage and dwell tracking” + “Yard Storage removed…” → **B** (keep; scope note)
- `docs/bulk-csv-guide.html` — “Origin Yard… Destination Yard…” → **B** (stop naming, not Yard Storage)

### Web UI
- `apps/web/app/storage/page.tsx` — route removed via `notFound()` → **B** (keep; de-scoped route stub)
- `apps/web/app/dispatch/page.tsx` — `STORAGE_KEY` uses localStorage for filters → **B** (generic storage)
- `apps/web/app/loads/page.tsx` — origin/destination yard fields + stop type YARD → **B** (stop modeling)
- `apps/web/app/loads/[id]/page.tsx` — renders “Yard” for stop type → **B** (stop modeling)
- `apps/web/components/BulkLoadImport.tsx` — “yard → yard → consignee pattern” → **B** (stop modeling)

### API
- `apps/api/src/index.ts` — `/storage` endpoints + `YARD_STORAGE_ENABLED` flag → **B** (feature-flagged, ADMIN-only; keep)
- `apps/api/src/index.ts` — OrgSettings `freeStorageMinutes` / `storageRatePerDay` validation → **B** (required schema fields)
- `apps/api/src/lib/tasks.ts` — `calculateStorageCharge(...)` helper → **B** (legacy/schema; keep)
- `apps/api/src/lib/uploads.ts` — `storageKey` for document storage → **C** (docs storage)
- `apps/api/src/index.ts` — `storageKey` usage for docs upload → **C** (docs storage)
- `apps/api/src/index.ts` — `multer.memoryStorage()` → **B** (technical storage)

### Scripts / QA / Seeds
- `packages/db/prisma/seed.ts` — `storageRecord.deleteMany()` → **A** (removed)
- `apps/api/scripts/demo-reset.ts` — `storageRecord.deleteMany()` → **A** (removed)
- `packages/db/prisma/seed.ts` — `freeStorageMinutes` / `storageRatePerDay` → **B** (required schema fields)
- `scripts/smoke-v1.ts` — `freeStorageMinutes` / `storageRatePerDay` → **B** (required schema fields)
- `scripts/qa/qa-setup.ts` — `freeStorageMinutes` / `storageRatePerDay` → **B** (required schema fields)
- `scripts/smoke-checks.ts` — `freeStorageMinutes` / `storageRatePerDay` → **B** (required schema fields)
- `apps/api/scripts/demo-seed.ts` — `freeStorageMinutes` / `storageRatePerDay` → **B** (required schema fields)
- `apps/api/scripts/tenant-isolation.ts` — `freeStorageMinutes` / `storageRatePerDay` → **B** (required schema fields)
- `apps/api/scripts/smoke-happy-path.ts` — `freeStorageMinutes` / `storageRatePerDay` → **B** (required schema fields)
- `apps/api/scripts/smoke-failure-paths.ts` — `freeStorageMinutes` / `storageRatePerDay` → **B** (required schema fields)
- `apps/api/scripts/invoice-concurrency.ts` — `freeStorageMinutes` / `storageRatePerDay` → **B** (required schema fields)
- `scripts/db-e2e.ts` — `storageKey` for confirmation doc → **C** (docs storage)

### DB Schema / Migrations
- `packages/db/prisma/schema.prisma` — `StorageRecord` model and OrgSettings storage fields → **B** (schema retained)
- `packages/db/prisma/migrations/20260118213103_init/migration.sql` — StorageRecord tables/fields → **B** (schema retained)
- `packages/db/prisma/migrations/20260202090000_multitenant_workflow/migration.sql` — storage field type changes → **B** (schema retained)
- `packages/db/prisma/migrations/20260301120000_load_confirmations/migration.sql` — `storageKey` for documents → **C** (docs storage)

### Other Yard Mentions (Stop Model, Not Storage)
- `apps/api/src/index.ts` — stop type enum includes `YARD` → **B** (stop modeling)
- `packages/db/prisma/templates/stops.csv` — Yard stop examples → **B** (stop modeling)

## Notes
- Class **A** items have been removed/adjusted in this cleanup.
- Class **B/C** items remain because they are required schema fields, feature-flagged endpoints, or document storage (not Yard Storage UI).
