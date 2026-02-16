DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FinancePaymentMethod') THEN
    CREATE TYPE "FinancePaymentMethod" AS ENUM ('ACH', 'WIRE', 'CHECK', 'CASH', 'FACTORING', 'OTHER');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "InvoicePayment" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "loadId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "method" "FinancePaymentMethod" NOT NULL DEFAULT 'OTHER',
  "reference" TEXT,
  "notes" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InvoicePayment_orgId_loadId_createdAt_idx"
ON "InvoicePayment"("orgId", "loadId", "createdAt");

CREATE INDEX IF NOT EXISTS "InvoicePayment_invoiceId_createdAt_idx"
ON "InvoicePayment"("invoiceId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InvoicePayment_orgId_fkey'
  ) THEN
    ALTER TABLE "InvoicePayment"
    ADD CONSTRAINT "InvoicePayment_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InvoicePayment_loadId_fkey'
  ) THEN
    ALTER TABLE "InvoicePayment"
    ADD CONSTRAINT "InvoicePayment_loadId_fkey"
    FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InvoicePayment_invoiceId_fkey'
  ) THEN
    ALTER TABLE "InvoicePayment"
    ADD CONSTRAINT "InvoicePayment_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InvoicePayment_createdById_fkey'
  ) THEN
    ALTER TABLE "InvoicePayment"
    ADD CONSTRAINT "InvoicePayment_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

