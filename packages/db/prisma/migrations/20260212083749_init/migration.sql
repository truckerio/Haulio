/*
  Warnings:

  - You are about to drop the column `usedAt` on the `UserInvite` table. All the data in the column will be lost.

*/
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

-- AlterTable
ALTER TABLE IF EXISTS "DriverStats" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "OrgSequence" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "Team" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "UserInvite" DROP COLUMN IF EXISTS "usedAt";

-- AddForeignKey
ALTER TABLE IF EXISTS "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "TeamAssignment" ADD CONSTRAINT "TeamAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "OperatingEntity" ADD CONSTRAINT "OperatingEntity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "TrackingIntegration" ADD CONSTRAINT "TrackingIntegration_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "TruckTelematicsMapping" ADD CONSTRAINT "TruckTelematicsMapping_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "TruckTelematicsMapping" ADD CONSTRAINT "TruckTelematicsMapping_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "LoadTrackingSession" ADD CONSTRAINT "LoadTrackingSession_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "LoadTrackingSession" ADD CONSTRAINT "LoadTrackingSession_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "LocationPing" ADD CONSTRAINT "LocationPing_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "LoadConfirmationExtractEvent" ADD CONSTRAINT "LoadConfirmationExtractEvent_docId_fkey" FOREIGN KEY ("docId") REFERENCES "LoadConfirmationDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "AssignmentSuggestionLog" ADD CONSTRAINT "AssignmentSuggestionLog_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "DriverStats" ADD CONSTRAINT "DriverStats_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
