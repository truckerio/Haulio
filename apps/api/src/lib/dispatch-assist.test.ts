import assert from "node:assert/strict";
import {
  DispatchExceptionOwner,
  DispatchExceptionSeverity,
  DispatchExceptionStatus,
  LoadStatus,
} from "@truckerio/db";
import { buildExceptionAssistDecision, scoreShipmentEtaRisk, simulateEtaRiskScenario } from "./dispatch-assist";

const now = new Date("2026-03-04T12:00:00.000Z");

const risk = scoreShipmentEtaRisk({
  now,
  status: LoadStatus.IN_TRANSIT,
  trackingOffInTransit: true,
  openExceptions: 2,
  blockingExceptions: 1,
  hasDriver: true,
  hasTruck: false,
  hasTrailer: false,
  nextStopAppointmentEnd: new Date("2026-03-04T10:30:00.000Z"),
  lastPingAt: new Date("2026-03-04T10:00:00.000Z"),
});
assert.equal(risk.band, "CRITICAL");
assert.equal(risk.score >= 75, true);
assert.equal(risk.recommendedActions.some((action) => action.code === "RESTORE_TRACKING"), true);

const assist = buildExceptionAssistDecision({
  exception: {
    id: "ex_1",
    type: "POD_MISSING",
    title: "POD missing",
    status: DispatchExceptionStatus.OPEN,
    owner: DispatchExceptionOwner.DISPATCH,
    severity: DispatchExceptionSeverity.WARNING,
  },
  risk,
  hasOpenFollowupTask: false,
});
assert.equal(assist.suggestedOwner, DispatchExceptionOwner.BILLING);
assert.equal(assist.suggestedSeverity, DispatchExceptionSeverity.BLOCKER);
assert.equal(assist.recommendedActions.some((action) => action.code === "CREATE_FOLLOWUP_TASK"), true);

const simulation = simulateEtaRiskScenario({
  now,
  baseline: {
    status: LoadStatus.IN_TRANSIT,
    trackingOffInTransit: true,
    openExceptions: 2,
    blockingExceptions: 1,
    hasDriver: false,
    hasTruck: false,
    hasTrailer: false,
    nextStopAppointmentEnd: new Date("2026-03-04T11:40:00.000Z"),
    lastPingAt: new Date("2026-03-04T11:00:00.000Z"),
  },
  actions: ["ASSIGN_RESOURCES", "RESTORE_TRACKING", "TRIAGE_EXCEPTIONS"],
});
assert.equal(simulation.delta.score < 0, true);

console.log("dispatch assist tests passed");
