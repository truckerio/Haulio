import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const financePage = fs.readFileSync(path.resolve(process.cwd(), "app/finance/page.tsx"), "utf8");
const commandPanel = fs.readFileSync(path.resolve(process.cwd(), "components/finance/FinanceCommandPanel.tsx"), "utf8");

assert.ok(
  financePage.includes('{ label: "Commands", value: "commands" }'),
  "finance page must include commands tab option"
);
assert.ok(
  financePage.includes('{activeTab === "commands" ? <FinanceCommandPanel /> : null}'),
  "finance page must render finance command panel for commands tab"
);
assert.ok(
  commandPanel.includes('apiFetch<ReceivablesResponse>("/finance/receivables?limit=200")'),
  "command panel must source lane rows from finance receivables endpoint"
);
assert.ok(
  commandPanel.includes("/finance/receivables/bulk/generate-invoices"),
  "command panel must support invoice generation bulk endpoint"
);
assert.ok(
  commandPanel.includes("/finance/receivables/bulk/qbo-sync"),
  "command panel must support qbo sync bulk endpoint"
);
assert.ok(
  commandPanel.includes("/finance/receivables/bulk/send-reminders"),
  "command panel must support reminder bulk endpoint"
);
assert.ok(
  commandPanel.includes("capabilities.canBillActions"),
  "command panel must gate mutation actions by billing capability"
);
assert.ok(
  commandPanel.includes("isForbiddenError(err)"),
  "command panel must fail closed on forbidden mutation responses"
);
assert.ok(
  commandPanel.includes('label="Restricted"'),
  "command panel must show restricted status when mutation is blocked"
);
assert.ok(
  commandPanel.includes("Command lanes"),
  "command panel must present lane-based queue surface"
);

console.log("finance command contract tests passed");
