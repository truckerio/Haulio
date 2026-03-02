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
  financePage.includes("hideHeader"),
  "finance page must hide the default shell header for compact custom header"
);
assert.ok(
  financePage.includes("hideTopActivityTrigger"),
  "finance page must hide top activity trigger when embedding it in header card"
);
assert.ok(
  financePage.includes("useAppShellActivity"),
  "finance page must consume app shell activity controls"
);
assert.ok(
  financePage.includes("FinanceSpreadsheetPanel") && financePage.includes("FinanceSummaryRail"),
  "finance page must compose spreadsheet and summary rail surfaces"
);
assert.ok(
  financePage.includes('activeTab === "spreadsheet"') && financePage.includes("<FinanceSpreadsheetPanel />"),
  "finance page must render spreadsheet panel when spreadsheet tab is active"
);
assert.ok(
  financePage.includes('aria-label="Open activity"'),
  "finance page must render activity drawer trigger in finance header card"
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
  spreadsheetPanel.includes("Rows/page") && spreadsheetPanel.includes("Command queue snapshot"),
  "spreadsheet panel must expose rows per page control"
);
assert.ok(
  spreadsheetPanel.includes('const rowPaddingClass = "px-2.5 py-1.5";'),
  "spreadsheet panel must enforce dense row spacing"
);
assert.ok(
  !spreadsheetPanel.includes("SegmentedControl"),
  "spreadsheet panel must not expose density toggle controls"
);
assert.ok(
  spreadsheetPanel.includes("Selected row details"),
  "spreadsheet panel must include inline selected-row details"
);
assert.ok(
  spreadsheetPanel.includes("max-h-[58vh]") && spreadsheetPanel.includes("colgroup"),
  "spreadsheet panel should keep the table dense and within viewport height"
);
assert.ok(
  !spreadsheetPanel.includes("Quick view"),
  "spreadsheet panel should not render a separate quick view panel"
);
assert.ok(
  spreadsheetPanel.includes("isSpreadsheetMaximized") &&
    spreadsheetPanel.includes('aria-label={isSpreadsheetMaximized ? "Exit full screen" : "Maximize spreadsheet"}') &&
    spreadsheetPanel.includes("className=\"h-8 w-8 p-0\""),
  "spreadsheet panel must expose fullscreen maximize controls"
);

console.log("finance spreadsheet contract tests passed");
