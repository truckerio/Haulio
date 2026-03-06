import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const indexSource = fs.readFileSync(path.resolve(process.cwd(), "src/index.ts"), "utf8");

assert.ok(
  indexSource.includes('app.get("/dispatch/trips-workspace"'),
  "dispatch API must expose trips workspace preferences read endpoint"
);
assert.ok(
  indexSource.includes('app.put("/dispatch/trips-workspace"'),
  "dispatch API must expose trips workspace preferences write endpoint"
);
assert.ok(
  indexSource.includes("DISPATCH_TRIPS_WORKSPACE_VIEW_NAME"),
  "dispatch API must use a dedicated internal view key for trips workspace preferences"
);
assert.ok(
  indexSource.includes("name: { not: DISPATCH_TRIPS_WORKSPACE_VIEW_NAME }"),
  "dispatch views list must exclude internal trips workspace preference record"
);

console.log("dispatch trips workspace contract tests passed");
