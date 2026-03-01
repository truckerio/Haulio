import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/index.ts", "utf8");

assert.ok(
  source.includes("evaluatePayableRunHold("),
  "payable routes must evaluate hold policy through shared helper"
);
assert.ok(
  source.includes("evaluateSettlementHold("),
  "settlement routes must evaluate hold policy through shared helper"
);
assert.ok(
  source.includes('action: "PAYABLE_RUN_HOLD_BLOCKED"'),
  "payable hold blocks must be audited"
);
assert.ok(
  source.includes('action: "SETTLEMENT_HOLD_BLOCKED"'),
  "settlement hold blocks must be audited"
);

console.log("finance hold audit contract tests passed");
