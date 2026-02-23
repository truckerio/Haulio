DO $$
BEGIN
  CREATE TYPE "TripStatus" AS ENUM ('PLANNED', 'ASSIGNED', 'IN_TRANSIT', 'ARRIVED', 'COMPLETE', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Trip" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "tripNumber" TEXT NOT NULL,
  "status" "TripStatus" NOT NULL DEFAULT 'PLANNED',
  "movementMode" "MovementMode" NOT NULL DEFAULT 'FTL',
  "driverId" TEXT,
  "truckId" TEXT,
  "trailerId" TEXT,
  "sourceManifestId" TEXT,
  "origin" TEXT,
  "destination" TEXT,
  "plannedDepartureAt" TIMESTAMP(3),
  "plannedArrivalAt" TIMESTAMP(3),
  "departedAt" TIMESTAMP(3),
  "arrivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TripLoad" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "loadId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TripLoad_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Trip_orgId_tripNumber_key" ON "Trip"("orgId", "tripNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Trip_sourceManifestId_key" ON "Trip"("sourceManifestId");
CREATE INDEX IF NOT EXISTS "Trip_orgId_status_idx" ON "Trip"("orgId", "status");
CREATE INDEX IF NOT EXISTS "Trip_orgId_movementMode_status_idx" ON "Trip"("orgId", "movementMode", "status");
CREATE INDEX IF NOT EXISTS "Trip_orgId_driverId_idx" ON "Trip"("orgId", "driverId");

CREATE UNIQUE INDEX IF NOT EXISTS "TripLoad_tripId_loadId_key" ON "TripLoad"("tripId", "loadId");
CREATE UNIQUE INDEX IF NOT EXISTS "TripLoad_orgId_loadId_key" ON "TripLoad"("orgId", "loadId");
CREATE INDEX IF NOT EXISTS "TripLoad_orgId_tripId_sequence_idx" ON "TripLoad"("orgId", "tripId", "sequence");

DO $$
BEGIN
  ALTER TABLE "Trip"
    ADD CONSTRAINT "Trip_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Trip"
    ADD CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Trip"
    ADD CONSTRAINT "Trip_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Trip"
    ADD CONSTRAINT "Trip_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "Trailer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Trip"
    ADD CONSTRAINT "Trip_sourceManifestId_fkey" FOREIGN KEY ("sourceManifestId") REFERENCES "TrailerManifest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TripLoad"
    ADD CONSTRAINT "TripLoad_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TripLoad"
    ADD CONSTRAINT "TripLoad_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TripLoad"
    ADD CONSTRAINT "TripLoad_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
