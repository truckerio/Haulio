import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const loadsPage = fs.readFileSync(path.resolve(process.cwd(), "app/loads/page.tsx"), "utf8");
const tripsWorkspace = fs.readFileSync(path.resolve(process.cwd(), "components/dispatch/TripsWorkspace.tsx"), "utf8");
const financeSpreadsheet = fs.readFileSync(path.resolve(process.cwd(), "components/finance/FinanceSpreadsheetPanel.tsx"), "utf8");

assert.ok(
  loadsPage.includes("toneFromSemantic"),
  "phase15 should normalize load status chip semantics through shared status semantic mapping"
);
assert.ok(
  tripsWorkspace.includes("toneFromSemantic"),
  "phase15 should normalize trip status chip semantics through shared status semantic mapping"
);
assert.ok(
  financeSpreadsheet.includes("toneFromSemantic") && financeSpreadsheet.includes("toneFromSeverity"),
  "phase15 should normalize finance stage and blocker severity semantics through shared mapping"
);

console.log("phase15 status consistency contract tests passed");

