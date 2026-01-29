-- CreateEnum
CREATE TYPE "LearningDomain" AS ENUM (
  'MATCH_CUSTOMER',
  'MATCH_SHIPPER',
  'MATCH_CONSIGNEE',
  'MATCH_ADDRESS',
  'IMPORT_MAPPING',
  'CHARGE_SUGGESTION',
  'ATTENTION_OUTCOME'
);

-- CreateTable
CREATE TABLE "LearningExample" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "domain" "LearningDomain" NOT NULL,
  "inputJson" JSONB NOT NULL,
  "correctedJson" JSONB NOT NULL,
  "contextJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LearningExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnedMapping" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "domain" "LearningDomain" NOT NULL,
  "key" TEXT NOT NULL,
  "valueJson" JSONB NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LearnedMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearningExample_orgId_domain_createdAt_idx" ON "LearningExample"("orgId", "domain", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LearnedMapping_orgId_domain_key_key" ON "LearnedMapping"("orgId", "domain", "key");

-- CreateIndex
CREATE INDEX "LearnedMapping_orgId_domain_updatedAt_idx" ON "LearnedMapping"("orgId", "domain", "updatedAt");

-- AddForeignKey
ALTER TABLE "LearningExample" ADD CONSTRAINT "LearningExample_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnedMapping" ADD CONSTRAINT "LearnedMapping_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
