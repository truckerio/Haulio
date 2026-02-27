# Phase 1 PASS

## Canonical Roles
- `ADMIN`
- `DISPATCHER`
- `HEAD_DISPATCHER`
- `BILLING`
- `DRIVER`
- `SAFETY`
- `SUPPORT`

## Capability Summary
| Role | Dispatch Exec | Upload Docs | Charges View | Charges Edit | Tracking Start | Billing Actions | Settlement Preview | Admin |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ADMIN | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| DISPATCHER | Yes | Yes | Yes | Yes | Yes | No | Yes | No |
| HEAD_DISPATCHER | Yes | Yes | Yes | Yes | Yes | No | Yes | No |
| BILLING | No | Yes | Yes | No | No | Yes | Yes | No |
| SAFETY | No | No | No | No | No | No | No | No |
| SUPPORT | No | No | No | No | No | No | No | No |
| DRIVER | No | No | No | No | Yes (assigned-load controls) | No | No | No |

## Phase 1 Smoke Checks

### ADMIN
1. Login as ADMIN.
2. Confirm landing route is `/admin`.
3. Open a load and verify docs upload, charges edit, and tracking controls are visible.
4. Expected: all actions available.

### DISPATCHER and HEAD_DISPATCHER parity
1. Login as DISPATCHER and HEAD_DISPATCHER in separate sessions.
2. For the same load, call or use UI for:
   - upload docs (`POST /loads/:id/docs`)
   - create/update charges (`POST/PATCH /loads/:id/charges`)
   - start tracking (`POST /tracking/load/:id/start`)
3. Expected: both roles succeed for the same execution actions.

### BILLING boundary
1. Login as BILLING.
2. Verify billing actions and finance surfaces are visible.
3. Attempt trip assignment action.
4. Expected: assignment action hidden/restricted; billing actions available.

### SAFETY boundary
1. Login as SAFETY.
2. Confirm landing route is `/loads`.
3. Open load/trip detail and confirm read-only visibility.
4. Attempt charge mutation/docs upload/tracking start.
5. Expected: write actions hidden/restricted and backend rejects write attempts.

### SUPPORT boundary
1. Login as SUPPORT.
2. Confirm landing route is `/loads`.
3. Confirm read-only trip/load access and notes visibility.
4. Attempt charge mutation/docs upload/tracking start.
5. Expected: write actions hidden/restricted and backend rejects write attempts.

## Commands
Run from repo root:

```bash
pnpm --filter @truckerio/api run test:authz
pnpm --filter @truckerio/api exec tsc -p tsconfig.json --noEmit
pnpm --filter @truckerio/web run test:capabilities
pnpm --filter @truckerio/web run typecheck
pnpm demo:smoke:roles
```

## Notes
- UI is fail-closed for restricted actions (403 -> hidden/restricted state).
- Dispatch execution parity between `DISPATCHER` and `HEAD_DISPATCHER` is enforced via shared capability guards.
