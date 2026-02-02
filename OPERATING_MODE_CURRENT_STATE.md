# Operating Mode Current State (Read-Only Audit)

Date: 2026-01-30
Repo: `/Users/karanpreetsingh/demo-truckerio1`

## A) Prisma (DB model)

### Enums / Fields
- `OperatingMode` enum: `CARRIER | BROKER | BOTH`
  - `packages/db/prisma/schema.prisma` (OperatingMode)
- `OrgSettings.operatingMode` (default `CARRIER`)
  - `packages/db/prisma/schema.prisma` (`model OrgSettings`)
- `OperatingEntityType` enum: `CARRIER | BROKER`
  - `packages/db/prisma/schema.prisma` (`OperatingEntityType`)
- `OperatingEntity.type` (CARRIER/BROKER)
  - `packages/db/prisma/schema.prisma` (`model OperatingEntity`)
- `LoadBusinessType` enum: `COMPANY | BROKER`
  - `packages/db/prisma/schema.prisma` (`LoadBusinessType`)
- `Load.businessType` (optional)
  - `packages/db/prisma/schema.prisma` (`model Load`)
- `LoadType` enum includes `COMPANY | BROKERED | VAN | REEFER | FLATBED | OTHER`
  - `packages/db/prisma/schema.prisma` (`LoadType`)

### Relevant migrations
- `OperatingMode` enum + `OrgSettings.operatingMode` added
  - `packages/db/prisma/migrations/20260315090000_basic_needs_onboarding/migration.sql`
- `LoadBusinessType` + `Load.businessType`
  - `packages/db/prisma/migrations/20260128192000_load_business_type/migration.sql`
- `OperatingEntityType` enum and `LoadType` enum created
  - `packages/db/prisma/migrations/20260307000000_operating_entities_tracking/migration.sql`

### Seed defaults
- `OrgSettings.operatingMode` seeded as `CARRIER`
- Default operating entity type seeded as `CARRIER`
  - `packages/db/prisma/seed.ts`

**Excerpt (schema):**
```prisma
enum OperatingMode {
  CARRIER
  BROKER
  BOTH
}

model OrgSettings {
  operatingMode OperatingMode @default(CARRIER)
  // ...
}

enum OperatingEntityType { CARRIER BROKER }

enum LoadBusinessType { COMPANY BROKER }

model Load {
  loadType     LoadType   @default(COMPANY)
  businessType LoadBusinessType?
}
```

## B) API usage

### Org context + settings
- `GET /auth/me` returns `org.settings.operatingMode`
  - `apps/api/src/index.ts` (auth/me)
- `PUT /admin/settings` accepts `operatingMode` enum
  - `apps/api/src/index.ts` (admin/settings)
- `POST /onboarding/basics` accepts `operatingMode`
  - `apps/api/src/index.ts` (onboarding/basics)

**Excerpt (auth/me):**
```ts
settings: { select: { companyDisplayName: true, operatingMode: true } },
...
operatingMode: org.settings?.operatingMode ?? null,
```

### Load creation defaulting
- `POST /loads`:
  - Input accepts `businessType` optional
  - If not provided, defaults to `BROKER` only when org mode is `BROKER`, else `COMPANY`
  - `BOTH` currently falls into the `COMPANY` default path
  - No validation preventing `businessType` outside org mode
  - `apps/api/src/index.ts` (loads create)

**Excerpt (loads create):**
```ts
const settingsForMode = await prisma.orgSettings.findFirst({
  where: { orgId: req.user!.orgId },
  select: { operatingMode: true },
});
const businessType =
  parsed.data.businessType ??
  (settingsForMode?.operatingMode === "BROKER" ? "BROKER" : "COMPANY");
```

### Load confirmations → load creation
- Load creation from confirmation uses same defaulting logic
  - `apps/api/src/index.ts` (load confirmation create)

### Operating entities
- `GET /api/operating-entities` returns all entities (no filtering)
- `POST /api/operating-entities` accepts `type: CARRIER | BROKER`
- `PATCH /api/operating-entities/:id` accepts `type` optional
- No enforcement tied to org operating mode
  - `apps/api/src/index.ts` (operating entities routes)

### Onboarding default entity type
- In `POST /onboarding/basics`, default entity type is set:
  - `BROKER` if org mode is `BROKER`, else `CARRIER`
  - `BOTH` treated as `CARRIER`

**Excerpt (onboarding/basics):**
```ts
const entityType =
  parsed.data.operatingMode === "BROKER" ? OperatingEntityType.BROKER : OperatingEntityType.CARRIER;
```

### Validation / filtering gaps
- No server-side validation ensuring:
  - `businessType` aligns with org operating mode
  - `OperatingEntity.type` aligns with org operating mode
- No query filtering by operating mode in loads/customers/entities lists

## C) Web UI usage

### Onboarding
- Operating mode dropdown includes `Carrier`, `Broker`, `Carrier + Broker`
- Operating entity form includes type dropdown `Carrier/Broker`
  - `apps/web/app/onboarding/page.tsx`

**Excerpt (onboarding operating mode):**
```tsx
<FormField label="Operating mode" htmlFor="operatingMode">
  <Select value={basicsForm.operatingMode} onChange={...}>
    <option value="CARRIER">Carrier</option>
    <option value="BROKER">Broker</option>
    <option value="BOTH">Carrier + Broker</option>
  </Select>
</FormField>
```

### Admin settings
- Operating mode dropdown includes `Carrier`, `Broker`, `Carrier + Broker`
- Operating entity form includes `Carrier/Broker`
  - `apps/web/app/admin/page.tsx`

### Loads
- Load create: `Load type` dropdown has `Company load` vs `Brokered load`
  - Business type derived client-side: `BROKERED → BROKER`, else `COMPANY`
  - `orgOperatingMode` is fetched but not used to gate UI
  - `apps/web/app/loads/page.tsx`
- Load details edit: load type dropdown shows `Company/Brokered`
  - `apps/web/app/loads/[id]/page.tsx`
- Load confirmations: draft `Load type` includes `COMPANY/BROKERED` plus equipment types
  - `apps/web/app/loads/confirmations/[id]/page.tsx`

**Excerpt (loads create):**
```tsx
<Select value={form.loadType} onChange={...}>
  <option value="COMPANY">Company load</option>
  <option value="BROKERED">Brokered load</option>
</Select>
```

### Other UI surfaces
- No nav gating or filters based on operating mode found.

## D) Worker
- No operating mode usage.
- Worker load confirmation learning uses `brokerName` only.
  - `apps/worker/src/load-confirmations.ts`

## E) Risks / inconsistencies
- `OperatingMode` includes `BOTH` in DB + UI, but API defaulting treats it like `CARRIER`.
- Loads can be created with `businessType` not aligned to org mode; API does not enforce.
- Operating entities can be created with either type regardless of org mode.
- UI does not gate load type options by org operating mode (uses orgOperatingMode state but does not apply).
- Two parallel concepts:
  - `LoadType` includes `BROKERED` and also equipment types (VAN/REEFER/FLATBED/OTHER)
  - `LoadBusinessType` indicates `COMPANY/BROKER`
  - No clear enforcement tying the two together.
