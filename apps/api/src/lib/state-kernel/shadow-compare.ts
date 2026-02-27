import { BillingStatus, LoadStatus } from "@truckerio/db";
import { buildKernelStateFromLegacyLoad } from "./transitions";
import type { KernelState, StateDomain } from "./types";

export type LegacyLoadShadowSnapshot = {
  status: LoadStatus;
  billingStatus?: BillingStatus | null;
  podVerifiedAt?: Date | null;
};

export type KernelShadowComparison = {
  matches: boolean;
  diffKeys: StateDomain[];
  normalizedLegacyAfter: KernelState;
  kernelAfter: KernelState;
};

export function buildKernelPatchFromLegacyLoadSnapshots(params: {
  legacyBefore: LegacyLoadShadowSnapshot;
  legacyAfter: LegacyLoadShadowSnapshot;
}): Partial<KernelState> {
  const before = buildKernelStateFromLegacyLoad(params.legacyBefore);
  const after = buildKernelStateFromLegacyLoad(params.legacyAfter);
  const patch: Partial<KernelState> = {};
  if (before.execution !== after.execution) patch.execution = after.execution;
  if (before.doc !== after.doc) patch.doc = after.doc;
  if (before.finance !== after.finance) patch.finance = after.finance;
  if (before.compliance !== after.compliance) patch.compliance = after.compliance;
  return patch;
}

export function compareLoadKernelShadow(params: {
  legacyAfter: LegacyLoadShadowSnapshot;
  kernelAfter: KernelState;
}): KernelShadowComparison {
  const normalizedLegacyAfter = buildKernelStateFromLegacyLoad(params.legacyAfter);
  const diffKeys: StateDomain[] = [];
  if (normalizedLegacyAfter.execution !== params.kernelAfter.execution) diffKeys.push("execution");
  if (normalizedLegacyAfter.doc !== params.kernelAfter.doc) diffKeys.push("doc");
  if (normalizedLegacyAfter.finance !== params.kernelAfter.finance) diffKeys.push("finance");
  if (normalizedLegacyAfter.compliance !== params.kernelAfter.compliance) diffKeys.push("compliance");
  return {
    matches: diffKeys.length === 0,
    diffKeys,
    normalizedLegacyAfter,
    kernelAfter: params.kernelAfter,
  };
}
