import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const financePage = fs.readFileSync(path.resolve(process.cwd(), "app/finance/page.tsx"), "utf8");
const receivablesPanel = fs.readFileSync(path.resolve(process.cwd(), "components/finance/ReceivablesPanel.tsx"), "utf8");
const payablesPanel = fs.readFileSync(path.resolve(process.cwd(), "components/finance/PayablesPanel.tsx"), "utf8");
const spreadsheetPanel = fs.readFileSync(path.resolve(process.cwd(), "components/finance/FinanceSpreadsheetPanel.tsx"), "utf8");

assert.ok(
  financePage.includes("const rolePreferredTab = useMemo<FinanceTab>(() => {"),
  "finance page must define explicit role-first preferred tabs"
);
assert.ok(
  financePage.includes("const resumedFinanceTab = useMemo<FinanceTab | null>(() => {"),
  "finance page must support resume of finance tab from last workspace storage"
);
assert.ok(
  financePage.includes("<ReceivablesPanel focusReadiness={focusReadiness} initialSearch={receivablesSearch} commandLane={commandLane} />"),
  "finance page must pass URL search and command lane context into receivables panel"
);
assert.ok(
  financePage.includes('<PayablesPanel focusLoadId={payablesLoadId} receivablesSearch={receivablesSearch} />'),
  "finance page must pass handoff context into payables panel"
);
assert.ok(
  receivablesPanel.includes("useRouter"),
  "receivables panel must use app router for in-app transitions"
);
assert.ok(
  receivablesPanel.includes("router.push(`/shipments/${row.loadId}?focus=commercial`)"),
  "receivables panel should route shipment actions without full reload"
);
assert.ok(
  receivablesPanel.includes("router.push(`/finance?tab=payables&loadId=${encodeURIComponent(row.loadId)}&search=${encodeURIComponent(row.loadNumber)}`)"),
  "receivables panel must hand off settlement actions with payables context and return search"
);
assert.ok(
  receivablesPanel.includes("`/billing/invoices/${selected.loadId}/preflight`"),
  "receivables panel must fetch backend invoice preflight snapshot for selected load"
);
assert.ok(
  receivablesPanel.includes("Read-only mode: dispatch roles can review blockers and preflight, but finance mutations are disabled."),
  "receivables panel must show explicit read-only finance mode for dispatch roles"
);
assert.ok(
  receivablesPanel.includes("if (!canMutateFinance && MUTATING_RECEIVABLE_ACTIONS.has(action))"),
  "receivables actions must guard finance mutations for non-billing roles"
);
assert.ok(
  payablesPanel.includes("Receivables handoff"),
  "payables panel must render receivables handoff context card when loadId query is present"
);
assert.ok(
  payablesPanel.includes("Back to receivables"),
  "payables panel must expose in-flow return path to receivables workspace"
);
assert.ok(
  spreadsheetPanel.includes("`/finance?tab=payables&loadId=${encodeURIComponent(selected.loadId)}&search=${encodeURIComponent(selected.loadNumber)}`"),
  "spreadsheet panel must pass payables handoff context from selected row"
);

console.log("finance navigation contract tests passed");
