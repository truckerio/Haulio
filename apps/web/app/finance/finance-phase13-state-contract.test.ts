import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const summaryRail = fs.readFileSync(path.resolve(process.cwd(), "components/finance/FinanceSummaryRail.tsx"), "utf8");

assert.ok(
  summaryRail.includes("Promise.allSettled"),
  "phase13 finance summary rail should use partial-safe parallel loading"
);
assert.ok(
  summaryRail.includes("Partial sync warning:"),
  "phase13 finance summary rail should expose explicit partial-failure state"
);
assert.ok(
  summaryRail.includes("Last refresh"),
  "phase13 finance summary rail should display refresh-state visibility"
);
assert.ok(
  summaryRail.includes("min-h-[180px]"),
  "phase13 finance summary cards should reserve stable height to reduce layout shift"
);
assert.ok(
  summaryRail.includes("Restricted"),
  "phase13 finance summary rail should preserve permission-restricted state handling"
);

console.log("finance phase13 state contract tests passed");

