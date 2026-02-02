import assert from "node:assert/strict";
import { isWarningType, WARNING_TYPES } from "./warnings";

assert.ok(isWarningType("dispatch_unassigned_loads"), "Known warning type should pass");
assert.ok(isWarningType("dispatch_stuck_in_transit"), "Known warning type should pass");
assert.ok(!isWarningType("unknown"), "Unknown warning type should fail");
assert.equal(WARNING_TYPES.length >= 2, true);

console.log("today warning tests passed");
