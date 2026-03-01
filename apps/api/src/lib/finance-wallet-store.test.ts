import assert from "node:assert/strict";
import { buildSettlementPaidJournal } from "./finance-ledger";
import { applyFinanceWalletWriteThrough } from "./finance-wallet-store";

function uniqueError() {
  const error = new Error("unique") as Error & { code?: string };
  error.code = "P2002";
  return error;
}

function createMockDb() {
  const snapshots = new Map<string, any>();
  const balances = new Map<string, { debitCents: number; creditCents: number; netCents: number }>();
  return {
    db: {
      financeWalletSnapshot: {
        async findUnique(args: any) {
          const key = `${args.where.orgId_idempotencyKey_account.orgId}:${args.where.orgId_idempotencyKey_account.idempotencyKey}:${args.where.orgId_idempotencyKey_account.account}`;
          const row = snapshots.get(key) ?? null;
          return row ? { id: row.id } : null;
        },
        async create(args: any) {
          const key = `${args.data.orgId}:${args.data.idempotencyKey}:${args.data.account}`;
          if (snapshots.has(key)) {
            throw uniqueError();
          }
          const row = { id: `snap_${snapshots.size + 1}`, ...args.data };
          snapshots.set(key, row);
          return { id: row.id };
        },
        async update(args: any) {
          for (const [key, row] of snapshots.entries()) {
            if (row.id === args.where.id) {
              snapshots.set(key, { ...row, ...args.data });
              return snapshots.get(key);
            }
          }
          throw new Error("snapshot not found");
        },
      },
      financeWalletBalance: {
        async upsert(args: any) {
          const key = `${args.where.orgId_account.orgId}:${args.where.orgId_account.account}`;
          const current = balances.get(key) ?? { debitCents: 0, creditCents: 0, netCents: 0 };
          const next = {
            debitCents: current.debitCents + (args.update.debitCents.increment ?? args.create.debitCents ?? 0),
            creditCents: current.creditCents + (args.update.creditCents.increment ?? args.create.creditCents ?? 0),
            netCents: current.netCents + (args.update.netCents.increment ?? args.create.netCents ?? 0),
          };
          balances.set(key, next);
          return next;
        },
      },
    },
    snapshots,
    balances,
  };
}

async function main() {
  const mock = createMockDb();
  const journal = buildSettlementPaidJournal({
    orgId: "org_wallet",
    settlementId: "sett_1",
    amountCents: 2500,
    idempotencyKey: "idem-wallet",
  });

  const first = await applyFinanceWalletWriteThrough(mock.db as any, { journal });
  assert.deepEqual(first.appliedAccounts, ["CASH_CLEARING", "DRIVER_PAYABLE"]);
  assert.equal(first.skippedAccounts.length, 0);

  const second = await applyFinanceWalletWriteThrough(mock.db as any, { journal });
  assert.equal(second.appliedAccounts.length, 0);
  assert.deepEqual(second.skippedAccounts, ["CASH_CLEARING", "DRIVER_PAYABLE"]);

  const cash = mock.balances.get("org_wallet:CASH_CLEARING");
  const payable = mock.balances.get("org_wallet:DRIVER_PAYABLE");
  assert.equal(cash?.creditCents, 2500);
  assert.equal(cash?.debitCents, 0);
  assert.equal(cash?.netCents, -2500);
  assert.equal(payable?.debitCents, 2500);
  assert.equal(payable?.creditCents, 0);
  assert.equal(payable?.netCents, 2500);

  console.log("finance wallet store tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
