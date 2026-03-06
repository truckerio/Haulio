import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const financePage = fs.readFileSync(path.resolve(process.cwd(), "app/finance/page.tsx"), "utf8");
const disputesPanel = fs.readFileSync(path.resolve(process.cwd(), "components/finance/FinanceDisputesPanel.tsx"), "utf8");
const cashAppPanel = fs.readFileSync(path.resolve(process.cwd(), "components/finance/FinanceCashApplicationPanel.tsx"), "utf8");
const vendorPanel = fs.readFileSync(path.resolve(process.cwd(), "components/finance/FinanceVendorPayablesPanel.tsx"), "utf8");
const factoringPanel = fs.readFileSync(path.resolve(process.cwd(), "components/finance/FinanceFactoringPanel.tsx"), "utf8");

assert.ok(
  financePage.includes('{ label: "Disputes", value: "disputes" }'),
  "finance page must expose disputes queue tab"
);
assert.ok(
  financePage.includes('{ label: "Cash App", value: "cash-app" }'),
  "finance page must expose cash application tab"
);
assert.ok(
  financePage.includes('{ label: "Factoring", value: "factoring" }'),
  "finance page must expose factoring ledger tab"
);
assert.ok(
  financePage.includes('{ label: "Vendor AP", value: "vendor-ap" }'),
  "finance page must expose vendor AP tab"
);
assert.ok(
  financePage.includes('option.value === "cash-app"') &&
    financePage.includes('option.value === "vendor-ap"') &&
    financePage.includes('option.value === "factoring"'),
  "finance page must gate mutation-heavy tabs by billing capability"
);
assert.ok(
  financePage.includes('<FinanceDisputesPanel />') &&
    financePage.includes('<FinanceCashApplicationPanel />') &&
    financePage.includes('<FinanceVendorPayablesPanel />') &&
    financePage.includes('<FinanceFactoringPanel />'),
  "finance page must render new finance spine panels by tab"
);

assert.ok(
  disputesPanel.includes("/finance/ar-cases") &&
    disputesPanel.includes("/finance/ar-cases/${selected.id}/status") &&
    disputesPanel.includes("/finance/ar-cases/${selected.id}/comment"),
  "disputes panel must use AR case queue + status/comment workflows"
);
assert.ok(
  disputesPanel.includes("Read-only mode: dispatch roles can review"),
  "disputes panel must keep dispatch users review-only"
);

assert.ok(
  cashAppPanel.includes("/finance/cash-app/import") &&
    cashAppPanel.includes("/finance/cash-app/batches/${batchId}/post"),
  "cash app panel must support import and batch posting flows"
);
assert.ok(
  cashAppPanel.includes("invoiceNumber,amountCents,remittanceRef,notes"),
  "cash app panel must document remittance entry format"
);

assert.ok(
  vendorPanel.includes("/finance/vendors") &&
    vendorPanel.includes("/finance/vendor-bills") &&
    vendorPanel.includes("/finance/vendor-bills/${billId}/${action}"),
  "vendor AP panel must support vendor master + bill lifecycle actions"
);

assert.ok(
  factoringPanel.includes("/billing/loads/${encodeURIComponent(effectiveLoadId)}/factoring/transactions"),
  "factoring panel must read/write factoring transactions per load"
);

console.log("finance spine gap contract tests passed");
