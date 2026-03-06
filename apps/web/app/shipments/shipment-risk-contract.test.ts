import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const shipmentPage = fs.readFileSync(path.resolve(process.cwd(), "app/shipments/[id]/page.tsx"), "utf8");

assert.ok(
  shipmentPage.includes('/dispatch/shipments/${shipmentId}/risk-score'),
  "shipment detail must request dispatch shipment risk score"
);
assert.ok(
  shipmentPage.includes("Risk ${risk.risk.band}") && shipmentPage.includes("Score {risk.risk.score}/100"),
  "shipment detail must surface risk band and numeric score"
);
assert.ok(
  shipmentPage.includes("Top factor: {risk.risk.factors[0]?.detail}"),
  "shipment detail must show top risk factor context"
);

console.log("shipment risk contract tests passed");

