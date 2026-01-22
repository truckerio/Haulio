## Files checked
- `apps/api/src/index.ts`
- `apps/api/src/lib/invoice.ts`
- `apps/api/src/lib/tasks.ts`
- `apps/api/src/lib/tenant.ts`
- `apps/worker/src/index.ts`
- `packages/db/src/money.ts`
- `packages/db/prisma/schema.prisma`
- `apps/web/app/driver/page.tsx`
- `apps/web/lib/offlineQueue.ts`

## Remaining unsafe patterns found
- None found in this pass. All tenant-table updates by `id` are preceded by org-scoped fetches or use org-scoped filters.

## Fixes applied
- Decimal/miles precision: added `toDecimalFixed` and used it for settlement and driver earnings calculations (`packages/db/src/money.ts`, `apps/api/src/index.ts`).
- Invoice totals: ensured line-item totals are Decimal-summed and PDF uses line items (`apps/api/src/index.ts`, `apps/api/src/lib/invoice.ts`).
- Tenant scoping: expanded `requireOrgEntity` usage for invoice packet/status endpoints, settlements, and storage checkout; hardened login update to include `orgId` (`apps/api/src/index.ts`, `apps/api/src/lib/tenant.ts`).
- Task dedupe: dedupe keys are trimmed and empty strings ignored to avoid accidental collisions (`apps/api/src/lib/tasks.ts`).
