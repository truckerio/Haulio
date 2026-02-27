# State Kernel Rollout Runbook

Last updated: February 27, 2026

## 1) Purpose
This runbook defines how to roll out the state kernel in shadow mode, monitor divergence, and move toward enforced transitions without changing business workflows.

## 2) Runtime Flags

Use these flags on `api`:

- `STATE_KERNEL_SHADOW`
- `STATE_KERNEL_ENFORCE`
- `STATE_KERNEL_ENFORCE_ORGS`
- `STATE_KERNEL_DIVERGENCE_LOG`

Expected values by phase:

| Phase | SHADOW | ENFORCE | DIVERGENCE_LOG |
|---|---|---|---|
| Phase A baseline | `true` | `false` | `true` |
| Phase B dry run hardening | `true` | `false` | `true` |
| Phase C controlled enforce (pilot org) | `true` | `true` | `true` |
| Phase C+ broad enforce | `true` | `true` | `true` |

`STATE_KERNEL_ENFORCE_ORGS` must be a comma-separated list of org IDs for pilot enforcement scope.
If `STATE_KERNEL_ENFORCE=true` and `STATE_KERNEL_ENFORCE_ORGS` is empty, enforcement remains disabled.

## 3) Covered Mutation Paths (current)

Shadow comparison is wired in:

- `POST /loads/:id/charges`
- `PATCH /loads/:id/charges/:chargeId`
- `DELETE /loads/:id/charges/:chargeId`
- `POST /loads/:loadId/docs`
- `POST /driver/docs`
- `POST /docs/:id/verify`
- `POST /docs/:id/reject`
- `POST /billing/readiness/:loadId/mark-invoiced`
- `POST /tracking/load/:loadId/start`
- `POST /tracking/load/:loadId/stop`
- `POST /loads/:loadId/stops/:stopId/arrive`
- `POST /loads/:loadId/stops/:stopId/depart`
- `POST /driver/stops/:stopId/arrive`
- `POST /driver/stops/:stopId/depart`
- `POST /trips/:id/assign`
- `POST /trips/:id/status`
- `transitionLoadStatus` internal execution transitions

## 4) Enablement Sequence

1. Deploy code with flags present and set:
   - `STATE_KERNEL_SHADOW=true`
   - `STATE_KERNEL_ENFORCE=false`
   - `STATE_KERNEL_ENFORCE_ORGS=`
   - `STATE_KERNEL_DIVERGENCE_LOG=true`
2. Run parity smoke tests in pre-prod or prod-local.
3. Observe divergence logs for at least one full dispatch + billing cycle.
4. Triage top divergence routes.
5. Close route-level divergence gaps, then repeat.
6. Only after stable parity, pilot `STATE_KERNEL_ENFORCE=true` on controlled org scope.

Pilot example:

```bash
STATE_KERNEL_SHADOW=true
STATE_KERNEL_ENFORCE=true
STATE_KERNEL_ENFORCE_ORGS=cmluiq46j0000c8vh3s1fzz5p
STATE_KERNEL_DIVERGENCE_LOG=true
```

## 5) Verification Commands

Run from repository root:

```bash
pnpm --filter @truckerio/api run test:kernel
pnpm --filter @truckerio/api run test:authz
pnpm --filter @truckerio/api exec node --import tsx src/modules/dispatch/queue-view.test.ts
ORG_ID=<ORG_ID> pnpm demo:kernel:report
```

Prod-local stack start:

```bash
docker compose -p prodlocal \
  --env-file .env.prod.local \
  -f infra/docker/docker-compose.prod-local.yml \
  up -d
```

## 6) Divergence Audit Queries

Each `STATE_KERNEL_DIVERGENCE` row now includes:
- `meta.kernelPatch` (derived transition diff from `legacyBefore -> legacyAfter`)
- `meta.violationCodes` (kernel invariant/transition violations)
- `meta.hasBlockingKernelViolations` (boolean)
- `after.violations` (full violation payload)

Latest divergence rows for an org:

```sql
SELECT
  "createdAt",
  action,
  summary,
  entity,
  "entityId",
  meta->>'route' AS route,
  meta->>'method' AS method,
  meta->'violationCodes' AS violation_codes,
  meta->>'hasBlockingKernelViolations' AS has_blocking,
  meta->'kernelPatch' AS kernel_patch
FROM "AuditLog"
WHERE "orgId" = '<ORG_ID>'
  AND action = 'STATE_KERNEL_DIVERGENCE'
ORDER BY "createdAt" DESC
LIMIT 100;
```

Divergence counts by route and method:

```sql
SELECT
  meta->>'route' AS route,
  meta->>'method' AS method,
  COUNT(*) AS divergence_count
FROM "AuditLog"
WHERE "orgId" = '<ORG_ID>'
  AND action = 'STATE_KERNEL_DIVERGENCE'
GROUP BY 1,2
ORDER BY divergence_count DESC;
```

Blocking kernel violations by route:

```sql
SELECT
  meta->>'route' AS route,
  meta->>'method' AS method,
  COUNT(*) AS blocking_violation_count
FROM "AuditLog"
WHERE "orgId" = '<ORG_ID>'
  AND action = 'STATE_KERNEL_DIVERGENCE'
  AND COALESCE((meta->>'hasBlockingKernelViolations')::boolean, false) = true
GROUP BY 1,2
ORDER BY blocking_violation_count DESC;
```

Recent divergence detail (legacy vs kernel state):

```sql
SELECT
  "createdAt",
  summary,
  before,
  after
FROM "AuditLog"
WHERE "orgId" = '<ORG_ID>'
  AND action = 'STATE_KERNEL_DIVERGENCE'
ORDER BY "createdAt" DESC
LIMIT 20;
```

## 7) Phase Gates

### Gate A: Shadow readiness
- All verification commands pass.
- No endpoint failures caused by shadow hooks.
- Divergence logs emit as expected under mutation traffic.

### Gate B: Route parity confidence
- Top mutation routes have known/triaged divergence causes.
- No unknown critical divergence on execution transitions.
- Reproducible smoke run results across at least two org datasets.

### Gate C: Enforce pilot readiness
- Pilot org has no unresolved critical divergence.
- Rollback path verified: `STATE_KERNEL_ENFORCE=false`.
- Monitoring in place for `STATE_KERNEL_DIVERGENCE` and API error rates.

## 8) Rollback

If instability appears:

1. Set `STATE_KERNEL_ENFORCE=false`.
2. Keep `STATE_KERNEL_SHADOW=true` and `STATE_KERNEL_DIVERGENCE_LOG=true` for continued diagnostics.
3. Restart `api` and re-run parity smoke checks.
