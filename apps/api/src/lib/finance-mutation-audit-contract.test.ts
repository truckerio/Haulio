import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/index.ts", "utf8");

const requiredActions = [
  "PAYABLE_RUN_CREATED",
  "PAYABLE_RUN_PREVIEWED",
  "PAYABLE_RUN_HOLD_APPLIED",
  "PAYABLE_RUN_HOLD_RELEASED",
  "PAYABLE_RUN_FINALIZED",
  "PAYABLE_RUN_PAID",
  "SETTLEMENT_GENERATED",
  "SETTLEMENT_FINALIZED",
  "SETTLEMENT_PAID",
  "PAYABLE_RUN_HOLD_BLOCKED",
  "SETTLEMENT_HOLD_BLOCKED",
];

for (const action of requiredActions) {
  assert.ok(source.includes(`action: "${action}"`), `finance mutation audit action missing: ${action}`);
}

console.log("finance mutation audit contract tests passed");
