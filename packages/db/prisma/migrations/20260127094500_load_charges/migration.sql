-- CreateEnum
CREATE TYPE "LoadChargeType" AS ENUM ('LINEHAUL', 'LUMPER', 'DETENTION', 'LAYOVER', 'OTHER', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "LoadCharge" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "type" "LoadChargeType" NOT NULL,
    "description" TEXT,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoadCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoadCharge_orgId_loadId_idx" ON "LoadCharge"("orgId", "loadId");

-- CreateIndex
CREATE INDEX "LoadCharge_loadId_idx" ON "LoadCharge"("loadId");

-- AddForeignKey
ALTER TABLE "LoadCharge" ADD CONSTRAINT "LoadCharge_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadCharge" ADD CONSTRAINT "LoadCharge_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
