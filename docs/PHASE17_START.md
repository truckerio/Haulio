# Phase 17 START (Controlled Pilot Rollout + Stabilization)

Date: March 2, 2026

## Scope Locked
- No workflow rewrites.
- No net-new business features.
- Rollout/stabilization only for completed God-level phases.

## Objectives
1. Promote consolidated workbench IA into pilot-ready validation.
2. Validate role paths end-to-end with smoke + role matrix + enforce checks.
3. Confirm Safety/Support dedicated workbenches (`/safety`, `/support`) with fail-closed behavior.

## Commands Targeted
```bash
pnpm ci:phase17
```

Required env for enforce wave:
```bash
ORG_ID=<ORG_ID> DATABASE_URL=<DATABASE_URL> API_BASE=<API_BASE> pnpm ci:phase17
```
