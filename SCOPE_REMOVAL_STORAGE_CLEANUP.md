# Storage/Yard Storage Cleanup Summary

## What changed
- Removed remaining product-surface references to Storage from public docs.
- Cleaned demo/seed scripts to stop touching StorageRecord data.
- Kept required schema fields and feature-flagged API endpoints intact (per scope constraints).

## Files changed
- `README.md` — removed “Storage” from product feature list.
- `UI_FORM_SYSTEM_AUDIT.md` — removed Storage page reference from audit list.
- `UI_FORM_SYSTEM_MIGRATION_REPORT.md` — removed Storage page from migrated files list.
- `packages/db/prisma/seed.ts` — removed `storageRecord.deleteMany()`.
- `apps/api/scripts/demo-reset.ts` — removed `storageRecord.deleteMany()`.
- `SCOPE_REMOVAL_STORAGE_CLEANUP_AUDIT.md` — inventory + classification.

## What remains (intentional)
- Storage DB schema and OrgSettings fields (`freeStorageMinutes`, `storageRatePerDay`) remain because the schema is retained.
- Storage API endpoints remain but are **ADMIN-only** and **feature-flagged** behind `YARD_STORAGE_ENABLED` (off by default).
- Document upload storage keys remain (POD/load confirmation storage is still required).

## Rationale
Yard Storage is out of scope for Ops OS, but schema and APIs are retained for future Yard OS. Cleanup focuses on removing UI/docs/demo references while keeping required technical plumbing and backward compatibility.
