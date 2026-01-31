export const ASSIST_MODEL_VERSION = "assist_v1";
export const ASSIST_WEIGHTS_VERSION = "default_2026_01";

export const ASSIST_WEIGHTS = {
  proximity: 40,
  reliability: 20,
  laneFamiliarity: 10,
  consistency: 10,
  freshness: 10,
  workloadPenalty: 10,
};

export type LocationConfidence = "high" | "medium" | "low";

export type SuggestionFields = {
  deadheadMiles: number | null;
  locationConfidence: LocationConfidence;
  hosFeasible: boolean | null;
  onTimeRate30: number | null;
};

export type SuggestionInput = {
  driverId: string;
  truckId: string | null;
  distanceMiles: number | null;
  pingAgeMinutes: number | null;
  onTimeRate: number | null;
  laneCount: number;
  pairCount: number;
  recentLoadCount: number;
  hosFeasible: boolean | null;
  appointmentStart?: Date | null;
  appointmentEnd?: Date | null;
  pickupLabel?: string | null;
  truckLabel?: string | null;
};

export type ScoredSuggestion = {
  driverId: string;
  truckId: string | null;
  score: number;
  reasons: string[];
  warnings: string[];
  fields: SuggestionFields;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

const proximityScore = (distanceMiles: number | null) => {
  if (distanceMiles === null || Number.isNaN(distanceMiles)) return 0;
  const capped = Math.min(distanceMiles, 200);
  return ASSIST_WEIGHTS.proximity * (1 - capped / 200);
};

const reliabilityScore = (onTimeRate: number | null) => {
  if (onTimeRate === null || Number.isNaN(onTimeRate)) return 0;
  return ASSIST_WEIGHTS.reliability * clamp(onTimeRate, 0, 1);
};

const laneScore = (laneCount: number) => {
  if (!laneCount) return 0;
  return (ASSIST_WEIGHTS.laneFamiliarity * clamp(laneCount, 0, 5)) / 5;
};

const consistencyScore = (pairCount: number) => {
  if (!pairCount) return 0;
  return (ASSIST_WEIGHTS.consistency * clamp(pairCount, 0, 5)) / 5;
};

const freshnessScore = (pingAgeMinutes: number | null) => {
  if (pingAgeMinutes === null || Number.isNaN(pingAgeMinutes)) return 0;
  if (pingAgeMinutes <= 30) return ASSIST_WEIGHTS.freshness;
  if (pingAgeMinutes <= 120) return ASSIST_WEIGHTS.freshness * 0.6;
  if (pingAgeMinutes <= 360) return ASSIST_WEIGHTS.freshness * 0.3;
  return 0;
};

const workloadPenalty = (recentLoadCount: number) => {
  if (!recentLoadCount || recentLoadCount <= 3) return 0;
  const penalty = (recentLoadCount - 3) * 2;
  return -Math.min(ASSIST_WEIGHTS.workloadPenalty, penalty);
};

const buildLocationConfidence = (pingAgeMinutes: number | null): LocationConfidence => {
  if (pingAgeMinutes === null || Number.isNaN(pingAgeMinutes)) return "low";
  if (pingAgeMinutes <= 30) return "high";
  if (pingAgeMinutes <= 120) return "medium";
  return "low";
};

export function scoreSuggestion(input: SuggestionInput): ScoredSuggestion {
  const proximity = proximityScore(input.distanceMiles);
  const reliability = reliabilityScore(input.onTimeRate);
  const lane = laneScore(input.laneCount);
  const consistency = consistencyScore(input.pairCount);
  const freshness = freshnessScore(input.pingAgeMinutes);
  const workload = workloadPenalty(input.recentLoadCount);

  const rawScore = proximity + reliability + lane + consistency + freshness + workload;
  const score = clamp(Math.round(rawScore), 0, 100);

  const reasons: Array<{ label: string; weight: number }> = [];
  if (input.distanceMiles !== null && !Number.isNaN(input.distanceMiles)) {
    reasons.push({ label: `${Math.round(input.distanceMiles)} mi from pickup`, weight: proximity });
  }
  if (input.onTimeRate !== null && !Number.isNaN(input.onTimeRate)) {
    reasons.push({ label: `${Math.round(input.onTimeRate * 100)}% on-time (30d)`, weight: reliability });
  }
  if (input.laneCount > 0 && input.pickupLabel) {
    reasons.push({ label: `Familiar with ${input.pickupLabel} lane`, weight: lane });
  }
  if (input.pairCount > 1 && input.truckLabel) {
    reasons.push({ label: `Often runs with Truck ${input.truckLabel}`, weight: consistency });
  }
  if (input.pingAgeMinutes !== null && input.pingAgeMinutes <= 120) {
    reasons.push({ label: "Fresh location ping", weight: freshness });
  }

  const warnings: string[] = [];
  if (input.pingAgeMinutes === null || Number.isNaN(input.pingAgeMinutes)) {
    warnings.push("Location unknown");
  } else if (input.pingAgeMinutes > 120) {
    warnings.push("Location stale");
  }
  if (input.distanceMiles !== null && input.distanceMiles > 200) {
    warnings.push("Long deadhead distance");
  }
  if (input.hosFeasible === null) {
    warnings.push("HOS unknown");
  } else if (input.hosFeasible === false) {
    warnings.push("HOS risk");
  }
  if (input.appointmentStart && input.pingAgeMinutes !== null && input.pingAgeMinutes > 120) {
    const hoursToAppt = (input.appointmentStart.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursToAppt > 0 && hoursToAppt < 3) {
      warnings.push("Tight appointment window");
    }
  }

  reasons.sort((a, b) => b.weight - a.weight);

  return {
    driverId: input.driverId,
    truckId: input.truckId ?? null,
    score,
    reasons: reasons.slice(0, 3).map((reason) => reason.label),
    warnings: warnings.slice(0, 3),
    fields: {
      deadheadMiles: input.distanceMiles !== null && !Number.isNaN(input.distanceMiles) ? input.distanceMiles : null,
      locationConfidence: buildLocationConfidence(input.pingAgeMinutes),
      hosFeasible: input.hosFeasible ?? null,
      onTimeRate30: input.onTimeRate ?? null,
    },
  };
}
