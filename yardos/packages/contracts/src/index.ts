export type YardOsConstraint =
  | "NO_MIX"
  | "NO_SPLIT"
  | "DIRECT_NO_TOUCH"
  | "TEMP_CONTROLLED"
  | "HAZMAT"
  | "STACK_LIMITED"
  | "UNKNOWN";

export type YardOsViolationSeverity = "low" | "warning" | "high" | "critical";

export type YardOsViolationType =
  | "OVERWEIGHT_TRAILER"
  | "AXLE_IMBALANCE"
  | "NO_MIX"
  | "NO_SPLIT"
  | "DIRECT_NO_TOUCH"
  | "OVER_CAPACITY"
  | "TIME_WINDOW"
  | "COMPATIBILITY"
  | "OTHER";

export type TrailerSpec = {
  trailerId?: string;
  trailerUnit?: string;
  trailerType?: string;
  interiorLengthM: number;
  interiorWidthM: number;
  interiorHeightM: number;
  laneCount: number;
  slotCount: number;
  legalWeightLbs: number;
  driveAxleX?: number;
  trailerAxleX?: number;
};

export type Load = {
  id: string;
  loadNumber?: string | null;
  pallets: number;
  weightLbs: number;
  cubeFt?: number | null;
  stopWindow?: string | null;
  lane?: string | null;
  constraints: YardOsConstraint[];
  destinationCode?: string | null;
  trailerId?: string | null;
  trailerUnit?: string | null;
  status?: string | null;
};

export type PlacementDims = {
  x: number;
  y: number;
  z: number;
};

export type Placement = {
  loadId: string;
  palletIndex: number;
  slotIndex: number;
  laneIndex: number;
  dims?: PlacementDims;
  dimsLabel?: string;
  weightLbs: number;
  sequenceIndex?: number;
  destinationCode?: string | null;
  stopWindow?: string | null;
};

export type Violation = {
  loadId?: string | null;
  palletIndices?: number[];
  severity: YardOsViolationSeverity;
  reason: string;
  suggestedFix?: string;
  type: YardOsViolationType;
};

export type PlanSummary = {
  loadCount: number;
  palletCount: number;
  totalWeightLbs: number;
  legalWeightLbs: number;
  overweight: boolean;
  fillPct: number;
  axleBalance: {
    status: "GOOD" | "WARNING" | "BAD";
    frontWeightLbs: number;
    rearWeightLbs: number;
    frontPct: number;
  };
  violationsBySeverity: Record<YardOsViolationSeverity, number>;
  violationsByType: Partial<Record<YardOsViolationType, number>>;
};

export type SuggestedPlan = {
  planId: string;
  name: string;
  score: number;
  savingsUsd: number;
  risk: "LOW" | "MEDIUM" | "HIGH";
  notes: string[];
  loads: Load[];
  placements: Placement[];
  violations: Violation[];
  summary: PlanSummary;
};

export type ContextResponse = {
  orgId: string;
  generatedAt: string;
  source: "yardos";
  loads: Load[];
  trailers: Array<{
    id: string;
    unit?: string | null;
    type?: string | null;
    status?: string | null;
  }>;
  trailerSpecDefaults: TrailerSpec;
};

export type SuggestedPlansRequest = {
  loadIds?: string[];
  trailerId?: string | null;
  trailerSpec?: Partial<TrailerSpec>;
};

export type SuggestedPlansResponse = {
  ok: true;
  plans: SuggestedPlan[];
};

export type PlanPreviewRequest = {
  planId?: string;
  trailerId?: string | null;
  trailerSpec?: Partial<TrailerSpec>;
  loads: Load[];
  placements?: Placement[];
  violations?: Violation[];
  source?: string;
};

export type PlanPreviewResponse = {
  ok: true;
  summary: PlanSummary;
  notes: string[];
};

export type PlanApplyRequest = {
  planId: string;
  trailerId?: string | null;
  trailerSpec?: Partial<TrailerSpec>;
  loads: Load[];
  placements: Placement[];
  violations?: Violation[];
  source?: string;
  note?: string;
};

export type PlanApplyResponse = {
  ok: true;
  planId: string;
  touchedLoads: string[];
  eventsQueued: number;
  summary: PlanSummary;
};

export type PlanRejectRequest = {
  planId: string;
  reason: string;
  source?: string;
  loadIds?: string[];
};

export type PlanRejectResponse = {
  ok: true;
  planId: string;
  reason: string;
  touchedLoads: string[];
};

export type TrailerSpecUpdateResponse = {
  ok: true;
  trailerSpecDefaults: TrailerSpec;
};

export type EventsResponse = {
  orgId: string;
  nextCursor: string | null;
  events: Array<{
    id: string;
    createdAt: string;
    type: string;
    loadId?: string | null;
    message: string;
    meta?: Record<string, unknown> | null;
  }>;
};

export type LoadImportMode = "append" | "upsert" | "replace";

export type LoadImportError = {
  row: number;
  message: string;
};

export type LoadImportResponse = {
  ok: true;
  mode: LoadImportMode;
  imported: number;
  updated: number;
  skipped: number;
  totalLoads: number;
  errors: LoadImportError[];
};
