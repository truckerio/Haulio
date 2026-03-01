import { Prisma } from "@truckerio/db";
import type { PayoutResult } from "./finance-banking-adapter";
import type { JournalEntry } from "./finance-ledger";

type FinanceJournalEntryWithLines = {
  id: string;
  orgId: string;
  entityType: "PAYABLE_RUN" | "SETTLEMENT";
  entityId: string;
  eventType: "PAYABLE_RUN_PAID" | "SETTLEMENT_PAID";
  idempotencyKey: string;
  totalDebitCents: number;
  totalCreditCents: number;
  lines: Array<{
    account: string;
    side: string;
    amountCents: number;
    memo: string | null;
  }>;
};

type FinanceLedgerStoreClient = {
  financeJournalEntry: {
    findUnique(args: unknown): Promise<FinanceJournalEntryWithLines | null>;
    create(args: unknown): Promise<FinanceJournalEntryWithLines>;
  };
};

type PersistFinanceJournalInput = {
  journal: Readonly<JournalEntry>;
  createdById?: string | null;
  payout?: PayoutResult | null;
  metadata?: Prisma.InputJsonValue;
};

function normalizeLineSignature(
  lines: ReadonlyArray<{ account: string; side: string; amountCents: number; memo?: string | null }>
) {
  return lines
    .map((line) => `${line.account}|${line.side}|${line.amountCents}|${line.memo ?? ""}`)
    .sort();
}

function assertMatchingJournal(existing: FinanceJournalEntryWithLines, journal: Readonly<JournalEntry>) {
  if (existing.eventType !== journal.eventType) {
    throw new Error(`Journal idempotency collision: eventType mismatch for key ${journal.idempotencyKey}`);
  }
  if (existing.entityType !== journal.entityType) {
    throw new Error(`Journal idempotency collision: entityType mismatch for key ${journal.idempotencyKey}`);
  }
  if (existing.entityId !== journal.entityId) {
    throw new Error(`Journal idempotency collision: entityId mismatch for key ${journal.idempotencyKey}`);
  }
  if (
    existing.totalDebitCents !== journal.totalDebitCents ||
    existing.totalCreditCents !== journal.totalCreditCents
  ) {
    throw new Error(`Journal idempotency collision: totals mismatch for key ${journal.idempotencyKey}`);
  }
  const existingSignature = normalizeLineSignature(existing.lines);
  const expectedSignature = normalizeLineSignature(journal.lines);
  if (existingSignature.length !== expectedSignature.length) {
    throw new Error(`Journal idempotency collision: line count mismatch for key ${journal.idempotencyKey}`);
  }
  for (let index = 0; index < expectedSignature.length; index += 1) {
    if (existingSignature[index] !== expectedSignature[index]) {
      throw new Error(`Journal idempotency collision: line payload mismatch for key ${journal.idempotencyKey}`);
    }
  }
}

function findByIdempotencyKey(
  db: FinanceLedgerStoreClient,
  orgId: string,
  idempotencyKey: string
): Promise<FinanceJournalEntryWithLines | null> {
  const dbAny = db as any;
  return dbAny.financeJournalEntry.findUnique({
    where: { orgId_idempotencyKey: { orgId, idempotencyKey } },
    include: { lines: { orderBy: { createdAt: "asc" } } },
  });
}

export async function persistFinanceJournalEntry(
  db: FinanceLedgerStoreClient,
  input: PersistFinanceJournalInput
): Promise<{ entry: FinanceJournalEntryWithLines; created: boolean }> {
  const existing = await findByIdempotencyKey(db, input.journal.orgId, input.journal.idempotencyKey);
  if (existing) {
    assertMatchingJournal(existing, input.journal);
    return { entry: existing, created: false };
  }

  const dbAny = db as any;
  try {
    const created = await dbAny.financeJournalEntry.create({
      data: {
        id: input.journal.entryId,
        orgId: input.journal.orgId,
        entityType: input.journal.entityType,
        entityId: input.journal.entityId,
        eventType: input.journal.eventType,
        idempotencyKey: input.journal.idempotencyKey,
        adapter: input.payout?.adapter ?? null,
        externalPayoutId: input.payout?.payoutId ?? null,
        externalPayoutReference: input.payout?.reference ?? null,
        totalDebitCents: input.journal.totalDebitCents,
        totalCreditCents: input.journal.totalCreditCents,
        currency: "USD",
        metadata: input.metadata ?? undefined,
        createdById: input.createdById ?? null,
        lines: {
          create: input.journal.lines.map((line) => ({
            orgId: input.journal.orgId,
            account: line.account,
            side: line.side,
            amountCents: line.amountCents,
            memo: line.memo ?? null,
          })),
        },
      },
      include: { lines: { orderBy: { createdAt: "asc" } } },
    });
    return { entry: created, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const collided = await findByIdempotencyKey(db, input.journal.orgId, input.journal.idempotencyKey);
      if (!collided) {
        throw error;
      }
      assertMatchingJournal(collided, input.journal);
      return { entry: collided, created: false };
    }
    throw error;
  }
}
