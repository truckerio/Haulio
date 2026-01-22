-- CreateEnum
CREATE TYPE "LegType" AS ENUM ('PICKUP', 'LINEHAUL', 'DELIVERY');

-- CreateEnum
CREATE TYPE "LegStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETE');

-- CreateEnum
CREATE TYPE "ManifestStatus" AS ENUM ('PLANNED', 'LOADED', 'IN_TRANSIT', 'ARRIVED', 'UNLOADED', 'COMPLETE');

-- AlterEnum
ALTER TYPE "StopType" ADD VALUE 'YARD';

-- AlterTable
ALTER TABLE "Load" ADD COLUMN     "miles" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "OrgSettings" ADD COLUMN     "driverRatePerMile" DOUBLE PRECISION NOT NULL DEFAULT 0.65;

-- CreateTable
CREATE TABLE "LoadLeg" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "LegType" NOT NULL,
    "status" "LegStatus" NOT NULL DEFAULT 'PLANNED',
    "startStopSequence" INTEGER,
    "endStopSequence" INTEGER,
    "driverId" TEXT,
    "truckId" TEXT,
    "trailerId" TEXT,
    "departedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoadLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrailerManifest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "trailerId" TEXT NOT NULL,
    "truckId" TEXT,
    "driverId" TEXT,
    "status" "ManifestStatus" NOT NULL DEFAULT 'PLANNED',
    "origin" TEXT,
    "destination" TEXT,
    "plannedDepartureAt" TIMESTAMP(3),
    "plannedArrivalAt" TIMESTAMP(3),
    "departedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrailerManifest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrailerManifestItem" (
    "id" TEXT NOT NULL,
    "manifestId" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,

    CONSTRAINT "TrailerManifestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoadLeg_loadId_sequence_idx" ON "LoadLeg"("loadId", "sequence");

-- CreateIndex
CREATE INDEX "TrailerManifest_orgId_status_idx" ON "TrailerManifest"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TrailerManifestItem_manifestId_loadId_key" ON "TrailerManifestItem"("manifestId", "loadId");

-- AddForeignKey
ALTER TABLE "LoadLeg" ADD CONSTRAINT "LoadLeg_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadLeg" ADD CONSTRAINT "LoadLeg_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadLeg" ADD CONSTRAINT "LoadLeg_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadLeg" ADD CONSTRAINT "LoadLeg_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadLeg" ADD CONSTRAINT "LoadLeg_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "Trailer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailerManifest" ADD CONSTRAINT "TrailerManifest_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailerManifest" ADD CONSTRAINT "TrailerManifest_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "Trailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailerManifest" ADD CONSTRAINT "TrailerManifest_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailerManifest" ADD CONSTRAINT "TrailerManifest_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailerManifestItem" ADD CONSTRAINT "TrailerManifestItem_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "TrailerManifest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailerManifestItem" ADD CONSTRAINT "TrailerManifestItem_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
