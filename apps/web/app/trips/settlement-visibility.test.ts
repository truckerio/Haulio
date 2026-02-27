import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const tripPagePath = path.resolve(process.cwd(), "app/trips/[id]/page.tsx");
const tripPage = fs.readFileSync(tripPagePath, "utf8");

assert.ok(
  tripPage.includes("const canViewSettlementPreview = capabilities.canViewSettlementPreview;"),
  "Trip detail must derive settlement visibility from capabilities"
);
assert.ok(
  tripPage.includes("if (getRoleCapabilities(role).canViewSettlementPreview)"),
  "Trip detail must gate settlement-preview API fetch by role capabilities"
);
assert.ok(
  tripPage.includes("`/trips/${tripId}/settlement-preview`"),
  "Trip detail must use the settlement preview endpoint"
);
assert.ok(
  tripPage.includes("{canViewSettlementPreview ? ("),
  "Trip detail settlement panels must be conditionally rendered by canViewSettlementPreview"
);

console.log("trip settlement visibility tests passed");

