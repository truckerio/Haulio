CREATE TYPE "BillingSubmissionChannel" AS ENUM ('FACTORING');
CREATE TYPE "BillingSubmissionStatus" AS ENUM ('SENT', 'FAILED');

CREATE TABLE "BillingSubmission" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "loadId" TEXT NOT NULL,
  "invoiceId" TEXT,
  "channel" "BillingSubmissionChannel" NOT NULL,
  "status" "BillingSubmissionStatus" NOT NULL,
  "toEmail" TEXT NOT NULL,
  "ccEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "attachmentMode" "FactoringAttachmentMode" NOT NULL,
  "packetPath" TEXT,
  "packetLink" TEXT,
  "errorMessage" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BillingSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillingSubmission_orgId_loadId_createdAt_idx" ON "BillingSubmission"("orgId", "loadId", "createdAt");
CREATE INDEX "BillingSubmission_orgId_channel_status_createdAt_idx" ON "BillingSubmission"("orgId", "channel", "status", "createdAt");

ALTER TABLE "BillingSubmission"
  ADD CONSTRAINT "BillingSubmission_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BillingSubmission_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BillingSubmission_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BillingSubmission_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
