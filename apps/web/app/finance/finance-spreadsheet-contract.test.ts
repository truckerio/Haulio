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
  financePage.includes('{activeTab === "spreadsheet" ? <FinanceSpreadsheetPanel /> : null}'),
  "finance page must render spreadsheet panel for spreadsheet tab"
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
  spreadsheetPanel.includes("Rows/page"),
  "spreadsheet panel must expose rows per page control"
);
assert.ok(
  spreadsheetPanel.includes('const rowPaddingClass = "px-2 py-1.5";'),
  "spreadsheet panel must enforce dense row spacing"
);
assert.ok(
  !spreadsheetPanel.includes("SegmentedControl"),
  "spreadsheet panel must not expose density toggle controls"
);
assert.ok(
  spreadsheetPanel.includes("Quick view"),
  "spreadsheet panel must include row details inspector"
);
assert.ok(
  spreadsheetPanel.includes("2xl:grid-cols"),
  "spreadsheet panel should avoid multi-column overflow on common laptop widths"
);

console.log("finance spreadsheet contract tests passed");
