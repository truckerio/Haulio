import assert from "node:assert/strict";
import { LoadStatus, TripStatus } from "@truckerio/db";
import {
  buildLoadExecutionMirrorState,
  getBlockedLoadExecutionMutationFields,
  isLoadExecutionMirrorEqual,
  LEGACY_EXECUTION_REJECTION_MESSAGE,
  normalizeTripStatusForLoad,
} from "./execution-authority";

assert.deepStrictEqual(getBlockedLoadExecutionMutationFields({}), []);
assert.deepStrictEqual(getBlockedLoadExecutionMutationFields({ status: "ASSIGNED" }), ["status"]);
assert.deepStrictEqual(getBlockedLoadExecutionMutationFields({ movementMode: "LTL" }), ["movementMode"]);
assert.deepStrictEqual(getBlockedLoadExecutionMutationFields({ status: "IN_TRANSIT", movementMode: "FTL" }), [
  "status",
  "movementMode",
]);

assert.equal(
  LEGACY_EXECUTION_REJECTION_MESSAGE.assign,
  "Direct load assignment is disabled. Use trip assignment endpoints (/trips, /trips/:id/assign)."
);
assert.equal(
  LEGACY_EXECUTION_REJECTION_MESSAGE.unassign,
  "Direct load unassign is disabled. Update or unassign the trip instead."
);
assert.ok(
  LEGACY_EXECUTION_REJECTION_MESSAGE.edit.includes("/trips/:id/status"),
  "Edit rejection should guide callers to trip status endpoint"
);

assert.equal(normalizeTripStatusForLoad(LoadStatus.DRAFT, TripStatus.ASSIGNED), LoadStatus.ASSIGNED);
assert.equal(normalizeTripStatusForLoad(LoadStatus.PLANNED, TripStatus.IN_TRANSIT), LoadStatus.IN_TRANSIT);
assert.equal(normalizeTripStatusForLoad(LoadStatus.ASSIGNED, TripStatus.PLANNED), LoadStatus.PLANNED);
assert.equal(normalizeTripStatusForLoad(LoadStatus.IN_TRANSIT, TripStatus.PLANNED), LoadStatus.PLANNED);
assert.equal(normalizeTripStatusForLoad(LoadStatus.DELIVERED, TripStatus.PLANNED), LoadStatus.DELIVERED);
assert.equal(normalizeTripStatusForLoad(LoadStatus.INVOICED, TripStatus.ASSIGNED), LoadStatus.INVOICED);

const base = {
  status: LoadStatus.PLANNED,
  assignedDriverId: null,
  truckId: null,
  trailerId: null,
  assignedDriverAt: null,
  assignedTruckAt: null,
  assignedTrailerAt: null,
};

const t1 = new Date("2026-02-25T10:00:00.000Z");
const assigned = buildLoadExecutionMirrorState({
  load: base,
  tripStatus: TripStatus.ASSIGNED,
  driverId: "driver-1",
  truckId: "truck-1",
  trailerId: "trailer-1",
  now: t1,
});
assert.equal(assigned.status, LoadStatus.ASSIGNED);
assert.equal(assigned.assignedDriverId, "driver-1");
assert.equal(assigned.truckId, "truck-1");
assert.equal(assigned.trailerId, "trailer-1");
assert.equal(assigned.assignedDriverAt?.toISOString(), t1.toISOString());
assert.equal(assigned.assignedTruckAt?.toISOString(), t1.toISOString());
assert.equal(assigned.assignedTrailerAt?.toISOString(), t1.toISOString());

const t2 = new Date("2026-02-25T10:15:00.000Z");
const assignedAgain = buildLoadExecutionMirrorState({
  load: assigned,
  tripStatus: TripStatus.ASSIGNED,
  driverId: "driver-1",
  truckId: "truck-1",
  trailerId: "trailer-1",
  now: t2,
});
assert.ok(
  isLoadExecutionMirrorEqual(assigned, assignedAgain),
  "Reapplying same trip assignment should be deterministic and preserve timestamps"
);

const inTransit = buildLoadExecutionMirrorState({
  load: assignedAgain,
  tripStatus: TripStatus.IN_TRANSIT,
  driverId: "driver-1",
  truckId: "truck-1",
  trailerId: "trailer-1",
  now: new Date("2026-02-25T11:00:00.000Z"),
});
assert.equal(inTransit.status, LoadStatus.IN_TRANSIT);
assert.equal(inTransit.assignedDriverAt?.toISOString(), t1.toISOString());

const demotedToPlanned = buildLoadExecutionMirrorState({
  load: inTransit,
  tripStatus: TripStatus.PLANNED,
  driverId: null,
  truckId: null,
  trailerId: null,
  now: new Date("2026-02-25T12:00:00.000Z"),
});
assert.equal(demotedToPlanned.status, LoadStatus.PLANNED);
assert.equal(demotedToPlanned.assignedDriverId, null);
assert.equal(demotedToPlanned.truckId, null);
assert.equal(demotedToPlanned.trailerId, null);
assert.equal(demotedToPlanned.assignedDriverAt, null);
assert.equal(demotedToPlanned.assignedTruckAt, null);
assert.equal(demotedToPlanned.assignedTrailerAt, null);

console.log("execution authority tests passed");
