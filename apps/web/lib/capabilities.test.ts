import assert from "node:assert/strict";
import {
  applyFailClosedCapability,
  getDefaultDispatchWorkspace,
  getRoleCapabilities,
  getRoleLandingPath,
} from "./capabilities";

const dispatcher = getRoleCapabilities("DISPATCHER");
const headDispatcher = getRoleCapabilities("HEAD_DISPATCHER");

assert.equal(dispatcher.canUploadLoadDocs, true);
assert.equal(headDispatcher.canUploadLoadDocs, dispatcher.canUploadLoadDocs);
assert.equal(headDispatcher.canEditCharges, dispatcher.canEditCharges);
assert.equal(headDispatcher.canStartTracking, dispatcher.canStartTracking);
assert.equal(headDispatcher.canDispatchExecution, dispatcher.canDispatchExecution);

const billing = getRoleCapabilities("BILLING");
assert.equal(billing.canDispatchExecution, false);
assert.equal(billing.canAccessFinance, true);

assert.equal(getRoleLandingPath("DISPATCHER"), "/dispatch");
assert.equal(getRoleLandingPath("HEAD_DISPATCHER"), "/dispatch");
assert.equal(getRoleLandingPath("BILLING"), "/finance");
assert.equal(getRoleLandingPath("ADMIN"), "/admin");
assert.equal(getRoleLandingPath("DRIVER"), "/driver");

assert.equal(getDefaultDispatchWorkspace({ role: "DISPATCHER", operatingMode: "CARRIER" }), "trips");
assert.equal(getDefaultDispatchWorkspace({ role: "HEAD_DISPATCHER", operatingMode: "BOTH" }), "trips");
assert.equal(getDefaultDispatchWorkspace({ role: "DISPATCHER", operatingMode: "BROKER" }), "loads");
assert.equal(getDefaultDispatchWorkspace({ role: "ADMIN", operatingMode: "CARRIER" }), "loads");

assert.equal(applyFailClosedCapability(true, false), true);
assert.equal(applyFailClosedCapability(true, true), false);
assert.equal(applyFailClosedCapability(false, false), false);

console.log("capabilities tests passed");
