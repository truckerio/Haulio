# Storage Scope Removal (Ops OS)

## Summary
Yard/Trailer Storage has been removed from the Ops OS product surface. This feature is reserved for Yard OS.

## What was removed
- Navigation and role routing entries for **Storage**
- Landing page copy referencing storage
- Admin UI section for storage charges
- `/storage` UI route (now returns 404 via `notFound()`)

## API handling
- Storage endpoints remain but are **ADMIN-only** and gated behind `YARD_STORAGE_ENABLED=false` by default.
- When disabled, endpoints return **410 Gone** with a Yard OS message.

## Files changed
- `apps/web/components/app-shell.tsx`
- `apps/web/app/page.tsx`
- `apps/web/app/admin/page.tsx`
- `apps/web/app/storage/page.tsx`
- `apps/api/src/index.ts`
- `docs/product-scope.md`
- `docs/PRODUCT_BUILD_JOURNAL.md`

## Reserved for Yard OS
Storage DB tables and data are intentionally **not deleted**. They are retained for future Yard OS use.
