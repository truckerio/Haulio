import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const shell = fs.readFileSync(path.resolve(process.cwd(), "components/detail-workspace/detail-workspace-shell.tsx"), "utf8");

assert.ok(
  shell.includes("model.loads.map((load) =>") && shell.includes("isLoadPartial") && shell.includes("getLoadNextEta"),
  "Tracking tab must render all loads with partial tagging and ETA"
);
assert.ok(
  shell.includes("allStops") && shell.includes("Mark arrived") && shell.includes("Mark departed"),
  "Stops tab must keep operational stop execution controls"
);
assert.ok(
  shell.includes("allDocs") && shell.includes("verifyDocument") && shell.includes("rejectDocument"),
  "Documents tab must keep verify/reject handlers"
);

console.log("trip load execution contract passed");
