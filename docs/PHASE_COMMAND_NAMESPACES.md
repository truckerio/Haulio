# Phase Command Namespaces

This repo now uses two explicit phase namespaces to avoid overlap:

## 1) Shipment refactor phases (LTL program, 1-5)

- `pnpm shipment:phase1`
- `pnpm shipment:phase2`
- `pnpm shipment:phase3`
- `pnpm shipment:phase4`
- `pnpm shipment:phase5`
- `pnpm shipment:all`

These are the canonical commands for the Shipment/LTL refactor program.

## 2) Platform rollout phases (legacy god-level pipeline, 4-17)

- `pnpm platform:smoke:phase4` ... `pnpm platform:smoke:phase17`
- `pnpm platform:ci:phase4` ... `pnpm platform:ci:phase17`
- `pnpm platform:ci:godlevel:complete`
- `pnpm platform:ci:kernel:phase3`
- `pnpm platform:ci:kernel:phasee`

These are the canonical commands for the existing platform hardening gates.

## Backward compatibility

Legacy commands (`ci:phase*`, `demo:smoke:phase*`, `ci:kernel:phase*`, `ci:godlevel:complete`) remain available as aliases and forward to the namespaced commands.

