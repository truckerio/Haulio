import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const financePage = fs.readFileSync(path.resolve(process.cwd(), "app/finance/page.tsx"), "utf8");
const contractsPanel = fs.readFileSync(path.resolve(process.cwd(), "components/finance/FinanceContractsPanel.tsx"), "utf8");

assert.ok(
  financePage.includes('{ label: "Contracts", value: "contracts" }'),
  "finance page must expose contracts tab"
);
assert.ok(
  financePage.includes('{activeTab === "contracts" ? <FinanceContractsPanel /> : null}'),
  "finance page must render contracts panel"
);
assert.ok(
  contractsPanel.includes('apiFetch<ContractsResponse>("/finance/move-contracts")'),
  "contracts panel must load move contracts from finance API"
);
assert.ok(
  contractsPanel.includes('apiFetch<PreviewResponse>("/finance/move-contracts/preview"'),
  "contracts panel must support pay preview simulation"
);
assert.ok(
  contractsPanel.includes('apiFetch("/finance/move-contracts", {'),
  "contracts panel must support move contract creation"
);
assert.ok(
  contractsPanel.includes('/finance/move-contracts/${versionForm.contractId}/versions'),
  "contracts panel must expose contract version publishing endpoint"
);
assert.ok(
  contractsPanel.includes("Publish Version"),
  "contracts panel must expose effective-dated version publishing surface"
);

console.log("finance contracts contract tests passed");
