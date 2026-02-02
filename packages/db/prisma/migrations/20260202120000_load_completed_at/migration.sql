-- Add completedAt for dispatch history filters
ALTER TABLE "Load" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "Load_orgId_completedAt_idx" ON "Load"("orgId", "completedAt");
CREATE INDEX IF NOT EXISTS "Load_orgId_status_completedAt_idx" ON "Load"("orgId", "status", "completedAt");
