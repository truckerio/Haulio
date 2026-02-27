import assert from "node:assert/strict";
import fs from "node:fs";
import { DISPATCH_EXECUTION_OR_BILLING_ROLES, DISPATCH_EXECUTION_ROLES, DISPATCH_TRACKING_ROLES } from "./dispatch-role-parity";
import { expandRoleAliases } from "./rbac";
import { hasCapability } from "./capabilities";

const dispatcherAliases = expandRoleAliases(["DISPATCHER"]);
assert.ok(dispatcherAliases.includes("HEAD_DISPATCHER"), "DISPATCHER alias must include HEAD_DISPATCHER");
assert.equal((dispatcherAliases as string[]).includes("OPS_MANAGER"), false, "DISPATCHER alias must not include OPS_MANAGER");

assert.ok(DISPATCH_EXECUTION_ROLES.includes("DISPATCHER"));
assert.ok(DISPATCH_EXECUTION_ROLES.includes("HEAD_DISPATCHER"));
assert.ok(DISPATCH_EXECUTION_OR_BILLING_ROLES.includes("BILLING"));
assert.ok(DISPATCH_TRACKING_ROLES.includes("DRIVER"));
assert.ok(DISPATCH_TRACKING_ROLES.includes("HEAD_DISPATCHER"));

const dispatcherUser = { role: "DISPATCHER", permissions: [] } as const;
const headDispatcherUser = { role: "HEAD_DISPATCHER", permissions: [] } as const;
const billingUser = { role: "BILLING", permissions: [] } as const;
const safetyUser = { role: "SAFETY", permissions: [] } as const;
const supportUser = { role: "SUPPORT", permissions: [] } as const;

assert.equal(hasCapability(dispatcherUser as any, "uploadDocs"), true);
assert.equal(hasCapability(headDispatcherUser as any, "uploadDocs"), true);
assert.equal(hasCapability(dispatcherUser as any, "editCharges"), true);
assert.equal(hasCapability(headDispatcherUser as any, "editCharges"), true);
assert.equal(hasCapability(dispatcherUser as any, "startTracking"), true);
assert.equal(hasCapability(headDispatcherUser as any, "startTracking"), true);

assert.equal(hasCapability(safetyUser as any, "uploadDocs"), false);
assert.equal(hasCapability(safetyUser as any, "editCharges"), false);
assert.equal(hasCapability(safetyUser as any, "startTracking"), false);
assert.equal(hasCapability(supportUser as any, "uploadDocs"), false);
assert.equal(hasCapability(supportUser as any, "editCharges"), false);
assert.equal(hasCapability(supportUser as any, "startTracking"), false);
assert.equal(hasCapability(billingUser as any, "assignTrip"), false);

const apiSource = fs.readFileSync("src/index.ts", "utf8");
const expectedRoleGuards = [
  '"/loads/:id/charges", requireAuth, requireCapability("viewCharges")',
  '"/loads/:id/charges",\n  requireAuth,\n  requireCsrf,\n  requireCapability("editCharges")',
  '"/loads/:id/charges/:chargeId",\n  requireAuth,\n  requireCsrf,\n  requireCapability("editCharges")',
  '"/tracking/load/:loadId/start",\n  requireAuth,\n  requireCapability("startTracking")',
  '"/loads/:loadId/docs",\n  requireAuth,\n  requireCapability("uploadDocs")',
];
for (const expected of expectedRoleGuards) {
  assert.ok(apiSource.includes(expected), `Expected guard missing: ${expected}`);
}

console.log("dispatch role parity tests passed");
