import assert from "node:assert/strict";
import fs from "node:fs";

const apiSource = fs.readFileSync("src/index.ts", "utf8");

function routeBlock(anchor: string, before = 120, after = 2200) {
  const index = apiSource.indexOf(anchor);
  assert.ok(index >= 0, `Route anchor not found: ${anchor}`);
  return apiSource.slice(Math.max(0, index - before), index + after);
}

const driverCurrent = routeBlock('app.get("/driver/current"');
assert.ok(driverCurrent.includes('requireRole("DRIVER")'), "driver current endpoint must be driver-only");

const driverArrive = routeBlock('app.post("/driver/stops/:stopId/arrive"');
assert.ok(driverArrive.includes('requireRole("DRIVER")'), "driver arrive endpoint must be driver-only");
assert.ok(
  driverArrive.includes("Only the primary driver can update stops"),
  "driver arrive endpoint must enforce primary-driver ownership"
);

const driverDepart = routeBlock('app.post("/driver/stops/:stopId/depart"');
assert.ok(driverDepart.includes('requireRole("DRIVER")'), "driver depart endpoint must be driver-only");
assert.ok(
  driverDepart.includes("Only the primary driver can update stops"),
  "driver depart endpoint must enforce primary-driver ownership"
);

const driverUndo = routeBlock('app.post("/driver/undo"');
assert.ok(driverUndo.includes('requireRole("DRIVER")'), "driver undo endpoint must be driver-only");
assert.ok(
  driverUndo.includes("Only the primary driver can undo actions"),
  "driver undo endpoint must enforce primary-driver ownership"
);

const trackingStart = routeBlock('"/tracking/load/:loadId/start"');
assert.ok(
  trackingStart.includes('if (req.user!.role === "DRIVER")'),
  "tracking start must apply driver assignment checks"
);
assert.ok(
  trackingStart.includes("Only the primary driver can manage tracking"),
  "tracking start must enforce primary-driver ownership"
);

const settlementsList = routeBlock(
  'app.get("/settlements", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING", "DRIVER"), async (req, res) => {',
  0,
  4200
);
assert.ok(
  settlementsList.includes('const isDriver = role === "DRIVER";'),
  "settlements list must branch for driver identity"
);
assert.ok(settlementsList.includes("driverId = driver.id;"), "driver settlements list must be scoped to self");

const settlementsDetail = routeBlock(
  'app.get("/settlements/:id", requireAuth, requireRole("ADMIN", "DISPATCHER", "BILLING", "DRIVER"), async (req, res) => {',
  0,
  2400
);
assert.ok(
  settlementsDetail.includes("settlement.driverId !== driver.id"),
  "driver settlement detail must enforce own-settlement visibility"
);

const settlementGenerate = routeBlock('app.post("/settlements/generate"');
assert.ok(
  settlementGenerate.includes("requirePermission(Permission.SETTLEMENT_GENERATE)"),
  "settlement generate must require settlement generate permission"
);
assert.equal(
  settlementGenerate.includes('requireRole("DRIVER")'),
  false,
  "settlement generate must not be exposed as a driver route"
);

const settlementFinalize = routeBlock('app.post("/settlements/:id/finalize"');
assert.ok(
  settlementFinalize.includes("requirePermission(Permission.SETTLEMENT_FINALIZE)"),
  "settlement finalize must require settlement finalize permission"
);

const settlementPaid = routeBlock('app.post("/settlements/:id/paid"');
assert.ok(
  settlementPaid.includes("requirePermission(Permission.SETTLEMENT_FINALIZE)"),
  "settlement paid must require settlement finalize permission"
);

console.log("driver ops contract tests passed");
