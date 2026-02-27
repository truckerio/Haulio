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
assert.equal(dispatcher.canViewSettlementPreview, true);
assert.equal(headDispatcher.canViewSettlementPreview, true);

const billing = getRoleCapabilities("BILLING");
assert.equal(billing.canDispatchExecution, false);
assert.equal(billing.canAccessFinance, true);
assert.equal(billing.canViewSettlementPreview, true);

const safety = getRoleCapabilities("SAFETY");
assert.equal(safety.canDispatchExecution, false);
assert.equal(safety.canAccessDispatch, false);
assert.equal(safety.canAccessFinance, false);
assert.equal(safety.canViewSettlementPreview, false);

const support = getRoleCapabilities("SUPPORT");
assert.equal(support.canDispatchExecution, false);
assert.equal(support.canAccessDispatch, false);
assert.equal(support.canAccessFinance, false);
assert.equal(support.canViewSettlementPreview, false);

assert.equal(getRoleLandingPath("DISPATCHER"), "/dispatch?workspace=trips");
assert.equal(getRoleLandingPath("HEAD_DISPATCHER"), "/dispatch?workspace=trips");
assert.equal(getRoleLandingPath("BILLING"), "/finance");
assert.equal(getRoleLandingPath("ADMIN"), "/admin");
assert.equal(getRoleLandingPath("DRIVER"), "/driver");
assert.equal(getRoleLandingPath("SAFETY"), "/loads");
assert.equal(getRoleLandingPath("SUPPORT"), "/loads");

assert.equal(getDefaultDispatchWorkspace({ role: "DISPATCHER", operatingMode: "CARRIER" }), "trips");
assert.equal(getDefaultDispatchWorkspace({ role: "HEAD_DISPATCHER", operatingMode: "BOTH" }), "trips");
assert.equal(getDefaultDispatchWorkspace({ role: "DISPATCHER", operatingMode: "BROKER" }), "loads");
assert.equal(getDefaultDispatchWorkspace({ role: "ADMIN", operatingMode: "CARRIER" }), "loads");

assert.equal(applyFailClosedCapability(true, false), true);
assert.equal(applyFailClosedCapability(true, true), false);
assert.equal(applyFailClosedCapability(false, false), false);

console.log("capabilities tests passed");
