import assert from "node:assert/strict";
import fs from "node:fs";
import { DISPATCH_EXECUTION_OR_BILLING_ROLES, DISPATCH_EXECUTION_ROLES, DISPATCH_TRACKING_ROLES } from "./dispatch-role-parity";
import { expandRoleAliases } from "./rbac";

const dispatcherAliases = expandRoleAliases(["DISPATCHER"]);
assert.ok(dispatcherAliases.includes("HEAD_DISPATCHER"), "DISPATCHER alias must include HEAD_DISPATCHER");
assert.ok(!dispatcherAliases.includes("OPS_MANAGER"), "DISPATCHER alias must not auto-include OPS_MANAGER");

assert.ok(DISPATCH_EXECUTION_ROLES.includes("DISPATCHER"));
assert.ok(DISPATCH_EXECUTION_ROLES.includes("HEAD_DISPATCHER"));
assert.ok(DISPATCH_EXECUTION_OR_BILLING_ROLES.includes("BILLING"));
assert.ok(DISPATCH_TRACKING_ROLES.includes("DRIVER"));
assert.ok(DISPATCH_TRACKING_ROLES.includes("HEAD_DISPATCHER"));

const apiSource = fs.readFileSync("src/index.ts", "utf8");
const expectedRoleGuards = [
  '"/loads/:id/charges", requireAuth, requireRole(...DISPATCH_EXECUTION_OR_BILLING_ROLES)',
  '"/loads/:id/charges",\n  requireAuth,\n  requireCsrf,\n  requireRole(...DISPATCH_EXECUTION_ROLES)',
  '"/loads/:id/charges/:chargeId",\n  requireAuth,\n  requireCsrf,\n  requireRole(...DISPATCH_EXECUTION_ROLES)',
  '"/tracking/load/:loadId/start",\n  requireAuth,\n  requireRole(...DISPATCH_TRACKING_ROLES)',
  '"/loads/:loadId/docs",\n  requireAuth,\n  requireRole(...DISPATCH_EXECUTION_OR_BILLING_ROLES)',
];
for (const expected of expectedRoleGuards) {
  assert.ok(apiSource.includes(expected), `Expected guard missing: ${expected}`);
}

console.log("dispatch role parity tests passed");
