import {
  DispatchExceptionOwner,
  DispatchExceptionSeverity,
  DispatchExceptionStatus,
  LoadStatus,
  StopType,
} from "@truckerio/db";

export type DispatchRiskFactor = {
  code: string;
  weight: number;
  detail: string;
};

export type DispatchRiskBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type DispatchRiskScore = {
  score: number;
  band: DispatchRiskBand;
  factors: DispatchRiskFactor[];
  recommendedActions: Array<{
    code: string;
    label: string;
    reason: string;
    confidence: number;
  }>;
};

export function scoreShipmentEtaRisk(input: {
  now?: Date;
  status: LoadStatus;
  nextStopType?: StopType | null;
  nextStopAppointmentEnd?: Date | null;
  trackingOffInTransit: boolean;
  openExceptions: number;
  blockingExceptions: number;
  hasDriver: boolean;
  hasTruck: boolean;
  hasTrailer: boolean;
  lastPingAt?: Date | null;
}): DispatchRiskScore {
  const now = input.now ?? new Date();
  const factors: DispatchRiskFactor[] = [];
  let score = 0;

  const missingResources = !input.hasDriver || !input.hasTruck || !input.hasTrailer;
  const executionActive =
    input.status === LoadStatus.PLANNED ||
    input.status === LoadStatus.ASSIGNED ||
    input.status === LoadStatus.IN_TRANSIT;
  if (missingResources && executionActive) {
    score += 25;
    factors.push({
      code: "MISSING_RESOURCES",
      weight: 25,
      detail: "Driver/truck/trailer assignment is incomplete for active execution.",
    });
  }

  if (input.trackingOffInTransit && input.status === LoadStatus.IN_TRANSIT) {
    score += 35;
    factors.push({
      code: "TRACKING_OFF_IN_TRANSIT",
      weight: 35,
      detail: "Tracking is OFF while shipment is in transit.",
    });
  }

  if (input.nextStopAppointmentEnd) {
    const overdueMinutes = Math.round((now.getTime() - input.nextStopAppointmentEnd.getTime()) / 60000);
    if (overdueMinutes > 0) {
      const weight = Math.min(40, 10 + Math.floor(overdueMinutes / 15));
      score += weight;
      factors.push({
        code: "STOP_OVERDUE",
        weight,
        detail: `Next stop is overdue by ${overdueMinutes} minute(s).`,
      });
    }
  }

  if (input.lastPingAt && input.status === LoadStatus.IN_TRANSIT) {
    const staleMinutes = Math.round((now.getTime() - input.lastPingAt.getTime()) / 60000);
    if (staleMinutes >= 30) {
      const weight = Math.min(20, 8 + Math.floor(staleMinutes / 30));
      score += weight;
      factors.push({
        code: "STALE_LOCATION",
        weight,
        detail: `Latest location ping is stale (${staleMinutes} minute(s) old).`,
      });
    }
  }

  if (input.openExceptions > 0) {
    const weight = Math.min(15, input.openExceptions * 4);
    score += weight;
    factors.push({
      code: "OPEN_EXCEPTIONS",
      weight,
      detail: `${input.openExceptions} exception(s) remain unresolved.`,
    });
  }

  if (input.blockingExceptions > 0) {
    const weight = Math.min(20, input.blockingExceptions * 10);
    score += weight;
    factors.push({
      code: "BLOCKING_EXCEPTIONS",
      weight,
      detail: `${input.blockingExceptions} blocker exception(s) are open.`,
    });
  }

  score = Math.max(0, Math.min(100, score));
  const band: DispatchRiskBand = score >= 75 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";

  const recommendedActions: DispatchRiskScore["recommendedActions"] = [];
  if (factors.some((factor) => factor.code === "MISSING_RESOURCES")) {
    recommendedActions.push({
      code: "ASSIGN_RESOURCES",
      label: "Assign resources",
      reason: "Resource assignment reduces execution risk immediately.",
      confidence: 0.92,
    });
  }
  if (factors.some((factor) => factor.code === "TRACKING_OFF_IN_TRANSIT" || factor.code === "STALE_LOCATION")) {
    recommendedActions.push({
      code: "RESTORE_TRACKING",
      label: "Restore tracking",
      reason: "Tracking telemetry is needed for ETA confidence and customer comms.",
      confidence: 0.9,
    });
  }
  if (input.openExceptions > 0) {
    recommendedActions.push({
      code: "TRIAGE_EXCEPTIONS",
      label: "Triage exceptions",
      reason: "Resolving open exceptions lowers blocker risk.",
      confidence: 0.82,
    });
  }

  return { score, band, factors, recommendedActions };
}

