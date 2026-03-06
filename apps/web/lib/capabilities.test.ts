import assert from "node:assert/strict";
import {
  applyFailClosedCapability,
  canRoleResumeWorkspace,
  getDefaultDispatchWorkspace,
  getRoleCapabilities,
  getRoleLandingPath,
  getRoleLastWorkspaceStorageKey,
  getRoleNoAccessCta,
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
assert.equal(safety.canAccessSafety, true);
assert.equal(safety.canAccessSupport, false);

const support = getRoleCapabilities("SUPPORT");
assert.equal(support.canDispatchExecution, false);
assert.equal(support.canAccessDispatch, false);
assert.equal(support.canAccessFinance, false);
assert.equal(support.canViewSettlementPreview, false);
assert.equal(support.canAccessSafety, false);
assert.equal(support.canAccessSupport, true);

assert.equal(getRoleLandingPath("DISPATCHER"), "/dispatch?workspace=trips");
assert.equal(getRoleLandingPath("HEAD_DISPATCHER"), "/dispatch?workspace=trips");
assert.equal(getRoleLandingPath("BILLING"), "/finance?tab=receivables");
assert.equal(getRoleLandingPath("ADMIN"), "/admin");
assert.equal(getRoleLandingPath("DRIVER"), "/driver");
assert.equal(getRoleLandingPath("SAFETY"), "/safety");
assert.equal(getRoleLandingPath("SUPPORT"), "/support");

assert.equal(getRoleNoAccessCta("DISPATCHER").href, "/dispatch?workspace=trips");
assert.equal(getRoleNoAccessCta("BILLING").href, "/finance?tab=receivables");
assert.equal(getRoleNoAccessCta("DRIVER").href, "/today");

assert.equal(getRoleLastWorkspaceStorageKey("DISPATCHER"), "haulio:last-workspace:DISPATCHER");
assert.equal(getRoleLastWorkspaceStorageKey("DRIVER"), null);
assert.equal(canRoleResumeWorkspace("DISPATCHER", "/dispatch?workspace=trips"), true);
assert.equal(canRoleResumeWorkspace("BILLING", "/dispatch?workspace=loads"), false);
assert.equal(canRoleResumeWorkspace("BILLING", "/finance?tab=receivables"), true);
assert.equal(canRoleResumeWorkspace("SAFETY", "/safety"), true);
assert.equal(canRoleResumeWorkspace("SUPPORT", "/support"), true);

assert.equal(getDefaultDispatchWorkspace({ role: "DISPATCHER", operatingMode: "CARRIER" }), "trips");
assert.equal(getDefaultDispatchWorkspace({ role: "HEAD_DISPATCHER", operatingMode: "BOTH" }), "trips");
assert.equal(getDefaultDispatchWorkspace({ role: "DISPATCHER", operatingMode: "BROKER" }), "loads");
assert.equal(getDefaultDispatchWorkspace({ role: "ADMIN", operatingMode: "CARRIER" }), "loads");

assert.equal(applyFailClosedCapability(true, false), true);
assert.equal(applyFailClosedCapability(true, true), false);
assert.equal(applyFailClosedCapability(false, false), false);

console.log("capabilities tests passed");
