import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const receivablesPanel = fs.readFileSync(path.resolve(process.cwd(), "components/finance/ReceivablesPanel.tsx"), "utf8");

assert.ok(
  receivablesPanel.includes('params.set("commercialFocus", commercialFocus)'),
  "receivables panel must persist commercial focus filter in URL state"
);
assert.ok(
  receivablesPanel.includes('params.set("commercialFocus", commercialFocus);'),
  "receivables API query should include commercial focus filter"
);
assert.ok(
  receivablesPanel.includes("<option value=\"DETENTION\">Detention lines</option>") &&
    receivablesPanel.includes("<option value=\"LAYOVER\">Layover lines</option>"),
  "receivables filter options should expose detention and layover focus controls"
);
assert.ok(
  receivablesPanel.includes('openQueue({ commercialFocus: "DETENTION" })') &&
    receivablesPanel.includes('openQueue({ commercialFocus: "LAYOVER" })'),
  "receivables quick queues should provide detention and layover review shortcuts"
);

console.log("finance receivables filters contract tests passed");

