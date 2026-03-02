# Stress Test Runbook

## Full Stress Command

```bash
cd /Users/karanpreetsingh/demo-truckerio1-phase1 && \
ORG_ID='cmluiq46j0000c8vh3s1fzz5p' \
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5433/haulio' \
API_BASE='http://127.0.0.1:4000' \
pnpm stress:full
```

## Tunables

- `SMOKE_CYCLES` (default `3`)
- `HEALTH_BURST_REQUESTS` (default `2000`)
- `HEALTH_BURST_PARALLEL` (default `50`)
- `STRESS_LOG_FILE` (default `/tmp/haulio-stress/stress-<timestamp>.log`)

Example:

```bash
SMOKE_CYCLES=5 HEALTH_BURST_REQUESTS=5000 HEALTH_BURST_PARALLEL=100 pnpm stress:full
```

## What It Runs

1. API health wait
2. Prisma migration status
3. `ci:godlevel:complete`
4. `ci:kernel:phasee`
5. Repeated smoke cycles:
   - `demo:smoke`
   - `demo:smoke:phase2`
   - `demo:smoke:phase3`
   - `demo:smoke:phase5`
   - `demo:smoke:roles`
   - `demo:smoke:enforce`
   - `ci:drift`
6. Concurrent health burst
7. Post-stress kernel divergence report
