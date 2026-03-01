import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/index.ts", "utf8");

const walletAnchor = 'app.get("/finance/wallets", requireAuth, requireCapability("viewSettlementPreview", "runSettlements"), async (req, res) => {';
const walletIndex = source.indexOf(walletAnchor);
assert.ok(walletIndex >= 0, "finance wallets route must exist with capability guard");

const walletBlock = source.slice(walletIndex, walletIndex + 2600);
assert.ok(
  walletBlock.includes("aggregateFinanceWalletBalances("),
  "finance wallets route must aggregate balances from journal lines"
);
assert.ok(
  walletBlock.includes("financeWalletBalance.findMany"),
  "finance wallets route must read materialized wallet balances when available"
);
assert.ok(
  walletBlock.includes("financeJournalLine.findMany"),
  "finance wallets route must read finance journal lines"
);

console.log("finance wallet contract tests passed");
