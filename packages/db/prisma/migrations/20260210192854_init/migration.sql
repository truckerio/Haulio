-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('BLOCKED', 'READY', 'INVOICED');

-- CreateEnum
CREATE TYPE "AccessorialType" AS ENUM ('DETENTION', 'LUMPER', 'TONU', 'REDELIVERY', 'STOP_OFF', 'OTHER');

-- CreateEnum
CREATE TYPE "AccessorialStatus" AS ENUM ('PROPOSED', 'NEEDS_PROOF', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocType" ADD VALUE 'RATE_CONFIRMATION';
ALTER TYPE "DocType" ADD VALUE 'ACCESSORIAL_PROOF';

-- DropForeignKey
ALTER TABLE "AssignmentSuggestionLog" DROP CONSTRAINT "AssignmentSuggestionLog_loadId_fkey";

-- DropForeignKey
ALTER TABLE "DriverStats" DROP CONSTRAINT "DriverStats_driverId_fkey";

-- DropForeignKey
ALTER TABLE "LoadConfirmationExtractEvent" DROP CONSTRAINT "LoadConfirmationExtractEvent_docId_fkey";

-- DropForeignKey
ALTER TABLE "LoadTrackingSession" DROP CONSTRAINT "LoadTrackingSession_loadId_fkey";

-- DropForeignKey
ALTER TABLE "LoadTrackingSession" DROP CONSTRAINT "LoadTrackingSession_orgId_fkey";

-- DropForeignKey
ALTER TABLE "LocationPing" DROP CONSTRAINT "LocationPing_orgId_fkey";

-- DropForeignKey
ALTER TABLE "OperatingEntity" DROP CONSTRAINT "OperatingEntity_orgId_fkey";

-- DropForeignKey
ALTER TABLE "TeamAssignment" DROP CONSTRAINT "TeamAssignment_teamId_fkey";

-- DropForeignKey
ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_teamId_fkey";

-- DropForeignKey
ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_userId_fkey";

-- DropForeignKey
ALTER TABLE "TrackingIntegration" DROP CONSTRAINT "TrackingIntegration_orgId_fkey";

-- DropForeignKey
ALTER TABLE "TruckTelematicsMapping" DROP CONSTRAINT "TruckTelematicsMapping_orgId_fkey";

-- DropForeignKey
ALTER TABLE "TruckTelematicsMapping" DROP CONSTRAINT "TruckTelematicsMapping_truckId_fkey";

-- AlterTable
ALTER TABLE "DriverStats" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Load" ADD COLUMN     "billingBlockingReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "billingStatus" "BillingStatus" NOT NULL DEFAULT 'BLOCKED',
ADD COLUMN     "externalInvoiceRef" TEXT,
ADD COLUMN     "invoicedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrgSequence" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Team" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Accessorial" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "type" "AccessorialType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "requiresProof" BOOLEAN NOT NULL DEFAULT false,
    "status" "AccessorialStatus" NOT NULL DEFAULT 'PROPOSED',
    "notes" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "proofDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Accessorial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Accessorial_proofDocumentId_key" ON "Accessorial"("proofDocumentId");

-- CreateIndex
CREATE INDEX "Accessorial_orgId_loadId_idx" ON "Accessorial"("orgId", "loadId");

-- CreateIndex
CREATE INDEX "Accessorial_loadId_idx" ON "Accessorial"("loadId");

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamAssignment" ADD CONSTRAINT "TeamAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accessorial" ADD CONSTRAINT "Accessorial_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accessorial" ADD CONSTRAINT "Accessorial_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accessorial" ADD CONSTRAINT "Accessorial_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accessorial" ADD CONSTRAINT "Accessorial_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accessorial" ADD CONSTRAINT "Accessorial_proofDocumentId_fkey" FOREIGN KEY ("proofDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatingEntity" ADD CONSTRAINT "OperatingEntity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingIntegration" ADD CONSTRAINT "TrackingIntegration_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckTelematicsMapping" ADD CONSTRAINT "TruckTelematicsMapping_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckTelematicsMapping" ADD CONSTRAINT "TruckTelematicsMapping_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadTrackingSession" ADD CONSTRAINT "LoadTrackingSession_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadTrackingSession" ADD CONSTRAINT "LoadTrackingSession_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadConfirmationExtractEvent" ADD CONSTRAINT "LoadConfirmationExtractEvent_docId_fkey" FOREIGN KEY ("docId") REFERENCES "LoadConfirmationDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSuggestionLog" ADD CONSTRAINT "AssignmentSuggestionLog_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverStats" ADD CONSTRAINT "DriverStats_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
