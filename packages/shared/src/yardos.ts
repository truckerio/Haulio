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
  | "TIME_WINDOW"
  | "COMPATIBILITY"
  | "OTHER";

export type YardOsTrailerSpec = {
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

export type YardOsLoad = {
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

export type YardOsPlacementDims = {
  x: number;
  y: number;
  z: number;
};

export type YardOsPlacement = {
  loadId: string;
  palletIndex: number;
  slotIndex: number;
  laneIndex: number;
  dims?: YardOsPlacementDims;
  dimsLabel?: string;
  weightLbs: number;
  sequenceIndex?: number;
  destinationCode?: string | null;
  stopWindow?: string | null;
};

export type YardOsViolation = {
  loadId?: string | null;
  palletIndices?: number[];
  severity: YardOsViolationSeverity;
  reason: string;
  suggestedFix?: string;
  type: YardOsViolationType;
};

export type YardOsPlanSummary = {
  loadCount: number;
  palletCount: number;
  totalWeightLbs: number;
  legalWeightLbs: number;
  overweight: boolean;
  axleBalance: {
    status: "GOOD" | "WARNING" | "BAD";
    frontWeightLbs: number;
    rearWeightLbs: number;
    frontPct: number;
  };
  violationsBySeverity: Record<YardOsViolationSeverity, number>;
  violationsByType: Partial<Record<YardOsViolationType, number>>;
};

export type YardOsContextResponse = {
  orgId: string;
  generatedAt: string;
  source: "truckerio";
  loads: YardOsLoad[];
  trailers: Array<{
    id: string;
    unit?: string | null;
    type?: string | null;
    status?: string | null;
  }>;
  trailerSpecDefaults: YardOsTrailerSpec;
};

export type YardOsPlanPreviewRequest = {
  planId?: string;
  trailerId?: string | null;
  trailerSpec?: Partial<YardOsTrailerSpec>;
  loads: YardOsLoad[];
  placements: YardOsPlacement[];
  violations?: YardOsViolation[];
  source?: string;
};

export type YardOsPlanPreviewResponse = {
  ok: true;
  summary: YardOsPlanSummary;
  notes: string[];
};

export type YardOsPlanApplyRequest = {
  planId: string;
  trailerId?: string | null;
  trailerSpec?: Partial<YardOsTrailerSpec>;
  loads: YardOsLoad[];
  placements: YardOsPlacement[];
  violations?: YardOsViolation[];
  source?: string;
  note?: string;
};

export type YardOsPlanApplyResponse = {
  ok: true;
  planId: string;
  touchedLoads: string[];
  eventsQueued: number;
  summary: YardOsPlanSummary;
};

export type YardOsPlanRejectRequest = {
  planId: string;
  reason: string;
  source?: string;
  loadIds?: string[];
};

export type YardOsPlanRejectResponse = {
  ok: true;
  planId: string;
  reason: string;
  touchedLoads: string[];
};

export type YardOsEventsResponse = {
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
