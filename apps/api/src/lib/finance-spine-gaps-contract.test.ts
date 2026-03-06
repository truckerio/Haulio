import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/index.ts", "utf8");
const ledgerSource = fs.readFileSync("src/lib/finance-ledger.ts", "utf8");

assert.ok(
  source.includes('"/finance/ar-cases"') &&
    source.includes('"/finance/ar-cases/:id/comment"') &&
    source.includes('"/finance/ar-cases/:id/status"'),
  "AR case dispute endpoints must exist"
);
assert.ok(
  source.includes('"/finance/cash-app/import"') &&
    source.includes('"/finance/cash-app/batches/:id/post"'),
  "cash application import/post endpoints must exist"
);
assert.ok(
  source.includes('"/finance/vendors"') &&
    source.includes('"/finance/vendor-bills"') &&
    source.includes('"/finance/vendor-bills/:id/paid"'),
  "vendor AP endpoints must exist"
);
assert.ok(
  source.includes('"/billing/loads/:id/factoring/transactions"'),
  "factoring transaction endpoints must exist"
);
assert.ok(
  source.includes("persistInvoicePaymentReceivedJournal({"),
  "cash app posting must write invoice payment journals"
);
assert.ok(
  source.includes("buildVendorBillPaidJournal({"),
  "vendor bill paid must persist payable journal"
);
assert.ok(
  source.includes("buildFactoringTransactionJournal({"),
  "factoring transaction posting must persist journal entries"
);
assert.ok(
  source.includes("applyFinanceWalletWriteThrough"),
  "new finance monetary transitions must write-through wallet snapshots"
);

assert.ok(
  ledgerSource.includes("buildVendorBillPaidJournal") && ledgerSource.includes("buildFactoringTransactionJournal"),
  "ledger builder must include vendor + factoring journal constructors"
);

console.log("finance spine gap contract tests passed");

