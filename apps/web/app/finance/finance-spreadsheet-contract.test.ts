import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const financePage = fs.readFileSync(path.resolve(process.cwd(), "app/finance/page.tsx"), "utf8");
const spreadsheetPanel = fs.readFileSync(path.resolve(process.cwd(), "components/finance/FinanceSpreadsheetPanel.tsx"), "utf8");

assert.ok(
  financePage.includes('{ label: "Spreadsheet", value: "spreadsheet" }'),
  "finance page must include spreadsheet tab option"
);
assert.ok(
  financePage.includes('const tab = searchParams.get("tab") ?? "spreadsheet";'),
  "finance page must default to spreadsheet tab"
);
assert.ok(
  financePage.includes('{activeTab === "spreadsheet" ? <FinanceSpreadsheetPanel /> : null}'),
  "finance page must render spreadsheet panel for spreadsheet tab"
);
assert.ok(
  spreadsheetPanel.includes('apiFetch<ReceivablesResponse>(`/finance/receivables?${params.toString()}`)'),
  "spreadsheet panel must query finance receivables endpoint"
);
assert.ok(
  spreadsheetPanel.includes("capabilities.canAccessFinance"),
  "spreadsheet panel must use finance capability gating"
);
assert.ok(
  spreadsheetPanel.includes("isForbiddenError(err)"),
  "spreadsheet panel must fail closed on 403 responses"
);
assert.ok(
  spreadsheetPanel.includes('label="Restricted"'),
  "spreadsheet panel must render restricted label when blocked"
);
assert.ok(
  spreadsheetPanel.includes("Finance spreadsheet"),
  "spreadsheet panel must expose spreadsheet title"
);
assert.ok(
  spreadsheetPanel.includes("Rows/page"),
  "spreadsheet panel must expose rows per page control"
);
assert.ok(
  spreadsheetPanel.includes("Quick view"),
  "spreadsheet panel must include row details inspector"
);

console.log("finance spreadsheet contract tests passed");
