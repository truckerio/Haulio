import assert from "node:assert/strict";
import fs from "node:fs";
import { hasCapability } from "./capabilities";

const adminUser = { role: "ADMIN", permissions: [] } as const;
const dispatcherUser = { role: "DISPATCHER", permissions: [] } as const;
const headDispatcherUser = { role: "HEAD_DISPATCHER", permissions: [] } as const;
const billingUser = { role: "BILLING", permissions: [] } as const;
const safetyUser = { role: "SAFETY", permissions: [] } as const;
const supportUser = { role: "SUPPORT", permissions: [] } as const;
const driverUser = { role: "DRIVER", permissions: [] } as const;

assert.equal(hasCapability(adminUser as any, "viewSettlementPreview"), true);
assert.equal(hasCapability(dispatcherUser as any, "viewSettlementPreview"), true);
assert.equal(hasCapability(headDispatcherUser as any, "viewSettlementPreview"), true);
assert.equal(hasCapability(billingUser as any, "viewSettlementPreview"), true);
assert.equal(hasCapability(safetyUser as any, "viewSettlementPreview"), false);
assert.equal(hasCapability(supportUser as any, "viewSettlementPreview"), false);
assert.equal(hasCapability(driverUser as any, "viewSettlementPreview"), false);

const apiSource = fs.readFileSync("src/index.ts", "utf8");
const settlementRouteAnchor = '"/trips/:id/settlement-preview"';
const anchorIndex = apiSource.indexOf(settlementRouteAnchor);
assert.ok(anchorIndex >= 0, "Settlement preview endpoint route must exist");

const routeBlock = apiSource.slice(Math.max(0, anchorIndex - 200), anchorIndex + 320);
assert.ok(
  routeBlock.includes('requireRole("ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING")'),
  "Settlement preview endpoint must be restricted to ADMIN/DISPATCHER/HEAD_DISPATCHER/BILLING"
);
assert.equal(routeBlock.includes("SAFETY"), false, "Settlement preview endpoint must not grant SAFETY access");
assert.equal(routeBlock.includes("SUPPORT"), false, "Settlement preview endpoint must not grant SUPPORT access");
assert.equal(routeBlock.includes("DRIVER"), false, "Settlement preview endpoint must not grant DRIVER access");

console.log("settlement preview auth tests passed");

