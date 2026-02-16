DO $$ BEGIN
  CREATE TYPE "FinanceOutboxEventType" AS ENUM ('DISPATCH_LOAD_UPDATED', 'FINANCE_STATUS_UPDATED', 'QBO_SYNC_REQUESTED', 'FACTORING_REQUESTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FinanceOutboxEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "QboEntityType" AS ENUM ('CUSTOMER', 'INVOICE', 'PAYMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "QboSyncJobStatus" AS ENUM ('QUEUED', 'SYNCING', 'SYNCED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FinanceReceivableStage" AS ENUM ('DELIVERED', 'DOCS_REVIEW', 'READY', 'INVOICE_SENT', 'COLLECTED', 'SETTLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FinanceBlockerOwner" AS ENUM ('DISPATCH', 'DRIVER', 'BILLING', 'CUSTOMER', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PayableHoldOwner" AS ENUM ('DISPATCH', 'DRIVER', 'BILLING', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Load"
  ADD COLUMN IF NOT EXISTS "qboSyncStatus" "QboSyncJobStatus",
  ADD COLUMN IF NOT EXISTS "qboSyncLastError" TEXT,
  ADD COLUMN IF NOT EXISTS "financeStage" "FinanceReceivableStage",
  ADD COLUMN IF NOT EXISTS "financeTopBlockerCode" TEXT,
  ADD COLUMN IF NOT EXISTS "financeTopBlockerMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "financeNextBestAction" TEXT,
  ADD COLUMN IF NOT EXISTS "financeNextBestActionReasonCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "financePriorityScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "financeBlockerOwner" "FinanceBlockerOwner",
  ADD COLUMN IF NOT EXISTS "financeSnapshotUpdatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "FinanceOutboxEvent" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "loadId" TEXT,
  "type" "FinanceOutboxEventType" NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "FinanceOutboxEventStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinanceOutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QboSyncJob" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "entityType" "QboEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "status" "QboSyncJobStatus" NOT NULL DEFAULT 'QUEUED',
  "idempotencyKey" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "qboId" TEXT,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "QboSyncJob_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PayableRun"
  ADD COLUMN IF NOT EXISTS "holdReasonCode" TEXT,
  ADD COLUMN IF NOT EXISTS "holdOwner" "PayableHoldOwner",
  ADD COLUMN IF NOT EXISTS "holdNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "anomaliesJson" JSONB,
  ADD COLUMN IF NOT EXISTS "anomalyCount" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "FinanceOutboxEvent_orgId_dedupeKey_key" ON "FinanceOutboxEvent"("orgId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "FinanceOutboxEvent_status_nextAttemptAt_createdAt_idx" ON "FinanceOutboxEvent"("status", "nextAttemptAt", "createdAt");
CREATE INDEX IF NOT EXISTS "FinanceOutboxEvent_orgId_status_nextAttemptAt_idx" ON "FinanceOutboxEvent"("orgId", "status", "nextAttemptAt");

CREATE UNIQUE INDEX IF NOT EXISTS "QboSyncJob_orgId_idempotencyKey_key" ON "QboSyncJob"("orgId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "QboSyncJob_orgId_status_nextAttemptAt_createdAt_idx" ON "QboSyncJob"("orgId", "status", "nextAttemptAt", "createdAt");
CREATE INDEX IF NOT EXISTS "QboSyncJob_orgId_entityType_entityId_createdAt_idx" ON "QboSyncJob"("orgId", "entityType", "entityId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "FinanceOutboxEvent"
    ADD CONSTRAINT "FinanceOutboxEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FinanceOutboxEvent"
    ADD CONSTRAINT "FinanceOutboxEvent_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "QboSyncJob"
    ADD CONSTRAINT "QboSyncJob_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
