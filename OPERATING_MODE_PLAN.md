# Operating Mode Plan (No Implementation)

Based on discovery in `OPERATING_MODE_CURRENT_STATE.md`.

## 1) Source of truth
- Use existing `OrgSettings.operatingMode` (enum already includes `CARRIER | BROKER | BOTH`).
- Ensure **all UI + API** treat `BOTH` explicitly (today it falls into the `CARRIER` default).
- Continue exposing `operatingMode` in `GET /auth/me` for UI gating (already present).

## 2) Per-record strategy (where mode applies)

### Loads
- **Primary per-load flag:** `Load.businessType` (`COMPANY | BROKER`).
- **LoadType** continues to be used for operational context (today includes `COMPANY | BROKERED` + equipment types). This is currently overloaded; do not refactor yet. Instead, treat `Load.businessType` as the authoritative “carrier vs broker” flag.
- Behavior by org mode:
  - `CARRIER`: force `businessType=COMPANY`, disallow `BROKER`
  - `BROKER`: force `businessType=BROKER`, disallow `COMPANY`
  - `BOTH`: require explicit `businessType` (or infer from selected load type if that’s how UI works)
- **Legacy handling:** if existing loads conflict with current org mode, show read-only warning but do not delete. (Keep for audit/history.)

### Operating entities
- `OperatingEntity.type` (`CARRIER|BROKER`) already exists.
- Behavior by org mode:
  - `CARRIER`: allow only `CARRIER`
  - `BROKER`: allow only `BROKER`
  - `BOTH`: allow both
- For `BOTH`, onboarding should create a default entity **with an explicit type selection** (or create two defaults if product wants both)

### Customers / brokers
- No customer type in schema.
- UI labeling should adapt: in brokered loads, label “Broker”; in carrier loads, label “Customer”.
- No DB change required unless you want explicit customer types later.

## 3) UI gating plan (exact screens/routes)

### Onboarding
- `apps/web/app/onboarding/page.tsx`
  - Operating mode selection already includes BOTH.
  - **Gate operating entity type options**:
    - `CARRIER`: only show Carrier
    - `BROKER`: only show Broker
    - `BOTH`: show both

### Admin settings
- `apps/web/app/admin/page.tsx`
  - Operating mode select already includes BOTH.
  - **Operating entity form** should show type options per mode (same gating as above).

### Loads (create / edit / confirmation)
- `apps/web/app/loads/page.tsx`
  - Load type dropdown should be gated:
    - `CARRIER`: hide “Brokered load” (and auto-set `businessType=COMPANY`)
    - `BROKER`: hide “Company load” (and auto-set `businessType=BROKER`)
    - `BOTH`: show both; require explicit selection
  - Customer label/placeholder should follow selected mode.

- `apps/web/app/loads/[id]/page.tsx` (load detail edit)
  - Load type options gated to org mode
  - If load’s stored type conflicts with org mode, show read-only warning but do not block access

- `apps/web/app/loads/confirmations/[id]/page.tsx`
  - Load type select options gated to org mode

### Other surfaces (based on discovery)
- `apps/web/app/dispatch/page.tsx` and `apps/web/app/today/page.tsx` do not display mode-specific fields today; no changes required other than load data already filtered by businessType if you add that later.

## 4) API enforcement plan

### Helper
- Add `allowedBusinessTypes(orgMode)` helper:
  - `CARRIER → [COMPANY]`
  - `BROKER → [BROKER]`
  - `BOTH → [COMPANY, BROKER]`

### Enforce on endpoints (from discovery)
- `POST /loads` (`apps/api/src/index.ts`)
  - If org mode is single, override or reject `businessType` not allowed
  - In BOTH mode, require `businessType` (or infer from loadType explicitly)
- Load confirmation create (load draft → create)
  - Apply same businessType validation / inference
- `POST /api/operating-entities`
  - Reject disallowed type when org is single-mode
- `PATCH /api/operating-entities/:id`
  - Reject disallowed type changes in single-mode
- `POST /onboarding/basics`
  - If BOTH, require explicit type for default operating entity (or create two defaults if desired)

### Validation behavior
- **Single-mode:** auto-set missing to allowed value; reject explicit disallowed values
- **BOTH:** require explicit selection; do not silently default

## 5) Migration plan (conceptual only)
- **No new schema required** for operating mode (already exists).
- Potential optional backfill:
  - For existing loads without `businessType`, set `COMPANY` unless org mode is BROKER.
  - Document legacy conflicts (loads stored as broker in carrier-only org) and allow read-only access.
- Optional (future) consistency check: ensure `Load.businessType` is NOT NULL for new loads (after migration + backfill).

## 6) Test plan

### Automated (minimal)
- API unit/integration tests:
  - `POST /loads` rejects businessType outside org mode
  - `POST /api/operating-entities` rejects disallowed type
  - `POST /onboarding/basics` handles BOTH with explicit type

### Manual verification
- Org mode = CARRIER:
  - UI hides brokered options; broker entity type hidden
  - API rejects brokered businessType
- Org mode = BROKER:
  - UI hides company options; carrier entity type hidden
  - API rejects company businessType
- Org mode = BOTH:
  - UI shows both; explicit selection required
  - API accepts both
- Existing loads of “other” mode remain visible but flagged as legacy if needed
