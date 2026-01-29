-- Add soft-delete metadata to loads
ALTER TABLE "Load" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Load" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "Load" ADD COLUMN "deletedReason" TEXT;

-- Track deleted loads for list filtering
CREATE INDEX "Load_orgId_deletedAt_idx" ON "Load"("orgId", "deletedAt");

-- Link deletedBy to users
ALTER TABLE "Load"
  ADD CONSTRAINT "Load_deletedById_fkey"
  FOREIGN KEY ("deletedById") REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
