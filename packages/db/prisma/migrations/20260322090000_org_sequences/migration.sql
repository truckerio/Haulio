-- Create org-specific sequence counters for load + trip numbers.
CREATE TABLE IF NOT EXISTS "OrgSequence" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "nextLoadNumber" INTEGER NOT NULL DEFAULT 1001,
    "nextTripNumber" INTEGER NOT NULL DEFAULT 1001,
    "loadPrefix" VARCHAR(10) NOT NULL DEFAULT 'LD-',
    "tripPrefix" VARCHAR(10) NOT NULL DEFAULT 'TR-',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrgSequence_orgId_key" ON "OrgSequence"("orgId");

ALTER TABLE "OrgSequence"
  ADD CONSTRAINT "OrgSequence_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add optional trip number to loads.
ALTER TABLE "Load" ADD COLUMN IF NOT EXISTS "tripNumber" VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS "Load_orgId_tripNumber_key" ON "Load"("orgId", "tripNumber");
