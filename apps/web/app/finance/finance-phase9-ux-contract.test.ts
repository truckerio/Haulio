import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const spreadsheetPanel = fs.readFileSync(path.resolve(process.cwd(), "components/finance/FinanceSpreadsheetPanel.tsx"), "utf8");

assert.ok(
  spreadsheetPanel.includes("type SortKey ="),
  "phase9 finance spreadsheet should define sortable keys for dense operator scanning"
);
assert.ok(
  spreadsheetPanel.includes("handleSort") && spreadsheetPanel.includes("sortGlyph"),
  "phase9 finance spreadsheet should expose sortable column behavior"
);
assert.ok(
  spreadsheetPanel.includes("Last refresh"),
  "phase9 finance spreadsheet should show recency signal for operator confidence"
);
assert.ok(
  spreadsheetPanel.includes('StatusChip tone={summaryStats.blocked > 0 ? "warning" : "success"}'),
  "phase9 finance spreadsheet should surface blocked-vs-ready status at top of table"
);
assert.ok(
  spreadsheetPanel.includes("sticky left-[160px]"),
  "phase9 finance spreadsheet should keep stage context sticky while horizontally scrolling"
);

console.log("finance phase9 ux contract tests passed");
