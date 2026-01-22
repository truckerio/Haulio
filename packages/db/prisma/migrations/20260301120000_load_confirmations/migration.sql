CREATE TYPE "LoadConfirmationStatus" AS ENUM ('UPLOADED', 'EXTRACTING', 'NEEDS_REVIEW', 'READY_TO_CREATE', 'CREATED', 'FAILED');

ALTER TABLE "Load" ADD COLUMN "shipperReferenceNumber" VARCHAR(64);
ALTER TABLE "Load" ADD COLUMN "consigneeReferenceNumber" VARCHAR(64);
ALTER TABLE "Load" ADD COLUMN "palletCount" INTEGER;
ALTER TABLE "Load" ADD COLUMN "weightLbs" INTEGER;

CREATE TABLE "LoadConfirmationDocument" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "LoadConfirmationStatus" NOT NULL DEFAULT 'UPLOADED',
    "extractedJson" JSONB,
    "normalizedDraft" JSONB,
    "errorMessage" TEXT,
    "createdLoadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoadConfirmationDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoadConfirmationExtractEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoadConfirmationExtractEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoadConfirmationDocument_orgId_sha256_idx" ON "LoadConfirmationDocument"("orgId", "sha256");
CREATE INDEX "LoadConfirmationDocument_orgId_status_idx" ON "LoadConfirmationDocument"("orgId", "status");
CREATE INDEX "LoadConfirmationExtractEvent_orgId_docId_idx" ON "LoadConfirmationExtractEvent"("orgId", "docId");
CREATE INDEX "LoadConfirmationExtractEvent_orgId_createdAt_idx" ON "LoadConfirmationExtractEvent"("orgId", "createdAt");

ALTER TABLE "LoadConfirmationDocument" ADD CONSTRAINT "LoadConfirmationDocument_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LoadConfirmationDocument" ADD CONSTRAINT "LoadConfirmationDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoadConfirmationDocument" ADD CONSTRAINT "LoadConfirmationDocument_createdLoadId_fkey" FOREIGN KEY ("createdLoadId") REFERENCES "Load"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LoadConfirmationExtractEvent" ADD CONSTRAINT "LoadConfirmationExtractEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LoadConfirmationExtractEvent" ADD CONSTRAINT "LoadConfirmationExtractEvent_docId_fkey" FOREIGN KEY ("docId") REFERENCES "LoadConfirmationDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
