CREATE TYPE "PayableRunStatus" AS ENUM ('PAYABLE_READY', 'RUN_DRAFT', 'RUN_PREVIEWED', 'RUN_FINALIZED', 'PAID');
CREATE TYPE "PayablePartyType" AS ENUM ('DRIVER', 'CARRIER', 'VENDOR');
CREATE TYPE "PayableLineItemType" AS ENUM ('EARNING', 'DEDUCTION', 'REIMBURSEMENT');

CREATE TABLE "PayableRun" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "status" "PayableRunStatus" NOT NULL DEFAULT 'RUN_DRAFT',
  "previewChecksum" TEXT,
  "finalizedChecksum" TEXT,
  "createdById" TEXT NOT NULL,
  "finalizedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PayableRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayableLineItem" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "partyType" "PayablePartyType" NOT NULL,
  "partyId" TEXT NOT NULL,
  "loadId" TEXT,
  "type" "PayableLineItemType" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "memo" TEXT,
  "source" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PayableLineItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SettlementPolicyVersion" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "rulesJson" JSONB NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SettlementPolicyVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayableRun_orgId_status_createdAt_idx" ON "PayableRun"("orgId", "status", "createdAt");
CREATE INDEX "PayableRun_orgId_periodStart_periodEnd_idx" ON "PayableRun"("orgId", "periodStart", "periodEnd");
CREATE INDEX "PayableLineItem_orgId_runId_idx" ON "PayableLineItem"("orgId", "runId");
CREATE INDEX "PayableLineItem_runId_partyType_partyId_idx" ON "PayableLineItem"("runId", "partyType", "partyId");
CREATE INDEX "PayableLineItem_orgId_partyType_partyId_idx" ON "PayableLineItem"("orgId", "partyType", "partyId");
CREATE UNIQUE INDEX "SettlementPolicyVersion_orgId_version_key" ON "SettlementPolicyVersion"("orgId", "version");
CREATE INDEX "SettlementPolicyVersion_orgId_effectiveFrom_idx" ON "SettlementPolicyVersion"("orgId", "effectiveFrom");

ALTER TABLE "PayableRun"
  ADD CONSTRAINT "PayableRun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PayableRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayableLineItem"
  ADD CONSTRAINT "PayableLineItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PayableLineItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayableRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PayableLineItem_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SettlementPolicyVersion"
  ADD CONSTRAINT "SettlementPolicyVersion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SettlementPolicyVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
