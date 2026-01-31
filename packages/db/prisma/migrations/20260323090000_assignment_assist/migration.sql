-- Assignment assist logging + driver stats
CREATE TABLE IF NOT EXISTS "AssignmentSuggestionLog" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "loadId" TEXT NOT NULL,
  "dispatcherUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "modelVersion" TEXT NOT NULL,
  "weightsVersion" TEXT,
  "suggestionsJson" JSONB NOT NULL,
  "chosenDriverId" TEXT,
  "chosenTruckId" TEXT,
  "overrideReason" TEXT,
  "overrideNotes" TEXT,

  CONSTRAINT "AssignmentSuggestionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AssignmentSuggestionLog_orgId_createdAt_idx" ON "AssignmentSuggestionLog"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "AssignmentSuggestionLog_orgId_loadId_createdAt_idx" ON "AssignmentSuggestionLog"("orgId", "loadId", "createdAt");
CREATE INDEX IF NOT EXISTS "AssignmentSuggestionLog_orgId_dispatcherUserId_createdAt_idx"
  ON "AssignmentSuggestionLog"("orgId", "dispatcherUserId", "createdAt");

ALTER TABLE "AssignmentSuggestionLog"
  ADD CONSTRAINT "AssignmentSuggestionLog_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentSuggestionLog"
  ADD CONSTRAINT "AssignmentSuggestionLog_loadId_fkey"
  FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentSuggestionLog"
  ADD CONSTRAINT "AssignmentSuggestionLog_dispatcherUserId_fkey"
  FOREIGN KEY ("dispatcherUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "DriverStats" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "windowDays" INTEGER NOT NULL,
  "onTimeRate" DOUBLE PRECISION,
  "cancellationRate" DOUBLE PRECISION,
  "issueRate" DOUBLE PRECISION,
  "avgDwellMinutes" DOUBLE PRECISION,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DriverStats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DriverStats_orgId_driverId_windowDays_key"
  ON "DriverStats"("orgId", "driverId", "windowDays");
CREATE INDEX IF NOT EXISTS "DriverStats_orgId_updatedAt_idx" ON "DriverStats"("orgId", "updatedAt");

ALTER TABLE "DriverStats"
  ADD CONSTRAINT "DriverStats_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverStats"
  ADD CONSTRAINT "DriverStats_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
