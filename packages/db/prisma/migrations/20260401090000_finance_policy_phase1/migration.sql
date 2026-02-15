-- Finance policy settings for backend-driven receivables readiness and factoring workflows.
CREATE TYPE "FinanceRateConRequirement" AS ENUM ('ALWAYS', 'BROKERED_ONLY', 'NEVER');
CREATE TYPE "FinanceDeliveredDocRequirement" AS ENUM ('ALWAYS', 'DELIVERED_ONLY', 'NEVER');
CREATE TYPE "FinanceAccessorialProofRequirement" AS ENUM ('ALWAYS', 'WHEN_ACCESSORIAL_PRESENT', 'NEVER');
CREATE TYPE "FactoringAttachmentMode" AS ENUM ('ZIP', 'PDFS', 'LINK_ONLY');

ALTER TABLE "OrgSettings"
  ADD COLUMN "requireRateCon" "FinanceRateConRequirement" NOT NULL DEFAULT 'BROKERED_ONLY',
  ADD COLUMN "requireBOL" "FinanceDeliveredDocRequirement" NOT NULL DEFAULT 'DELIVERED_ONLY',
  ADD COLUMN "requireSignedPOD" "FinanceDeliveredDocRequirement" NOT NULL DEFAULT 'DELIVERED_ONLY',
  ADD COLUMN "requireAccessorialProof" "FinanceAccessorialProofRequirement" NOT NULL DEFAULT 'WHEN_ACCESSORIAL_PRESENT',
  ADD COLUMN "requireInvoiceBeforeSend" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "factoringEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "factoringEmail" TEXT,
  ADD COLUMN "factoringCcEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "factoringAttachmentMode" "FactoringAttachmentMode" NOT NULL DEFAULT 'LINK_ONLY';
