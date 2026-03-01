import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/index.ts", "utf8");

const payableAnchor = 'const markPayableRunPaidHandler = async (req: any, res: any) => {';
const payableIndex = source.indexOf(payableAnchor);
assert.ok(payableIndex >= 0, "payable paid handler must exist");
const payableBlock = source.slice(payableIndex, payableIndex + 2600);
assert.ok(
  payableBlock.includes("createPayoutReceipt({"),
  "payable paid handler must build payout receipt via banking adapter"
);
assert.ok(
  payableBlock.includes("buildPayableRunPaidJournal({"),
  "payable paid handler must build ledger journal"
);
assert.ok(
  payableBlock.includes("persistFinanceJournalEntry("),
  "payable paid handler must persist journal entries"
);
assert.ok(
  payableBlock.includes("resolveIdempotencyKey(req, `payable-run:${run.id}:paid`)"),
  "payable paid handler must derive idempotency key"
);
assert.ok(payableBlock.includes("action: \"PAYABLE_RUN_PAID\""), "payable paid must write audit log");

const settlementAnchor =
  'app.post("/settlements/:id/paid", requireAuth, requireCsrf, requirePermission(Permission.SETTLEMENT_FINALIZE), async (req, res) => {';
const settlementIndex = source.indexOf(settlementAnchor);
assert.ok(settlementIndex >= 0, "settlement paid route must exist");
const settlementBlock = source.slice(settlementIndex, settlementIndex + 3000);
assert.ok(
  settlementBlock.includes("createPayoutReceipt({"),
  "settlement paid route must build payout receipt via banking adapter"
);
assert.ok(
  settlementBlock.includes("buildSettlementPaidJournal({"),
  "settlement paid route must build ledger journal"
);
assert.ok(
  settlementBlock.includes("persistFinanceJournalEntry("),
  "settlement paid route must persist journal entries"
);
assert.ok(
  settlementBlock.includes("resolveIdempotencyKey(req, `settlement:${settlement.id}:paid`)"),
  "settlement paid route must derive idempotency key"
);
assert.ok(
  settlementBlock.includes("meta: { payout, journal: journalToJson(journal) }"),
  "settlement paid route must audit payout metadata"
);

console.log("finance payout contract tests passed");
