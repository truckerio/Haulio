import type { JournalEntry } from "./finance-ledger";

type WalletDelta = {
  account: string;
  deltaDebitCents: number;
  deltaCreditCents: number;
  deltaNetCents: number;
};

type WalletStoreClient = {
  financeWalletSnapshot: {
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<unknown>;
  };
  financeWalletBalance: {
    upsert(args: unknown): Promise<{
      debitCents: number;
      creditCents: number;
      netCents: number;
    }>;
  };
};

function isUniqueConstraintError(error: unknown) {
  return Boolean((error as { code?: string } | null)?.code === "P2002");
}

function buildWalletDeltas(journal: Readonly<JournalEntry>): WalletDelta[] {
  const buckets = new Map<string, WalletDelta>();
  for (const line of journal.lines) {
    const current = buckets.get(line.account) ?? {
      account: line.account,
      deltaDebitCents: 0,
      deltaCreditCents: 0,
      deltaNetCents: 0,
    };
    if (line.side === "DEBIT") {
      current.deltaDebitCents += line.amountCents;
      current.deltaNetCents += line.amountCents;
    } else {
      current.deltaCreditCents += line.amountCents;
      current.deltaNetCents -= line.amountCents;
    }
    buckets.set(line.account, current);
  }
  return Array.from(buckets.values()).sort((a, b) => a.account.localeCompare(b.account));
}

export async function applyFinanceWalletWriteThrough(
  db: WalletStoreClient,
  params: { journal: Readonly<JournalEntry> }
): Promise<{ appliedAccounts: string[]; skippedAccounts: string[] }> {
  const deltas = buildWalletDeltas(params.journal);
  const appliedAccounts: string[] = [];
  const skippedAccounts: string[] = [];
  const dbAny = db as any;

  for (const delta of deltas) {
    let snapshotId: string;
    try {
      const snapshot = await dbAny.financeWalletSnapshot.create({
        data: {
          orgId: params.journal.orgId,
          account: delta.account,
          entityType: params.journal.entityType,
          entityId: params.journal.entityId,
          eventType: params.journal.eventType,
          idempotencyKey: params.journal.idempotencyKey,
          deltaDebitCents: delta.deltaDebitCents,
          deltaCreditCents: delta.deltaCreditCents,
          deltaNetCents: delta.deltaNetCents,
          balanceDebitCents: 0,
          balanceCreditCents: 0,
          balanceNetCents: 0,
        },
        select: { id: true },
      });
      snapshotId = snapshot.id;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        skippedAccounts.push(delta.account);
        continue;
      }
      throw error;
    }

    const balance = await dbAny.financeWalletBalance.upsert({
      where: {
        orgId_account: {
          orgId: params.journal.orgId,
          account: delta.account,
        },
      },
      create: {
        orgId: params.journal.orgId,
        account: delta.account,
        debitCents: delta.deltaDebitCents,
        creditCents: delta.deltaCreditCents,
        netCents: delta.deltaNetCents,
      },
      update: {
        debitCents: { increment: delta.deltaDebitCents },
        creditCents: { increment: delta.deltaCreditCents },
        netCents: { increment: delta.deltaNetCents },
      },
      select: {
        debitCents: true,
        creditCents: true,
        netCents: true,
      },
    });

    await dbAny.financeWalletSnapshot.update({
      where: { id: snapshotId },
      data: {
        balanceDebitCents: balance.debitCents,
        balanceCreditCents: balance.creditCents,
        balanceNetCents: balance.netCents,
      },
    });

    appliedAccounts.push(delta.account);
  }

  return { appliedAccounts, skippedAccounts };
}
