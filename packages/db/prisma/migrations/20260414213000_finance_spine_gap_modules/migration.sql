DO $$
BEGIN
  CREATE TYPE "ARCaseType" AS ENUM (
    'DISPUTE',
    'SHORT_PAY',
    'MISSING_DOCS',
    'EDI_REJECT',
    'FACTORING_REJECT',
    'DUPLICATE_INVOICE',
    'RATE_DISPUTE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ARCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CashApplicationBatchStatus" AS ENUM ('IMPORTED', 'POSTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CashApplicationMatchStatus" AS ENUM ('SUGGESTED', 'MATCHED', 'POSTED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "VendorBillStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'PAID', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "FactoringTransactionType" AS ENUM ('ADVANCE', 'RESERVE_RELEASE', 'FEE', 'RECOURSE', 'ADJUSTMENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "FinanceJournalEntityType" ADD VALUE IF NOT EXISTS 'FACTORING_TRANSACTION';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "FinanceJournalEntityType" ADD VALUE IF NOT EXISTS 'VENDOR_BILL';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "FinanceJournalEventType" ADD VALUE IF NOT EXISTS 'FACTORING_TRANSACTION_POSTED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "FinanceJournalEventType" ADD VALUE IF NOT EXISTS 'VENDOR_BILL_PAID';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "FinanceLedgerAccount" ADD VALUE IF NOT EXISTS 'VENDOR_PAYABLE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "FinanceLedgerAccount" ADD VALUE IF NOT EXISTS 'FACTORING_RESERVE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "FinanceLedgerAccount" ADD VALUE IF NOT EXISTS 'FACTORING_FEE_EXPENSE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ARCase" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "loadId" TEXT,
  "invoiceId" TEXT,
  "type" "ARCaseType" NOT NULL,
  "status" "ARCaseStatus" NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "ownerUserId" TEXT,
  "slaDueAt" TIMESTAMP(3),
  "resolution" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ARCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ARCaseComment" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ARCaseComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Vendor" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "paymentMethod" "FinancePaymentMethod" NOT NULL DEFAULT 'ACH',
  "termsDays" INTEGER,
  "email" TEXT,
  "phone" TEXT,
  "remitToAddress" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VendorBill" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "loadId" TEXT,
  "status" "VendorBillStatus" NOT NULL DEFAULT 'DRAFT',
  "invoiceNumber" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "dueDate" TIMESTAMP(3),
  "scheduledAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "reference" TEXT,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VendorBill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VendorBillLine" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "vendorBillId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "glCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VendorBillLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CashApplicationBatch" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "sourceFileName" TEXT,
  "status" "CashApplicationBatchStatus" NOT NULL DEFAULT 'IMPORTED',
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "postedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashApplicationBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CashApplicationMatch" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "invoiceId" TEXT,
  "loadId" TEXT,
  "amountCents" INTEGER NOT NULL,
  "confidence" DECIMAL(5, 2) NOT NULL,
  "status" "CashApplicationMatchStatus" NOT NULL DEFAULT 'SUGGESTED',
  "remittanceRef" TEXT,
  "notes" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "postedPaymentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashApplicationMatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FactoringTransaction" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "loadId" TEXT NOT NULL,
  "invoiceId" TEXT,
  "submissionId" TEXT,
  "type" "FactoringTransactionType" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FactoringTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Vendor_orgId_code_key" ON "Vendor"("orgId", "code");

CREATE INDEX IF NOT EXISTS "ARCase_orgId_status_type_createdAt_idx" ON "ARCase"("orgId", "status", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "ARCase_orgId_loadId_createdAt_idx" ON "ARCase"("orgId", "loadId", "createdAt");
CREATE INDEX IF NOT EXISTS "ARCase_orgId_invoiceId_createdAt_idx" ON "ARCase"("orgId", "invoiceId", "createdAt");
CREATE INDEX IF NOT EXISTS "ARCase_orgId_ownerUserId_status_idx" ON "ARCase"("orgId", "ownerUserId", "status");

CREATE INDEX IF NOT EXISTS "ARCaseComment_orgId_caseId_createdAt_idx" ON "ARCaseComment"("orgId", "caseId", "createdAt");

CREATE INDEX IF NOT EXISTS "Vendor_orgId_active_name_idx" ON "Vendor"("orgId", "active", "name");
CREATE INDEX IF NOT EXISTS "VendorBill_orgId_status_createdAt_idx" ON "VendorBill"("orgId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "VendorBill_orgId_vendorId_status_idx" ON "VendorBill"("orgId", "vendorId", "status");
CREATE INDEX IF NOT EXISTS "VendorBill_orgId_loadId_status_idx" ON "VendorBill"("orgId", "loadId", "status");
CREATE INDEX IF NOT EXISTS "VendorBillLine_orgId_vendorBillId_idx" ON "VendorBillLine"("orgId", "vendorBillId");

CREATE INDEX IF NOT EXISTS "CashApplicationBatch_orgId_status_importedAt_idx" ON "CashApplicationBatch"("orgId", "status", "importedAt");
CREATE INDEX IF NOT EXISTS "CashApplicationMatch_orgId_batchId_status_idx" ON "CashApplicationMatch"("orgId", "batchId", "status");
CREATE INDEX IF NOT EXISTS "CashApplicationMatch_orgId_invoiceId_status_idx" ON "CashApplicationMatch"("orgId", "invoiceId", "status");

CREATE INDEX IF NOT EXISTS "FactoringTransaction_orgId_loadId_occurredAt_idx" ON "FactoringTransaction"("orgId", "loadId", "occurredAt");
CREATE INDEX IF NOT EXISTS "FactoringTransaction_orgId_invoiceId_occurredAt_idx" ON "FactoringTransaction"("orgId", "invoiceId", "occurredAt");
CREATE INDEX IF NOT EXISTS "FactoringTransaction_orgId_submissionId_occurredAt_idx" ON "FactoringTransaction"("orgId", "submissionId", "occurredAt");

DO $$
BEGIN
  ALTER TABLE "ARCase"
    ADD CONSTRAINT "ARCase_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ARCase"
    ADD CONSTRAINT "ARCase_loadId_fkey"
    FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ARCase"
    ADD CONSTRAINT "ARCase_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ARCase"
    ADD CONSTRAINT "ARCase_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ARCase"
    ADD CONSTRAINT "ARCase_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ARCaseComment"
    ADD CONSTRAINT "ARCaseComment_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ARCaseComment"
    ADD CONSTRAINT "ARCaseComment_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "ARCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ARCaseComment"
    ADD CONSTRAINT "ARCaseComment_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Vendor"
    ADD CONSTRAINT "Vendor_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Vendor"
    ADD CONSTRAINT "Vendor_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VendorBill"
    ADD CONSTRAINT "VendorBill_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VendorBill"
    ADD CONSTRAINT "VendorBill_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VendorBill"
    ADD CONSTRAINT "VendorBill_loadId_fkey"
    FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VendorBill"
    ADD CONSTRAINT "VendorBill_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VendorBill"
    ADD CONSTRAINT "VendorBill_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VendorBillLine"
    ADD CONSTRAINT "VendorBillLine_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VendorBillLine"
    ADD CONSTRAINT "VendorBillLine_vendorBillId_fkey"
    FOREIGN KEY ("vendorBillId") REFERENCES "VendorBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CashApplicationBatch"
    ADD CONSTRAINT "CashApplicationBatch_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CashApplicationBatch"
    ADD CONSTRAINT "CashApplicationBatch_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CashApplicationMatch"
    ADD CONSTRAINT "CashApplicationMatch_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CashApplicationMatch"
    ADD CONSTRAINT "CashApplicationMatch_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "CashApplicationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CashApplicationMatch"
    ADD CONSTRAINT "CashApplicationMatch_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CashApplicationMatch"
    ADD CONSTRAINT "CashApplicationMatch_loadId_fkey"
    FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CashApplicationMatch"
    ADD CONSTRAINT "CashApplicationMatch_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "FactoringTransaction"
    ADD CONSTRAINT "FactoringTransaction_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "FactoringTransaction"
    ADD CONSTRAINT "FactoringTransaction_loadId_fkey"
    FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "FactoringTransaction"
    ADD CONSTRAINT "FactoringTransaction_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "FactoringTransaction"
    ADD CONSTRAINT "FactoringTransaction_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "BillingSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "FactoringTransaction"
    ADD CONSTRAINT "FactoringTransaction_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

