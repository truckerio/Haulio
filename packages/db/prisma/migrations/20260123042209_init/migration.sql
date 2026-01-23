-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "LoadTrackingSession" DROP CONSTRAINT "LoadTrackingSession_loadId_fkey";

-- DropForeignKey
ALTER TABLE "LoadTrackingSession" DROP CONSTRAINT "LoadTrackingSession_orgId_fkey";

-- DropForeignKey
ALTER TABLE "LocationPing" DROP CONSTRAINT "LocationPing_orgId_fkey";

-- DropForeignKey
ALTER TABLE "OperatingEntity" DROP CONSTRAINT "OperatingEntity_orgId_fkey";

-- DropForeignKey
ALTER TABLE "TrackingIntegration" DROP CONSTRAINT "TrackingIntegration_orgId_fkey";

-- DropForeignKey
ALTER TABLE "TruckTelematicsMapping" DROP CONSTRAINT "TruckTelematicsMapping_orgId_fkey";

-- DropForeignKey
ALTER TABLE "TruckTelematicsMapping" DROP CONSTRAINT "TruckTelematicsMapping_truckId_fkey";

-- DropForeignKey
ALTER TABLE "UserInvite" DROP CONSTRAINT "UserInvite_orgId_fkey";

-- DropForeignKey
ALTER TABLE "UserInvite" DROP CONSTRAINT "UserInvite_userId_fkey";

-- DropIndex
DROP INDEX "Load_loadNumber_key";

-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "OrgSettings" ALTER COLUMN "requiredDocs" DROP DEFAULT,
ALTER COLUMN "requiredDriverDocs" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
