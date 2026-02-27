import assert from "node:assert/strict";
import { BillingStatus, LoadStatus } from "@truckerio/db";
import { applyKernelTransition } from "./apply-transition";
import { buildKernelPatchFromLegacyLoadSnapshots, compareLoadKernelShadow } from "./shadow-compare";
import { buildKernelStateFromLegacyLoad } from "./transitions";
import type { LegacyLoadShadowSnapshot } from "./shadow-compare";

type RouteCase = {
  route: string;
  method: "POST" | "PATCH" | "DELETE";
  before: LegacyLoadShadowSnapshot;
  after: LegacyLoadShadowSnapshot;
  expectBlocking: boolean;
  expectDiff: boolean;
};

function runCase(testCase: RouteCase) {
  const beforeKernel = buildKernelStateFromLegacyLoad(testCase.before);
  const patch = buildKernelPatchFromLegacyLoadSnapshots({
    legacyBefore: testCase.before,
    legacyAfter: testCase.after,
  });
  const result = applyKernelTransition({
    authority: "LOAD",
    current: beforeKernel,
    next: patch,
    // Shadow behavior should record violations but continue evaluating candidate state.
    context: { allowUnsafe: true, reason: `${testCase.method} ${testCase.route}` },
  });
  const comparison = compareLoadKernelShadow({
    legacyAfter: testCase.after,
    kernelAfter: result.candidateState,
  });
  const blocking = result.violations.some((entry) => entry.severity === "ERROR");

  assert.equal(
    blocking,
    testCase.expectBlocking,
    `${testCase.method} ${testCase.route}: unexpected blocking violation state`
  );
  assert.equal(
    comparison.matches,
    !testCase.expectDiff,
    `${testCase.method} ${testCase.route}: unexpected diffKeys=${comparison.diffKeys.join(",")}`
  );
}

const baseline: LegacyLoadShadowSnapshot = {
  status: LoadStatus.ASSIGNED,
  billingStatus: BillingStatus.BLOCKED,
  podVerifiedAt: null,
};

const cases: RouteCase[] = [
  {
    method: "POST",
    route: "/loads/:id/charges",
    before: baseline,
    after: baseline,
    expectBlocking: false,
    expectDiff: false,
  },
  {
    method: "PATCH",
    route: "/loads/:id/charges/:chargeId",
    before: baseline,
    after: baseline,
    expectBlocking: false,
    expectDiff: false,
  },
  {
    method: "POST",
    route: "/tracking/load/:loadId/start",
    before: baseline,
    after: baseline,
    expectBlocking: false,
    expectDiff: false,
  },
  {
    method: "POST",
    route: "/loads/:loadId/stops/:stopId/arrive",
    before: {
      status: LoadStatus.ASSIGNED,
      billingStatus: BillingStatus.BLOCKED,
      podVerifiedAt: null,
    },
    after: {
      status: LoadStatus.IN_TRANSIT,
      billingStatus: BillingStatus.BLOCKED,
      podVerifiedAt: null,
    },
    expectBlocking: false,
    expectDiff: false,
  },
  {
    method: "POST",
    route: "/loads/:loadId/stops/:stopId/depart",
    before: {
      status: LoadStatus.IN_TRANSIT,
      billingStatus: BillingStatus.BLOCKED,
      podVerifiedAt: null,
    },
    after: {
      status: LoadStatus.DELIVERED,
      billingStatus: BillingStatus.BLOCKED,
      podVerifiedAt: null,
    },
    expectBlocking: false,
    expectDiff: false,
  },
  {
    method: "POST",
    route: "/loads/:loadId/docs",
    before: {
      status: LoadStatus.DELIVERED,
      billingStatus: BillingStatus.BLOCKED,
      podVerifiedAt: null,
    },
    after: {
      status: LoadStatus.POD_RECEIVED,
      billingStatus: BillingStatus.BLOCKED,
      podVerifiedAt: null,
    },
    expectBlocking: false,
    expectDiff: false,
  },
  {
    method: "POST",
    route: "/docs/:id/verify",
    before: {
      status: LoadStatus.DELIVERED,
      billingStatus: BillingStatus.BLOCKED,
      podVerifiedAt: null,
    },
    after: {
      status: LoadStatus.READY_TO_INVOICE,
      billingStatus: BillingStatus.READY,
      podVerifiedAt: new Date("2026-02-27T00:00:00Z"),
    },
    expectBlocking: false,
    expectDiff: false,
  },
  {
    method: "POST",
    route: "/trips/:id/assign",
    before: {
      status: LoadStatus.PLANNED,
      billingStatus: BillingStatus.BLOCKED,
      podVerifiedAt: null,
    },
    after: {
      status: LoadStatus.ASSIGNED,
      billingStatus: BillingStatus.BLOCKED,
      podVerifiedAt: null,
    },
    expectBlocking: false,
    expectDiff: false,
  },
  {
    method: "POST",
    route: "regression.invalid-legacy-jump",
    before: {
      status: LoadStatus.PLANNED,
      billingStatus: BillingStatus.BLOCKED,
      podVerifiedAt: null,
    },
    after: {
      status: LoadStatus.PAID,
      billingStatus: BillingStatus.READY,
      podVerifiedAt: new Date("2026-02-27T00:00:00Z"),
    },
    expectBlocking: true,
    expectDiff: false,
  },
];

for (const testCase of cases) {
  runCase(testCase);
}

console.log("state-kernel first-wave route contracts passed");
