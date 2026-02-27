# State Kernel Spec (Phase A)

Last updated: February 27, 2026

## 1) Purpose
Define a single, explicit state contract that all operational mutations can converge on without changing current workflow behavior.

This phase introduces a kernel contract and shadow tooling. It does not force endpoint behavior changes yet.

## 2) Canonical State Domains
The kernel tracks four orthogonal domains:

- `execution`: where the movement is in operational lifecycle
- `doc`: readiness/quality of required document set
- `finance`: revenue lifecycle position
- `compliance`: safety/compliance health for continued execution

## 3) Canonical State Values

### 3.1 `execution`
- `DRAFT`
- `PLANNED`
- `ASSIGNED`
- `IN_TRANSIT`
- `ARRIVED`
- `COMPLETE`
- `CANCELLED`

### 3.2 `doc`
- `MISSING`
- `UPLOADED`
- `VERIFIED`
- `REJECTED`

### 3.3 `finance`
- `BLOCKED`
- `READY`
- `INVOICED`
- `PAID`

### 3.4 `compliance`
- `CLEAR`
- `WARNING`
- `BLOCKED`

## 4) Authority
- `Trip` is execution authority.
- `Load` is commercial authority.
- `Invoice/Settlement/Payables` are financial authority objects.

## 5) Execution Transition Contract

### 5.1 Load execution transitions
- `DRAFT -> PLANNED, CANCELLED`
- `PLANNED -> ASSIGNED, CANCELLED`
- `ASSIGNED -> IN_TRANSIT, PLANNED, CANCELLED`
- `IN_TRANSIT -> ARRIVED, COMPLETE, CANCELLED`
- `ARRIVED -> COMPLETE, CANCELLED`
- `COMPLETE -> (none)`
- `CANCELLED -> (none)`

### 5.2 Trip execution transitions
- `DRAFT -> PLANNED, CANCELLED`
- `PLANNED -> ASSIGNED, CANCELLED`
- `ASSIGNED -> IN_TRANSIT, PLANNED, CANCELLED`
- `IN_TRANSIT -> ARRIVED, COMPLETE, CANCELLED`
- `ARRIVED -> COMPLETE, CANCELLED`
- `COMPLETE -> (none)`
- `CANCELLED -> (none)`

## 6) Legacy-to-Kernel Mapping (Current Bridge)
Current load statuses are mapped to kernel execution states for shadow comparison:

- `DRAFT -> DRAFT`
- `PLANNED -> PLANNED`
- `ASSIGNED -> ASSIGNED`
- `IN_TRANSIT -> IN_TRANSIT`
- `DELIVERED/POD_RECEIVED/READY_TO_INVOICE/INVOICED/PAID -> COMPLETE`
- `CANCELLED -> CANCELLED`

Document and finance mappings derive from current load/billing signals in code.

## 7) Invariants (Phase A)
Current invariant checks:

1. `finance != BLOCKED` requires `doc` not in `MISSING|REJECTED`.
2. `execution == IN_TRANSIT` cannot coexist with `compliance == BLOCKED`.
3. `finance == PAID` before `execution == COMPLETE` is flagged as warning.

These checks are enforceable by the kernel engine, but enforcement mode is controlled separately.

## 8) Apply Contract
Kernel apply request:
- `authority`
- `current` kernel state
- `next` partial kernel state patch
- optional context (`actor`, `reason`, `allowUnsafe`)

Apply response:
- `ok`
- `changedDomains`
- `violations`
- `state` (committed)
- `candidateState` (pre-commit candidate)

## 9) Shadow Comparison Contract
Kernel shadow comparison for loads:
- Normalize legacy post-mutation state into kernel shape.
- Compare against kernel result.
- Return `matches` and `diffKeys`.

This is the basis for divergence logging in rollout phases.

## 10) Runtime Flags
- `STATE_KERNEL_SHADOW`: enables shadow evaluation alongside legacy mutation flow.
- `STATE_KERNEL_ENFORCE`: reserved for enforcement phase; not used to change behavior in Phase A.
- `STATE_KERNEL_DIVERGENCE_LOG`: emits audit entries when legacy and kernel post-states diverge.
