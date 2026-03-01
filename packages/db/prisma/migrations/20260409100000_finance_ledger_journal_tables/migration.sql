DO $$
BEGIN
  CREATE TYPE "FinanceJournalEntityType" AS ENUM ('PAYABLE_RUN', 'SETTLEMENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "FinanceJournalEventType" AS ENUM ('PAYABLE_RUN_PAID', 'SETTLEMENT_PAID');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "FinanceJournalLineSide" AS ENUM ('DEBIT', 'CREDIT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "FinanceLedgerAccount" AS ENUM (
    'CASH_CLEARING',
    'DRIVER_PAYABLE',
    'SETTLEMENT_EXPENSE',
    'AR_CLEARING',
    'REVENUE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "FinanceJournalEntry" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "entityType" "FinanceJournalEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "eventType" "FinanceJournalEventType" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "adapter" TEXT,
  "externalPayoutId" TEXT,
  "externalPayoutReference" TEXT,
  "totalDebitCents" INTEGER NOT NULL,
  "totalCreditCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "metadata" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinanceJournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FinanceJournalLine" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "account" "FinanceLedgerAccount" NOT NULL,
  "side" "FinanceJournalLineSide" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "memo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinanceJournalLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FinanceJournalEntry_orgId_idempotencyKey_key"
  ON "FinanceJournalEntry"("orgId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "FinanceJournalEntry_orgId_eventType_createdAt_idx"
  ON "FinanceJournalEntry"("orgId", "eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "FinanceJournalEntry_orgId_entityType_entityId_createdAt_idx"
  ON "FinanceJournalEntry"("orgId", "entityType", "entityId", "createdAt");

CREATE INDEX IF NOT EXISTS "FinanceJournalLine_entryId_idx"
  ON "FinanceJournalLine"("entryId");
CREATE INDEX IF NOT EXISTS "FinanceJournalLine_orgId_account_createdAt_idx"
  ON "FinanceJournalLine"("orgId", "account", "createdAt");

DO $$
BEGIN
  ALTER TABLE "FinanceJournalEntry"
    ADD CONSTRAINT "FinanceJournalEntry_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "FinanceJournalEntry"
    ADD CONSTRAINT "FinanceJournalEntry_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "FinanceJournalLine"
    ADD CONSTRAINT "FinanceJournalLine_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "FinanceJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "FinanceJournalLine"
    ADD CONSTRAINT "FinanceJournalLine_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
