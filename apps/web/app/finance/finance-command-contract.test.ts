import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const financePage = fs.readFileSync(path.resolve(process.cwd(), "app/finance/page.tsx"), "utf8");
const commandPanel = fs.readFileSync(path.resolve(process.cwd(), "components/finance/FinanceCommandPanel.tsx"), "utf8");
const receivablesPanel = fs.readFileSync(path.resolve(process.cwd(), "components/finance/ReceivablesPanel.tsx"), "utf8");

assert.ok(
  !financePage.includes('{ label: "Commands", value: "commands" }'),
  "finance page should remove duplicate commands tab from primary segmented navigation"
);
assert.ok(
  financePage.includes('const normalized = requested === "commands" ? "receivables" : requested;'),
  "finance page must treat legacy commands tab as a receivables alias"
);
assert.ok(
  financePage.includes('const lane = searchParams.get("commandLane") ?? searchParams.get("lane");'),
  "finance page must parse command lane from canonical and legacy URL keys"
);
assert.ok(
  financePage.includes("params.set(\"commandLane\", params.get(\"lane\") ?? \"\");"),
  "finance page must normalize legacy lane param into commandLane"
);
assert.ok(
  financePage.includes("params.delete(\"commandLane\");"),
  "finance page must drop command lane context when leaving receivables tab"
);
assert.ok(
  financePage.includes("<ReceivablesPanel focusReadiness={focusReadiness} initialSearch={receivablesSearch} commandLane={commandLane} />"),
  "finance page must route command lane context into the receivables command surface"
);
assert.ok(
  receivablesPanel.includes("commandLane?: FinanceCommandLaneId | null"),
  "receivables panel must accept command lane context prop"
);
assert.ok(
  receivablesPanel.includes("Command lane focus:"),
  "receivables panel must expose lane focus banner in canonical command surface"
);
assert.ok(
  receivablesPanel.includes("runFocusedLane"),
  "receivables panel must provide lane-focused preview/execute helpers"
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
assert.ok(
  commandPanel.includes("export type FinanceCommandLaneId"),
  "command panel must export shared lane id union for route parsing"
);
assert.ok(
  commandPanel.includes("initialLane?: FinanceCommandLaneId | null"),
  "command panel must accept optional initial lane prop"
);
assert.ok(
  commandPanel.includes("setActiveLane(initialLane);"),
  "command panel must sync active lane when URL lane changes"
);

console.log("finance command contract tests passed");
