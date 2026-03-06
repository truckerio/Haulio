import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rightPane = fs.readFileSync(path.resolve(process.cwd(), "components/dispatch/WorkbenchRightPane.tsx"), "utf8");

assert.ok(
  rightPane.includes("canAccessFinance?: boolean;") && rightPane.includes("canBillActions?: boolean;"),
  "workbench right pane must accept finance capability flags"
);
assert.ok(
  rightPane.includes("const financeReceivablesHref") && rightPane.includes("const financePayablesHref"),
  "workbench right pane must derive finance handoff routes from selected load context"
);
assert.ok(
  rightPane.includes("const financePreflightHref"),
  "workbench right pane must derive billing preflight handoff route"
);
assert.ok(
  rightPane.includes("Open receivables"),
  "workbench right pane should expose receivables handoff action"
);
assert.ok(
  rightPane.includes("Open billing preflight"),
  "workbench right pane should expose direct billing preflight handoff action"
);
assert.ok(
  rightPane.includes("Open payables context"),
  "workbench right pane should expose payables context handoff action for billing-capable roles"
);
assert.ok(
  rightPane.includes("Dispatch to finance handoff") &&
    rightPane.includes('["Delivered", "Docs review", "Ready", "Invoiced", "Collected", "Settled"]'),
  "workbench right pane should display standardized dispatch-to-finance handoff stages"
);

console.log("dispatch finance handoff contract tests passed");
