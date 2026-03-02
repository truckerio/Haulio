import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const loadsPage = fs.readFileSync(path.resolve(process.cwd(), "app/loads/page.tsx"), "utf8");

assert.ok(
  loadsPage.includes("formatLoadsRefreshTime(lastRefreshedAt)"),
  "phase14 loads workspace should show refresh-state visibility"
);
assert.ok(
  loadsPage.includes("Partial sync warning:"),
  "phase14 loads workspace should expose partial-failure state"
);
assert.ok(
  loadsPage.includes("Retry queue refresh"),
  "phase14 loads workspace should offer recoverable retry action"
);
assert.ok(
  loadsPage.includes("Loading loads workspace..."),
  "phase14 loads workspace should expose explicit loading state"
);
assert.ok(
  loadsPage.includes("No access to Loads"),
  "phase14 loads workspace should fail closed for non-load roles"
);
assert.ok(
  loadsPage.includes("readHeavySummary.trackingOff") && loadsPage.includes("readHeavySummary.missingPod"),
  "phase14 loads workspace should expose read-heavy triage snapshot cards for safety/support"
);

console.log("loads phase14 read-heavy contract tests passed");

