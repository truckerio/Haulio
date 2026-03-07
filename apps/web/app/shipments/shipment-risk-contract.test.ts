import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const shipmentPage = fs.readFileSync(path.resolve(process.cwd(), "app/shipments/[id]/page.tsx"), "utf8");
const shell = fs.readFileSync(path.resolve(process.cwd(), "components/detail-workspace/detail-workspace-shell.tsx"), "utf8");

assert.ok(
  shipmentPage.includes('fetchDetailWorkspaceModel("shipment", shipmentId)'),
  "Shipment detail route must resolve model using shipment lens"
);
assert.ok(
  shipmentPage.includes('<DetailWorkspaceShell') && shipmentPage.includes("onRefresh"),
  "Shipment detail route must render shared shell with refresh callback"
);
assert.ok(
  shell.includes('data-testid="detail-context-strip"') &&
    shell.includes('data-testid="detail-execution-lane"') &&
    shell.includes('data-testid="detail-decision-rail"') &&
    shell.includes('data-testid="detail-secondary-tabs"'),
  "Shared shell must expose 4-zone command-first structure"
);
assert.ok(
  shell.includes("Verify docs") && shell.includes("Reject docs") && shell.includes("Upload POD"),
  "Context strip must include document operations"
);

console.log("shipment detail command-first contract passed");
