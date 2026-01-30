DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'LoadConfirmationDocument'
  ) THEN
    ALTER TABLE "LoadConfirmationDocument" ADD COLUMN IF NOT EXISTS "extractedText" TEXT;
    ALTER TABLE "LoadConfirmationDocument" ADD COLUMN IF NOT EXISTS "extractedDraft" JSONB;
  END IF;
END $$;

-- CreateTable
CREATE TABLE "LoadConfirmationLearningExample" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "docId" TEXT,
  "docFingerprint" TEXT,
  "brokerName" TEXT,
  "extractedText" TEXT,
  "extractedDraft" JSONB,
  "correctedDraft" JSONB NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LoadConfirmationLearningExample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoadConfirmationLearningExample_orgId_createdAt_idx" ON "LoadConfirmationLearningExample"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "LoadConfirmationLearningExample_orgId_docFingerprint_idx" ON "LoadConfirmationLearningExample"("orgId", "docFingerprint");

-- CreateIndex
CREATE INDEX "LoadConfirmationLearningExample_orgId_brokerName_idx" ON "LoadConfirmationLearningExample"("orgId", "brokerName");

-- AddForeignKey
ALTER TABLE "LoadConfirmationLearningExample" ADD CONSTRAINT "LoadConfirmationLearningExample_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
