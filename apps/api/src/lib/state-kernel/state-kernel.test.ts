import assert from "node:assert/strict";
import { BillingStatus, LoadStatus } from "@truckerio/db";
import { applyKernelTransition } from "./apply-transition";
import { evaluateKernelInvariants } from "./invariants";
import { buildKernelPatchFromLegacyLoadSnapshots, compareLoadKernelShadow } from "./shadow-compare";
import { buildKernelStateFromLegacyLoad, canTransitionLegacyLoadStatus, isExecutionTransitionAllowed } from "./transitions";
import type { KernelState } from "./types";

assert.equal(canTransitionLegacyLoadStatus(LoadStatus.ASSIGNED, LoadStatus.IN_TRANSIT), true);
assert.equal(canTransitionLegacyLoadStatus(LoadStatus.ASSIGNED, LoadStatus.PAID), false);

assert.equal(
  isExecutionTransitionAllowed({
    authority: "LOAD",
    current: "PLANNED",
    next: "ASSIGNED",
  }),
  true
);
assert.equal(
  isExecutionTransitionAllowed({
    authority: "LOAD",
    current: "PLANNED",
    next: "COMPLETE",
  }),
  false
);

const baseline: KernelState = {
  execution: "PLANNED",
  doc: "MISSING",
  finance: "BLOCKED",
  compliance: "CLEAR",
};

const validTransition = applyKernelTransition({
  authority: "LOAD",
  current: baseline,
  next: { execution: "ASSIGNED" },
});
assert.equal(validTransition.ok, true);
assert.equal(validTransition.state.execution, "ASSIGNED");

const invalidExecutionTransition = applyKernelTransition({
  authority: "LOAD",
  current: baseline,
  next: { execution: "COMPLETE" },
});
assert.equal(invalidExecutionTransition.ok, false);
assert.equal(invalidExecutionTransition.state.execution, "PLANNED");
assert.ok(
  invalidExecutionTransition.violations.some((violation) => violation.code === "INVALID_EXECUTION_TRANSITION")
);

const invalidFinanceState = applyKernelTransition({
  authority: "LOAD",
  current: baseline,
  next: { finance: "READY" },
});
assert.equal(invalidFinanceState.ok, false);
assert.ok(
  invalidFinanceState.violations.some((violation) => violation.code === "FINANCE_REQUIRES_VALID_DOCS")
);

const unsafeOverride = applyKernelTransition({
  authority: "LOAD",
  current: baseline,
  next: { execution: "COMPLETE" },
  context: { allowUnsafe: true, reason: "shadow-mode-check" },
});
assert.equal(unsafeOverride.ok, true);
assert.equal(unsafeOverride.state.execution, "COMPLETE");

const fromLegacy = buildKernelStateFromLegacyLoad({
  status: LoadStatus.READY_TO_INVOICE,
  billingStatus: BillingStatus.READY,
  podVerifiedAt: new Date("2026-02-27T00:00:00Z"),
});
assert.equal(fromLegacy.execution, "COMPLETE");
assert.equal(fromLegacy.doc, "VERIFIED");
assert.equal(fromLegacy.finance, "READY");

const invariantWarnings = evaluateKernelInvariants({
  execution: "IN_TRANSIT",
  doc: "VERIFIED",
  finance: "PAID",
  compliance: "BLOCKED",
});
assert.ok(invariantWarnings.some((violation) => violation.code === "TRANSIT_REQUIRES_COMPLIANCE_CLEARANCE"));

const matchingShadow = compareLoadKernelShadow({
  legacyAfter: {
    status: LoadStatus.PAID,
    billingStatus: BillingStatus.READY,
    podVerifiedAt: new Date("2026-02-27T00:00:00Z"),
  },
  kernelAfter: {
    execution: "COMPLETE",
    doc: "VERIFIED",
    finance: "PAID",
    compliance: "CLEAR",
  },
});
assert.equal(matchingShadow.matches, true);
assert.deepEqual(matchingShadow.diffKeys, []);

const divergedShadow = compareLoadKernelShadow({
  legacyAfter: {
    status: LoadStatus.PAID,
    billingStatus: BillingStatus.READY,
    podVerifiedAt: new Date("2026-02-27T00:00:00Z"),
  },
  kernelAfter: {
    execution: "IN_TRANSIT",
    doc: "VERIFIED",
    finance: "PAID",
    compliance: "CLEAR",
  },
});
assert.equal(divergedShadow.matches, false);
assert.deepEqual(divergedShadow.diffKeys, ["execution"]);

const kernelPatch = buildKernelPatchFromLegacyLoadSnapshots({
  legacyBefore: {
    status: LoadStatus.PLANNED,
    billingStatus: BillingStatus.BLOCKED,
    podVerifiedAt: null,
  },
  legacyAfter: {
    status: LoadStatus.READY_TO_INVOICE,
    billingStatus: BillingStatus.READY,
    podVerifiedAt: new Date("2026-02-27T00:00:00Z"),
  },
});
assert.deepEqual(kernelPatch, {
  execution: "COMPLETE",
  doc: "VERIFIED",
  finance: "READY",
});

const noChangePatch = buildKernelPatchFromLegacyLoadSnapshots({
  legacyBefore: {
    status: LoadStatus.ASSIGNED,
    billingStatus: BillingStatus.BLOCKED,
    podVerifiedAt: null,
  },
  legacyAfter: {
    status: LoadStatus.ASSIGNED,
    billingStatus: BillingStatus.BLOCKED,
    podVerifiedAt: null,
  },
});
assert.deepEqual(noChangePatch, {});

console.log("state-kernel tests passed");
