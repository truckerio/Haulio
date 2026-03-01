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
assert.ok(
  journalsPanel.includes("selectedEntryId"),
  "journals panel must keep selected entry state for drilldown"
);
assert.ok(
  journalsPanel.includes("Journal drilldown"),
  "journals panel must include drilldown drawer section"
);
assert.ok(
  journalsPanel.includes("Anomaly checks"),
  "journals panel drilldown must include anomaly explanations"
);
assert.ok(
  journalsPanel.includes("Metadata preview"),
  "journals panel drilldown must include metadata preview"
);
assert.ok(
  journalsPanel.includes("UNBALANCED_ENTRY") && journalsPanel.includes("DUPLICATE_IDEMPOTENCY_KEY"),
  "journals panel drilldown must include deterministic anomaly codes"
);
assert.ok(
  journalsPanel.includes("Export CSV"),
  "journals panel must expose csv export action"
);
assert.ok(
  journalsPanel.includes("new Blob("),
  "journals panel must generate CSV via blob export"
);
assert.ok(
  journalsPanel.includes("finance_journals"),
  "journals panel export filename should be finance_journals scoped"
);

console.log("finance journals contract tests passed");
