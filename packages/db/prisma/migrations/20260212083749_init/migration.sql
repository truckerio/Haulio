/*
  Warnings:

  - You are about to drop the column `usedAt` on the `UserInvite` table. All the data in the column will be lost.

*/
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
ALTER TABLE "OrgSequence" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Team" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "UserInvite" DROP COLUMN "usedAt";

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamAssignment" ADD CONSTRAINT "TeamAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
