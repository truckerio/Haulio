import assert from "node:assert/strict";
import { buildSettlementPaidJournal } from "./finance-ledger";
import { persistFinanceJournalEntry } from "./finance-ledger-store";

function createMockDb() {
  let row: any = null;
  const calls: { create: number; findUnique: number } = { create: 0, findUnique: 0 };
  return {
    calls,
    db: {
      financeJournalEntry: {
        async findUnique() {
          calls.findUnique += 1;
          return row;
        },
        async create(args: any) {
          calls.create += 1;
          row = {
            id: args.data.id,
            orgId: args.data.orgId,
            entityType: args.data.entityType,
            entityId: args.data.entityId,
            eventType: args.data.eventType,
            idempotencyKey: args.data.idempotencyKey,
            totalDebitCents: args.data.totalDebitCents,
            totalCreditCents: args.data.totalCreditCents,
            lines: args.data.lines.create.map((line: any) => ({
              account: line.account,
              side: line.side,
              amountCents: line.amountCents,
              memo: line.memo ?? null,
            })),
          };
          return row;
        },
      },
    },
    setRow(next: any) {
      row = next;
    },
  };
}

async function main() {
  const mock = createMockDb();
  const journal = buildSettlementPaidJournal({
    orgId: "org_1",
    settlementId: "set_1",
    amountCents: 12345,
    idempotencyKey: "idem-1",
  });

  const first = await persistFinanceJournalEntry(mock.db as any, { journal, createdById: "user_1" });
  assert.equal(first.created, true);
  assert.equal(mock.calls.create, 1);

  const second = await persistFinanceJournalEntry(mock.db as any, { journal, createdById: "user_1" });
  assert.equal(second.created, false);
  assert.equal(mock.calls.create, 1);

  mock.setRow({
    ...second.entry,
    totalDebitCents: second.entry.totalDebitCents + 1,
  });
  let mismatchCaught = false;
  try {
    await persistFinanceJournalEntry(mock.db as any, { journal, createdById: "user_1" });
  } catch (error) {
    mismatchCaught = String(error).includes("idempotency collision");
  }
  assert.equal(mismatchCaught, true);

  console.log("finance ledger store tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
