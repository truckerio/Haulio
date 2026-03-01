CREATE TABLE IF NOT EXISTS "FinanceWalletBalance" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "account" "FinanceLedgerAccount" NOT NULL,
  "debitCents" INTEGER NOT NULL DEFAULT 0,
  "creditCents" INTEGER NOT NULL DEFAULT 0,
  "netCents" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinanceWalletBalance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FinanceWalletSnapshot" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "account" "FinanceLedgerAccount" NOT NULL,
  "entityType" "FinanceJournalEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "eventType" "FinanceJournalEventType" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "deltaDebitCents" INTEGER NOT NULL,
  "deltaCreditCents" INTEGER NOT NULL,
  "deltaNetCents" INTEGER NOT NULL,
  "balanceDebitCents" INTEGER NOT NULL,
  "balanceCreditCents" INTEGER NOT NULL,
  "balanceNetCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinanceWalletSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FinanceWalletBalance_orgId_account_key"
  ON "FinanceWalletBalance"("orgId", "account");
CREATE INDEX IF NOT EXISTS "FinanceWalletBalance_orgId_updatedAt_idx"
  ON "FinanceWalletBalance"("orgId", "updatedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "FinanceWalletSnapshot_orgId_idempotencyKey_account_key"
  ON "FinanceWalletSnapshot"("orgId", "idempotencyKey", "account");
CREATE INDEX IF NOT EXISTS "FinanceWalletSnapshot_orgId_account_createdAt_idx"
  ON "FinanceWalletSnapshot"("orgId", "account", "createdAt");
CREATE INDEX IF NOT EXISTS "FinanceWalletSnapshot_orgId_eventType_createdAt_idx"
  ON "FinanceWalletSnapshot"("orgId", "eventType", "createdAt");

DO $$
BEGIN
  ALTER TABLE "FinanceWalletBalance"
    ADD CONSTRAINT "FinanceWalletBalance_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "FinanceWalletSnapshot"
    ADD CONSTRAINT "FinanceWalletSnapshot_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
