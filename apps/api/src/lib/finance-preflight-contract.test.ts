import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/index.ts", "utf8");

assert.ok(
  source.includes('"/billing/invoices/:loadId/preflight"'),
  "invoice preflight endpoint must exist"
);
assert.ok(
  source.includes('requireRole("ADMIN", "BILLING", "HEAD_DISPATCHER", "DISPATCHER")'),
  "invoice preflight endpoint must allow dispatch read-only roles"
);
assert.ok(
  source.includes("evaluateInvoicePreflightSnapshot({"),
  "invoice generation must use shared preflight snapshot evaluator"
);

const bulkIndex = source.indexOf('"/finance/receivables/bulk/generate-invoices"');
assert.ok(bulkIndex >= 0, "bulk generate invoices endpoint must exist");
const bulkBlock = source.slice(bulkIndex, bulkIndex + 2800);
assert.ok(
  bulkBlock.includes("evaluateInvoicePreflightForLoad"),
  "bulk invoice generation must run load preflight before dry-run/execute"
);
assert.ok(
  bulkBlock.includes("Preflight blocked"),
  "bulk dry-run must return truthful blocked message from preflight"
);
assert.ok(
  bulkBlock.includes("Blocked by invoice preflight"),
  "bulk execute must fail deterministically when preflight blockers exist"
);

assert.ok(
  source.includes('source: "finance.factoring"'),
  "factoring transitions must emit refresh/outbox flow through finance mutation source"
);

console.log("finance preflight contract tests passed");
