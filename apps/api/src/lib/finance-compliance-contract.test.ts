import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(__dirname, "../index.ts"), "utf8");

assert.ok(
  source.includes('"/finance/compliance/policy"'),
  "finance compliance policy endpoint must exist"
);
assert.ok(
  source.includes('"/finance/compliance/screen"'),
  "finance compliance screen endpoint must exist"
);
assert.ok(
  source.includes('action: "FINANCE_COMPLIANCE_SCREENED"'),
  "finance compliance screen endpoint must write audit log entries"
);

const manualPaymentAnchor = '"/finance/receivables/:loadId/manual-payment"';
const manualPaymentIndex = source.indexOf(manualPaymentAnchor);
assert.ok(manualPaymentIndex >= 0, "manual payment route must exist");
const manualPaymentBlock = source.slice(manualPaymentIndex, manualPaymentIndex + 8000);
assert.ok(
  manualPaymentBlock.includes("resolveComplianceDecision({"),
  "manual payment route must run compliance decision gate"
);
assert.ok(
  manualPaymentBlock.includes("FINANCE_COMPLIANCE_BLOCKED"),
  "manual payment route must audit compliance blocks"
);

const payableRunAnchor = "const markPayableRunPaidHandler = async";
const payableRunIndex = source.indexOf(payableRunAnchor);
assert.ok(payableRunIndex >= 0, "payable run paid handler must exist");
const payableRunBlock = source.slice(payableRunIndex, payableRunIndex + 10000);
assert.ok(
  payableRunBlock.includes("resolveComplianceDecision({"),
  "payable run payout must run compliance decision gate"
);
assert.ok(
  payableRunBlock.includes("method"),
  "payable run payout must accept rail method"
);

const settlementAnchor = 'app.post("/settlements/:id/paid"';
const settlementIndex = source.indexOf(settlementAnchor);
assert.ok(settlementIndex >= 0, "settlement paid route must exist");
const settlementBlock = source.slice(settlementIndex, settlementIndex + 9000);
assert.ok(
  settlementBlock.includes("resolveComplianceDecision({"),
  "settlement paid route must run compliance decision gate"
);
assert.ok(
  settlementBlock.includes("FINANCE_COMPLIANCE_BLOCKED"),
  "settlement paid route must audit compliance blocks"
);

console.log("finance compliance contract tests passed");
