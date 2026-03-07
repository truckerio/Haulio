import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const tripPage = fs.readFileSync(path.resolve(process.cwd(), "app/trips/[id]/page.tsx"), "utf8");
const shell = fs.readFileSync(path.resolve(process.cwd(), "components/detail-workspace/detail-workspace-shell.tsx"), "utf8");

assert.ok(
  tripPage.includes('fetchDetailWorkspaceModel("trip", tripId)'),
  "Trip detail route must resolve model using trip lens"
);
assert.ok(
  tripPage.includes('<DetailWorkspaceShell') && tripPage.includes("onRefresh"),
  "Trip detail route must render shared shell with refresh callback"
);
assert.ok(
  shell.includes("Stops") && shell.includes("Documents") && shell.includes("Tracking") && shell.includes("Timeline"),
  "Execution lane must expose segmented execution tabs"
);
assert.ok(
  shell.includes("Finance Handoff") && shell.includes("Execution authority:") && shell.includes("Commercial authority:"),
  "Decision rail must include handoff and authority cards"
);

console.log("trip detail command-first cockpit contract passed");
