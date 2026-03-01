import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const financePage = fs.readFileSync(path.resolve(process.cwd(), "app/finance/page.tsx"), "utf8");
const journalsPanel = fs.readFileSync(path.resolve(process.cwd(), "components/finance/FinanceJournalsPanel.tsx"), "utf8");

assert.ok(
  financePage.includes('{ label: "Journals", value: "journals" }'),
  "finance page must include journals tab option"
);
assert.ok(
  financePage.includes('{activeTab === "journals" ? <FinanceJournalsPanel /> : null}'),
  "finance page must render journals panel for journals tab"
);
assert.ok(
  journalsPanel.includes('apiFetch<JournalsResponse>(`/finance/journals?${query}`)'),
  "journals panel must query the finance journals API route"
);
assert.ok(
  journalsPanel.includes("capabilities.canViewSettlementPreview"),
  "journals panel must use capability-based access"
);
assert.ok(
  journalsPanel.includes("isForbiddenError(err)"),
  "journals panel must fail closed on 403 responses"
);
assert.ok(
  journalsPanel.includes('label="Restricted"'),
  "journals panel must render restricted label when access is blocked"
);

console.log("finance journals contract tests passed");