export type ExceptionAssistDecision = {
  suggestedOwner: DispatchExceptionOwner;
  suggestedSeverity: DispatchExceptionSeverity;
  rationale: string[];
  recommendedActions: Array<{
    code: "ACKNOWLEDGE_EXCEPTION" | "ROUTE_OWNER" | "CREATE_FOLLOWUP_TASK";
    label: string;
    reason: string;
    payload?: Record<string, unknown>;
    confidence: number;
  }>;
};

export function buildExceptionAssistDecision(input: {
  exception: {
    id: string;
    type: string;
    title: string;
    detail?: string | null;
    status: DispatchExceptionStatus;
    owner: DispatchExceptionOwner;
    severity: DispatchExceptionSeverity;
  };
  risk: DispatchRiskScore;
  hasOpenFollowupTask: boolean;
}): ExceptionAssistDecision {
  const haystack = `${input.exception.type} ${input.exception.title} ${input.exception.detail ?? ""}`.toUpperCase();
  const rationale: string[] = [];
  let suggestedOwner: DispatchExceptionOwner = DispatchExceptionOwner.DISPATCH;

  if (["POD", "BOL", "DOC", "INVOICE", "BILL", "AR", "AP"].some((term) => haystack.includes(term))) {
    suggestedOwner = DispatchExceptionOwner.BILLING;
    rationale.push("Exception keywords map to billing/document workflow.");
  } else if (["TRACK", "DRIVER", "HOS", "BREAK", "ELD"].some((term) => haystack.includes(term))) {
    suggestedOwner = DispatchExceptionOwner.DRIVER;
    rationale.push("Exception keywords map to driver/tracking workflow.");
  } else if (["CUSTOMER", "CONSINGEE", "SHIPPER"].some((term) => haystack.includes(term))) {
    suggestedOwner = DispatchExceptionOwner.CUSTOMER;
    rationale.push("Exception appears customer-facing; route to customer owner lane.");
  } else {
    rationale.push("Defaulting owner to dispatch triage lane.");
  }

  const suggestedSeverity =
    input.risk.band === "CRITICAL" || input.risk.band === "HIGH"
      ? DispatchExceptionSeverity.BLOCKER
      : DispatchExceptionSeverity.WARNING;
  rationale.push(`Risk band is ${input.risk.band}; suggested severity is ${suggestedSeverity}.`);

  const recommendedActions: ExceptionAssistDecision["recommendedActions"] = [];
  if (input.exception.status === DispatchExceptionStatus.OPEN) {
    recommendedActions.push({
      code: "ACKNOWLEDGE_EXCEPTION",
      label: "Acknowledge",
      reason: "Move exception from open queue to active ownership.",
      confidence: 0.84,
    });
  }
  if (input.exception.owner !== suggestedOwner) {
    recommendedActions.push({
      code: "ROUTE_OWNER",
      label: `Route to ${suggestedOwner}`,
      reason: `Current owner is ${input.exception.owner}; suggested owner is ${suggestedOwner}.`,
      payload: { owner: suggestedOwner },
      confidence: 0.8,
    });
  }
  if (!input.hasOpenFollowupTask) {
    recommendedActions.push({
      code: "CREATE_FOLLOWUP_TASK",
      label: "Create follow-up task",
      reason: "No active follow-up task exists for this exception.",
      confidence: 0.74,
    });
  }

  return {
    suggestedOwner,
    suggestedSeverity,
    rationale,
    recommendedActions,
  };
}

export function simulateEtaRiskScenario(input: {
  baseline: {
    status: LoadStatus;
    trackingOffInTransit: boolean;
    openExceptions: number;
    blockingExceptions: number;
    hasDriver: boolean;
    hasTruck: boolean;
    hasTrailer: boolean;
    nextStopAppointmentEnd?: Date | null;
    lastPingAt?: Date | null;
  };
  actions: string[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const baselineScore = scoreShipmentEtaRisk({ ...input.baseline, now });

  const projected = { ...input.baseline };
  for (const action of input.actions.map((value) => value.trim().toUpperCase())) {
    if (action === "ASSIGN_RESOURCES") {
      projected.hasDriver = true;
      projected.hasTruck = true;
      projected.hasTrailer = true;
    }
    if (action === "RESTORE_TRACKING") {
      projected.trackingOffInTransit = false;
      projected.lastPingAt = now;
    }
    if (action === "TRIAGE_EXCEPTIONS") {
      projected.openExceptions = Math.max(0, projected.openExceptions - 1);
      projected.blockingExceptions = Math.max(0, projected.blockingExceptions - 1);
    }
  }

  const projectedScore = scoreShipmentEtaRisk({ ...projected, now });
  return {
    baseline: baselineScore,
    projected: projectedScore,
    delta: {
      score: projectedScore.score - baselineScore.score,
      bandChanged: baselineScore.band !== projectedScore.band,
    },
  };
}
