-- CreateEnum
CREATE TYPE "OperatingEntityType" AS ENUM ('CARRIER', 'BROKER');

-- CreateEnum
CREATE TYPE "LoadType" AS ENUM ('COMPANY', 'BROKERED');

-- CreateEnum
CREATE TYPE "TrackingProviderType" AS ENUM ('PHONE', 'SAMSARA');

-- CreateEnum
CREATE TYPE "TrackingSessionStatus" AS ENUM ('OFF', 'ON', 'ERROR', 'ENDED');

-- CreateEnum
CREATE TYPE "TrackingIntegrationStatus" AS ENUM ('CONNECTED', 'DISCONNECTED');

-- AlterTable
ALTER TABLE "Load" ADD COLUMN     "loadType" "LoadType" NOT NULL DEFAULT 'COMPANY';
ALTER TABLE "Load" ADD COLUMN     "operatingEntityId" TEXT;

-- CreateTable
CREATE TABLE "OperatingEntity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OperatingEntityType" NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "mcNumber" TEXT,
    "dotNumber" TEXT,
    "remitToName" TEXT,
    "remitToAddressLine1" TEXT,
    "remitToCity" TEXT,
    "remitToState" TEXT,
    "remitToZip" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatingEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingIntegration" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "providerType" "TrackingProviderType" NOT NULL,
    "status" "TrackingIntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "configJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TruckTelematicsMapping" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "providerType" "TrackingProviderType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TruckTelematicsMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadTrackingSession" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "providerType" "TrackingProviderType" NOT NULL,
    "status" "TrackingSessionStatus" NOT NULL DEFAULT 'OFF',
    "startedByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "LoadTrackingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationPing" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "loadId" TEXT,
    "truckId" TEXT,
    "driverId" TEXT,
    "providerType" "TrackingProviderType" NOT NULL,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "speedMph" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationPing_pkey" PRIMARY KEY ("id")
);

-- Backfill default operating entities per org
INSERT INTO "OperatingEntity" (
    "id",
    "orgId",
    "name",
    "type",
    "addressLine1",
    "remitToName",
    "remitToAddressLine1",
    "isDefault",
    "createdAt",
    "updatedAt"
)
SELECT
    concat('oe_', md5(org."id" || clock_timestamp()::text || random()::text)),
    org."id",
    COALESCE(settings."companyDisplayName", org."name", 'Operating Entity'),
    'CARRIER',
    settings."remitToAddress",
    COALESCE(settings."companyDisplayName", org."name", 'Operating Entity'),
    settings."remitToAddress",
    true,
    NOW(),
    NOW()
FROM "Organization" org
LEFT JOIN "OrgSettings" settings ON settings."orgId" = org."id";

-- Backfill loads to default operating entity
UPDATE "Load" AS load
SET "operatingEntityId" = oe."id"
FROM "OperatingEntity" oe
WHERE oe."orgId" = load."orgId" AND oe."isDefault" = true;

-- AlterTable
ALTER TABLE "Load" ALTER COLUMN "operatingEntityId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Load_orgId_operatingEntityId_idx" ON "Load"("orgId", "operatingEntityId");

-- CreateIndex
CREATE INDEX "OperatingEntity_orgId_idx" ON "OperatingEntity"("orgId");

-- CreateIndex
CREATE INDEX "OperatingEntity_orgId_isDefault_idx" ON "OperatingEntity"("orgId", "isDefault");

-- CreateIndex
CREATE INDEX "TrackingIntegration_orgId_status_idx" ON "TrackingIntegration"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingIntegration_orgId_providerType_key" ON "TrackingIntegration"("orgId", "providerType");

-- CreateIndex
CREATE UNIQUE INDEX "TruckTelematicsMapping_orgId_providerType_externalId_key" ON "TruckTelematicsMapping"("orgId", "providerType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "TruckTelematicsMapping_orgId_truckId_providerType_key" ON "TruckTelematicsMapping"("orgId", "truckId", "providerType");

-- CreateIndex
CREATE INDEX "TruckTelematicsMapping_orgId_truckId_idx" ON "TruckTelematicsMapping"("orgId", "truckId");

-- CreateIndex
CREATE INDEX "LoadTrackingSession_orgId_loadId_idx" ON "LoadTrackingSession"("orgId", "loadId");

-- CreateIndex
CREATE INDEX "LocationPing_orgId_loadId_capturedAt_idx" ON "LocationPing"("orgId", "loadId", "capturedAt");

-- CreateIndex
CREATE INDEX "LocationPing_orgId_truckId_capturedAt_idx" ON "LocationPing"("orgId", "truckId", "capturedAt");

-- AddForeignKey
ALTER TABLE "OperatingEntity" ADD CONSTRAINT "OperatingEntity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingIntegration" ADD CONSTRAINT "TrackingIntegration_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckTelematicsMapping" ADD CONSTRAINT "TruckTelematicsMapping_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckTelematicsMapping" ADD CONSTRAINT "TruckTelematicsMapping_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadTrackingSession" ADD CONSTRAINT "LoadTrackingSession_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadTrackingSession" ADD CONSTRAINT "LoadTrackingSession_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadTrackingSession" ADD CONSTRAINT "LoadTrackingSession_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Load" ADD CONSTRAINT "Load_operatingEntityId_fkey" FOREIGN KEY ("operatingEntityId") REFERENCES "OperatingEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
