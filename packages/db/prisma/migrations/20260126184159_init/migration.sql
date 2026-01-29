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
ALTER TABLE "OrgSettings" ALTER COLUMN "requiredDocs" DROP DEFAULT,
ALTER COLUMN "requiredDriverDocs" DROP DEFAULT;

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
ALTER TABLE IF EXISTS "LoadTrackingSession" ADD CONSTRAINT "LoadTrackingSession_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "LoadTrackingSession" ADD CONSTRAINT "LoadTrackingSession_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "LocationPing" ADD CONSTRAINT "LocationPing_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "LoadConfirmationExtractEvent" ADD CONSTRAINT "LoadConfirmationExtractEvent_docId_fkey" FOREIGN KEY ("docId") REFERENCES "LoadConfirmationDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
