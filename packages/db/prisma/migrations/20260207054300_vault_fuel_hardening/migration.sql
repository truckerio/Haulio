-- CreateEnum
CREATE TYPE "VaultScopeType" AS ENUM ('ORG', 'TRUCK', 'DRIVER');

-- CreateEnum
CREATE TYPE "VaultDocType" AS ENUM ('INSURANCE', 'REGISTRATION', 'PERMIT', 'CARGO_INSURANCE', 'LIABILITY', 'IFTA', 'TITLE', 'OTHER');

-- CreateEnum
CREATE TYPE "FuelSummarySource" AS ENUM ('SAMSARA');

DO $$
BEGIN
  CREATE TYPE "TrackingProviderType" AS ENUM ('PHONE', 'SAMSARA');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- DropForeignKey
ALTER TABLE IF EXISTS "AssignmentSuggestionLog" DROP CONSTRAINT IF EXISTS "AssignmentSuggestionLog_loadId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "DriverStats" DROP CONSTRAINT IF EXISTS "DriverStats_driverId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "LoadConfirmationExtractEvent" DROP CONSTRAINT IF EXISTS "LoadConfirmationExtractEvent_docId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "LoadTrackingSession" DROP CONSTRAINT IF EXISTS "LoadTrackingSession_loadId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "LoadTrackingSession" DROP CONSTRAINT IF EXISTS "LoadTrackingSession_orgId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "LocationPing" DROP CONSTRAINT IF EXISTS "LocationPing_orgId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "OperatingEntity" DROP CONSTRAINT IF EXISTS "OperatingEntity_orgId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "TeamAssignment" DROP CONSTRAINT IF EXISTS "TeamAssignment_teamId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "TeamMember" DROP CONSTRAINT IF EXISTS "TeamMember_teamId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "TeamMember" DROP CONSTRAINT IF EXISTS "TeamMember_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "TrackingIntegration" DROP CONSTRAINT IF EXISTS "TrackingIntegration_orgId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "TruckTelematicsMapping" DROP CONSTRAINT IF EXISTS "TruckTelematicsMapping_orgId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "TruckTelematicsMapping" DROP CONSTRAINT IF EXISTS "TruckTelematicsMapping_truckId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "UserInvite" DROP CONSTRAINT IF EXISTS "UserInvite_orgId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "UserInvite" DROP CONSTRAINT IF EXISTS "UserInvite_userId_fkey";

-- AlterTable
ALTER TABLE IF EXISTS "DriverStats" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "OrgSequence" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "OrgSettings" ALTER COLUMN "requiredDocs" DROP DEFAULT,
ALTER COLUMN "requiredDriverDocs" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "Team" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "TrackingIntegration"
  ADD COLUMN IF NOT EXISTS "lastFuelSyncAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastFuelSyncError" TEXT;

-- CreateTable
CREATE TABLE "FuelSummary" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "providerType" "TrackingProviderType" NOT NULL,
    "source" "FuelSummarySource" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "fuelUsed" DECIMAL(12,2),
    "distance" DECIMAL(12,2),
    "fuelEfficiency" DECIMAL(12,4),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultDocument" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "scopeType" "VaultScopeType" NOT NULL,
    "scopeId" TEXT,
    "docType" "VaultDocType" NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "referenceNumber" TEXT,
    "notes" TEXT,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FuelSummary_orgId_periodStart_periodEnd_idx" ON "FuelSummary"("orgId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "FuelSummary_orgId_truckId_idx" ON "FuelSummary"("orgId", "truckId");

-- CreateIndex
CREATE UNIQUE INDEX "FuelSummary_orgId_truckId_providerType_periodStart_periodEn_key" ON "FuelSummary"("orgId", "truckId", "providerType", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "VaultDocument_orgId_scopeType_docType_idx" ON "VaultDocument"("orgId", "scopeType", "docType");

-- CreateIndex
CREATE INDEX "VaultDocument_orgId_expiresAt_idx" ON "VaultDocument"("orgId", "expiresAt");

-- AddForeignKey
ALTER TABLE IF EXISTS "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "TeamAssignment" ADD CONSTRAINT "TeamAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "UserInvite" ADD CONSTRAINT "UserInvite_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "UserInvite" ADD CONSTRAINT "UserInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "OperatingEntity" ADD CONSTRAINT "OperatingEntity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "TrackingIntegration" ADD CONSTRAINT "TrackingIntegration_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "TruckTelematicsMapping" ADD CONSTRAINT "TruckTelematicsMapping_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "TruckTelematicsMapping" ADD CONSTRAINT "TruckTelematicsMapping_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "FuelSummary" ADD CONSTRAINT "FuelSummary_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "FuelSummary" ADD CONSTRAINT "FuelSummary_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "LoadTrackingSession" ADD CONSTRAINT "LoadTrackingSession_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "LoadTrackingSession" ADD CONSTRAINT "LoadTrackingSession_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "LocationPing" ADD CONSTRAINT "LocationPing_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "VaultDocument" ADD CONSTRAINT "VaultDocument_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "VaultDocument" ADD CONSTRAINT "VaultDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "LoadConfirmationExtractEvent" ADD CONSTRAINT "LoadConfirmationExtractEvent_docId_fkey" FOREIGN KEY ("docId") REFERENCES "LoadConfirmationDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "AssignmentSuggestionLog" ADD CONSTRAINT "AssignmentSuggestionLog_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "DriverStats" ADD CONSTRAINT "DriverStats_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
