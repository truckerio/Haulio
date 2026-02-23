DO $$
BEGIN
  CREATE TYPE "LoadNoteVisibility" AS ENUM ('NORMAL', 'LOCKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "LoadNoteSource" AS ENUM ('OPS', 'DRIVER', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "LoadNote" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "loadId" TEXT NOT NULL,
  "text" VARCHAR(1000) NOT NULL,
  "visibility" "LoadNoteVisibility" NOT NULL DEFAULT 'NORMAL',
  "source" "LoadNoteSource" NOT NULL DEFAULT 'OPS',
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "deletedById" TEXT,
  "deleteReason" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LoadNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LoadNote_orgId_loadId_createdAt_idx" ON "LoadNote"("orgId", "loadId", "createdAt");
CREATE INDEX IF NOT EXISTS "LoadNote_orgId_loadId_deletedAt_idx" ON "LoadNote"("orgId", "loadId", "deletedAt");

DO $$
BEGIN
  ALTER TABLE "LoadNote"
    ADD CONSTRAINT "LoadNote_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "LoadNote"
    ADD CONSTRAINT "LoadNote_loadId_fkey"
    FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "LoadNote"
    ADD CONSTRAINT "LoadNote_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "LoadNote"
    ADD CONSTRAINT "LoadNote_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "LoadNote"
    ADD CONSTRAINT "LoadNote_deletedById_fkey"
    FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
