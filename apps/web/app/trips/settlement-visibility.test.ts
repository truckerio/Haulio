import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const shell = fs.readFileSync(path.resolve(process.cwd(), "components/detail-workspace/detail-workspace-shell.tsx"), "utf8");

assert.ok(
  shell.includes("Open receivables") && shell.includes("Open billing preflight") && shell.includes("Open payables context"),
  "Conditional finance commands must exist in context strip"
);
assert.ok(
  shell.includes("HANDOFF_STAGES") && shell.includes("SETTLED"),
  "Finance handoff stage rail must include full delivered->settled lifecycle"
);

console.log("trip finance handoff visibility contract passed");
