import type {
  Load,
  Placement,
  PlanSummary,
  SuggestedPlan,
  TrailerSpec,
  Violation,
  YardOsViolationSeverity,
  YardOsViolationType,
} from "@yardos/contracts";

export const DEFAULT_TRAILER_SPEC: TrailerSpec = {
  interiorLengthM: 16,
  interiorWidthM: 2.46,
  interiorHeightM: 2.67,
  laneCount: 2,
  slotCount: 20,
  legalWeightLbs: 44000,
  driveAxleX: -2.2,
  trailerAxleX: 4,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function normalizeTrailerSpec(spec?: Partial<TrailerSpec> | null): TrailerSpec {
  return {
    ...DEFAULT_TRAILER_SPEC,
    ...(spec ?? {}),
  };
}

function sortByStopWindowAndDestination(loads: Load[]): Load[] {
  return [...loads].sort((a, b) => {
    const sA = a.stopWindow ?? "";
    const sB = b.stopWindow ?? "";
    if (sA !== sB) return sA.localeCompare(sB);
    const dA = a.destinationCode ?? "";
    const dB = b.destinationCode ?? "";
    if (dA !== dB) return dA.localeCompare(dB);
    return a.id.localeCompare(b.id);
  });
}

function sortByWeightDesc(loads: Load[]): Load[] {
  return [...loads].sort((a, b) => {
    if (b.weightLbs !== a.weightLbs) return b.weightLbs - a.weightLbs;
    return a.id.localeCompare(b.id);
  });
}

function sortByPalletsDesc(loads: Load[]): Load[] {
  return [...loads].sort((a, b) => {
    if (b.pallets !== a.pallets) return b.pallets - a.pallets;
    return a.id.localeCompare(b.id);
  });
}

export function createDeterministicPlacements(loads: Load[], specLike?: Partial<TrailerSpec> | null): { placements: Placement[]; violations: Violation[] } {
  const spec = normalizeTrailerSpec(specLike);
  const placements: Placement[] = [];
  const violations: Violation[] = [];

  const laneCount = Math.max(1, spec.laneCount);
  const slotCount = Math.max(1, spec.slotCount);
  const capacity = laneCount * slotCount;

  let sequenceIndex = 1;
  let slotIndex = 0;
  let laneIndex = 0;

  for (const load of loads) {
    const pallets = Math.max(0, Math.floor(load.pallets || 0));
    const palletWeight = pallets > 0 ? Math.max(0, load.weightLbs) / pallets : 0;

    for (let palletIndex = 0; palletIndex < pallets; palletIndex += 1) {
      const absoluteIndex = slotIndex * laneCount + laneIndex;
      if (absoluteIndex >= capacity) {
        violations.push({
          loadId: load.id,
          palletIndices: [palletIndex],
          severity: "high",
          type: "OVER_CAPACITY",
          reason: "Trailer slot capacity exceeded.",
          suggestedFix: "Add another trailer or reduce pallets in this plan.",
        });
        continue;
      }

      placements.push({
        loadId: load.id,
        palletIndex,
        slotIndex,
        laneIndex,
        dims: { x: 1.2, y: 1.0, z: 1.0 },
        dimsLabel: "48in x 40in x 62in",
        weightLbs: Number(palletWeight.toFixed(2)),
        sequenceIndex,
        destinationCode: load.destinationCode ?? null,
        stopWindow: load.stopWindow ?? null,
      });

      sequenceIndex += 1;
      laneIndex += 1;
      if (laneIndex >= laneCount) {
        laneIndex = 0;
        slotIndex += 1;
      }
    }
  }

  return { placements, violations };
}

function summarizeViolations(violations: Violation[]) {
  const severities: Record<YardOsViolationSeverity, number> = {
    low: 0,
    warning: 0,
    high: 0,
    critical: 0,
  };
  const types: Partial<Record<YardOsViolationType, number>> = {};

  for (const violation of violations) {
    severities[violation.severity] += 1;
    types[violation.type] = (types[violation.type] ?? 0) + 1;
  }

  return { severities, types };
}

export function summarizePlan(params: {
  loads: Load[];
  placements: Placement[];
  trailerSpec?: Partial<TrailerSpec> | null;
  violations?: Violation[];
}): PlanSummary {
  const spec = normalizeTrailerSpec(params.trailerSpec);
  const loadWeight = params.loads.reduce((sum, load) => sum + Math.max(0, load.weightLbs), 0);
  const placedWeight = params.placements.reduce((sum, placement) => sum + Math.max(0, placement.weightLbs), 0);
  const totalWeightLbs = Math.round(placedWeight > 0 ? placedWeight : loadWeight);
  const palletCount = params.placements.length > 0
    ? params.placements.length
    : params.loads.reduce((sum, load) => sum + Math.max(0, Math.floor(load.pallets || 0)), 0);

  const totalSlots = Math.max(1, spec.laneCount * spec.slotCount);
  const fillPct = Number(((palletCount / totalSlots) * 100).toFixed(1));

  let frontWeight = 0;
  let rearWeight = 0;
  const safeSlotCount = Math.max(1, spec.slotCount);
  for (const placement of params.placements) {
    const slot = clamp(placement.slotIndex, 0, safeSlotCount - 1);
    const xNorm = (slot + 0.5) / safeSlotCount;
    const weight = Math.max(0, placement.weightLbs);
    frontWeight += weight * (1 - xNorm);
    rearWeight += weight * xNorm;
  }

  if (params.placements.length === 0 && totalWeightLbs > 0) {
    frontWeight = totalWeightLbs * 0.5;
    rearWeight = totalWeightLbs * 0.5;
  }

  const frontPct = totalWeightLbs > 0 ? frontWeight / totalWeightLbs : 0.5;
  const delta = Math.abs(frontPct - 0.5);
  const overweight = totalWeightLbs > spec.legalWeightLbs;
  const axleStatus: PlanSummary["axleBalance"]["status"] = overweight
    ? "BAD"
    : delta > 0.12
      ? "BAD"
      : delta > 0.07
        ? "WARNING"
        : "GOOD";

  const violations = [...(params.violations ?? [])];
  if (overweight) {
    violations.push({
      severity: "high",
      type: "OVERWEIGHT_TRAILER",
      reason: "Total planned trailer weight exceeds legal limit.",
      suggestedFix: "Move some pallets to another trailer.",
    });
  }
  if (axleStatus !== "GOOD") {
    violations.push({
      severity: axleStatus === "BAD" ? "high" : "warning",
      type: "AXLE_IMBALANCE",
      reason: "Front/rear axle load split is outside recommended range.",
      suggestedFix: "Shift heavier pallets toward the lighter side.",
    });
  }

  const { severities, types } = summarizeViolations(violations);

  return {
    loadCount: params.loads.length,
    palletCount,
    totalWeightLbs,
    legalWeightLbs: spec.legalWeightLbs,
    overweight,
    fillPct,
    axleBalance: {
      status: axleStatus,
      frontWeightLbs: Math.round(frontWeight),
      rearWeightLbs: Math.round(rearWeight),
      frontPct: Number(frontPct.toFixed(4)),
    },
    violationsBySeverity: severities,
    violationsByType: types,
  };
}

function deriveRisk(summary: PlanSummary): SuggestedPlan["risk"] {
  if (summary.overweight || summary.axleBalance.status === "BAD") return "HIGH";
  if (summary.axleBalance.status === "WARNING") return "MEDIUM";
  return "LOW";
}

function scoreSummary(summary: PlanSummary): number {
  const fillScore = summary.fillPct;
  const weightPenalty = summary.overweight ? 30 : 0;
  const axlePenalty = summary.axleBalance.status === "BAD" ? 18 : summary.axleBalance.status === "WARNING" ? 8 : 0;
  const violationPenalty = (summary.violationsBySeverity.high * 6) + (summary.violationsBySeverity.critical * 10);
  return Math.max(35, Math.min(99, Math.round(fillScore - weightPenalty - axlePenalty - violationPenalty + 20)));
}

export function buildSuggestedPlans(loads: Load[], specLike?: Partial<TrailerSpec> | null): SuggestedPlan[] {
  const spec = normalizeTrailerSpec(specLike);
  const variants: Array<{ planId: string; name: string; loads: Load[]; notes: string[] }> = [
    {
      planId: "plan-a",
      name: "Plan A",
      loads: sortByStopWindowAndDestination(loads),
      notes: ["Optimized route order", "Balanced load", "Minimal empty space"],
    },
    {
      planId: "plan-b",
      name: "Plan B",
      loads: sortByWeightDesc(loads),
      notes: ["Faster dock sequence", "Moderate risk profile"],
    },
    {
      planId: "plan-c",
      name: "Plan C",
      loads: sortByPalletsDesc(loads),
      notes: ["Max pallet density", "Higher concentration of heavy loads"],
    },
  ];

  return variants.map((variant, idx) => {
    const { placements, violations } = createDeterministicPlacements(variant.loads, spec);
    const summary = summarizePlan({
      loads: variant.loads,
      placements,
      trailerSpec: spec,
      violations,
    });

    const score = scoreSummary(summary);
    const savingsUsd = Math.max(450, Math.round((score * 17) + (summary.fillPct * 8) - (idx * 220)));

    return {
      planId: variant.planId,
      name: variant.name,
      score,
      savingsUsd,
      risk: deriveRisk(summary),
      notes: variant.notes,
      loads: variant.loads,
      placements,
      violations,
      summary,
    };
  });
}
