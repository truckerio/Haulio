DO $$
BEGIN
  CREATE TYPE "MovementMode" AS ENUM ('FTL', 'LTL', 'POOL_DISTRIBUTION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PayableMilesSource" AS ENUM ('PLANNED', 'APPROVED_ACTUAL', 'MANUAL_OVERRIDE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Load"
  ADD COLUMN IF NOT EXISTS "movementMode" "MovementMode" NOT NULL DEFAULT 'FTL',
  ADD COLUMN IF NOT EXISTS "paidMiles" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "paidMilesSource" "PayableMilesSource",
  ADD COLUMN IF NOT EXISTS "paidMilesApprovedById" TEXT,
  ADD COLUMN IF NOT EXISTS "paidMilesApprovedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Load_orgId_movementMode_status_idx" ON "Load"("orgId", "movementMode", "status");

ALTER TABLE "PayableLineItem"
  ADD COLUMN IF NOT EXISTS "paidMiles" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "ratePerMile" DECIMAL(12,4),
  ADD COLUMN IF NOT EXISTS "milesSource" "PayableMilesSource",
  ADD COLUMN IF NOT EXISTS "milesVariancePct" DECIMAL(6,2),
  ADD COLUMN IF NOT EXISTS "requiresReview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reviewReasonCode" TEXT,
  ADD COLUMN IF NOT EXISTS "milesApprovedById" TEXT,
  ADD COLUMN IF NOT EXISTS "milesApprovedAt" TIMESTAMP(3);
