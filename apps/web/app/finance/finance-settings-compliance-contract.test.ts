import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const settingsPanel = fs.readFileSync(path.resolve(process.cwd(), "components/finance/FinanceSettingsPanel.tsx"), "utf8");

assert.ok(
  settingsPanel.includes('apiFetch<CompliancePolicyResponse>("/finance/compliance/policy")'),
  "finance settings must load compliance policy from API"
);
assert.ok(
  settingsPanel.includes('apiFetch<ComplianceScreenResponse>("/finance/compliance/screen"'),
  "finance settings must support compliance screening workflow"
);
assert.ok(
  settingsPanel.includes("Finance compliance policy") && settingsPanel.includes("Compliance screening test"),
  "finance settings must render compliance policy and screening sections"
);

console.log("finance settings compliance contract tests passed");

