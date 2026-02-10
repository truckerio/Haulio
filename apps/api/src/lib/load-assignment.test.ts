import assert from "node:assert/strict";
import { buildAssignmentPlan, validateAssignmentDrivers } from "./load-assignment";

const ok = validateAssignmentDrivers("driver-1", "driver-2");
assert.ok(ok.ok, "Valid primary/co-driver should pass");

const missingPrimary = validateAssignmentDrivers("");
assert.ok(!missingPrimary.ok, "Missing primary should fail");

const sameDriver = validateAssignmentDrivers("driver-1", "driver-1");
assert.ok(!sameDriver.ok, "Co-driver should differ from primary");

const soloPlan = buildAssignmentPlan({ primaryDriverId: "driver-1" });
assert.equal(soloPlan.assignedDriverId, "driver-1");
assert.equal(soloPlan.assignmentMembers.length, 1);
assert.equal(soloPlan.assignmentMembers[0]?.role, "PRIMARY");
assert.ok(soloPlan.removeCoDriver, "Solo plan should remove co-driver");

const teamPlan = buildAssignmentPlan({ primaryDriverId: "driver-1", coDriverId: "driver-2" });
assert.equal(teamPlan.assignmentMembers.length, 2);
assert.equal(teamPlan.coDriverId, "driver-2");
assert.ok(!teamPlan.removeCoDriver, "Team plan should keep co-driver");

console.log("load assignment tests passed");
