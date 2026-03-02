import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const layout = fs.readFileSync(path.resolve(process.cwd(), "app/layout.tsx"), "utf8");

assert.ok(
  layout.includes("UiTelemetryRuntime"),
  "Phase 11 requires root layout to include UiTelemetryRuntime for baseline page-view instrumentation"
);
assert.ok(
  layout.includes("<UiTelemetryRuntime />"),
  "Phase 11 requires UiTelemetryRuntime mounted in the app shell tree"
);

console.log("phase11 telemetry contract tests passed");

