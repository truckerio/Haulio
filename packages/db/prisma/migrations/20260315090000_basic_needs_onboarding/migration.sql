-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('AVAILABLE', 'ON_LOAD', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "TruckStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "TrailerStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "TrailerType" AS ENUM ('DRY_VAN', 'REEFER', 'FLATBED', 'OTHER');

-- CreateEnum
CREATE TYPE "OperatingMode" AS ENUM ('CARRIER', 'BROKER', 'BOTH');

-- CreateEnum
CREATE TYPE "TrackingPreference" AS ENUM ('MANUAL', 'SAMSARA', 'MOTIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "SettlementSchedule" AS ENUM ('WEEKLY', 'BIWEEKLY', 'SEMI_MONTHLY', 'MONTHLY');

-- AlterEnum
ALTER TYPE "LoadStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "LoadStatus" ADD VALUE IF NOT EXISTS 'POD_RECEIVED';
ALTER TYPE "LoadStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "LoadStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'LOAD_STATUS_UPDATED';

-- AlterTable
ALTER TABLE "Driver"
ADD COLUMN "status" "DriverStatus" NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE "Truck"
ADD COLUMN "vin" TEXT,
ADD COLUMN "plateState" TEXT,
ADD COLUMN "status" "TruckStatus" NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE "Trailer"
ADD COLUMN "type" "TrailerType" NOT NULL DEFAULT 'OTHER',
ADD COLUMN "plateState" TEXT,
ADD COLUMN "status" "TrailerStatus" NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE "Load"
ADD COLUMN "assignedDriverAt" TIMESTAMP(3),
ADD COLUMN "assignedTruckAt" TIMESTAMP(3),
ADD COLUMN "assignedTrailerAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrgSettings"
ADD COLUMN "requireRateConBeforeDispatch" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrgSettings"
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN "operatingMode" "OperatingMode" NOT NULL DEFAULT 'CARRIER',
ADD COLUMN "trackingPreference" "TrackingPreference" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "settlementSchedule" "SettlementSchedule" NOT NULL DEFAULT 'WEEKLY',
ADD COLUMN "settlementTemplate" JSONB;

-- AlterTable
ALTER TABLE "AuditLog"
ADD COLUMN "before" JSONB,
ADD COLUMN "after" JSONB;

-- CreateTable
CREATE TABLE "OnboardingState" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_ACTIVATED',
  "completedSteps" JSONB NOT NULL,
  "percentComplete" INTEGER NOT NULL,
  "currentStep" INTEGER NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OnboardingState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Truck_orgId_unit_key" ON "Truck"("orgId", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "Truck_orgId_vin_key" ON "Truck"("orgId", "vin");

-- CreateIndex
CREATE UNIQUE INDEX "Trailer_orgId_unit_key" ON "Trailer"("orgId", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingState_orgId_key" ON "OnboardingState"("orgId");

-- AddForeignKey
ALTER TABLE "OnboardingState" ADD CONSTRAINT "OnboardingState_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
