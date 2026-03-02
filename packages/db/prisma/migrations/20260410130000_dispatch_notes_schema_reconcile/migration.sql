-- Reconcile production schema drift for dispatch exceptions + notes v1 fields.
-- Safe/idempotent guards are used because some environments already have subsets.

DO $$
BEGIN
  CREATE TYPE "NoteEntityType" AS ENUM ('LOAD', 'TRIP', 'STOP');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "NoteType" AS ENUM ('OPERATIONAL', 'BILLING', 'COMPLIANCE', 'INTERNAL', 'CUSTOMER_VISIBLE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "NotePriority" AS ENUM ('NORMAL', 'IMPORTANT', 'ALERT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "DispatchViewScope" AS ENUM ('PERSONAL', 'ADMIN_TEMPLATE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "DispatchExceptionSeverity" AS ENUM ('WARNING', 'BLOCKER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "DispatchExceptionStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "DispatchExceptionOwner" AS ENUM ('DISPATCH', 'DRIVER', 'BILLING', 'CUSTOMER', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "LoadNote"
  ADD COLUMN IF NOT EXISTS "entityType" "NoteEntityType",
  ADD COLUMN IF NOT EXISTS "entityId" TEXT,
  ADD COLUMN IF NOT EXISTS "stopId" TEXT,
  ADD COLUMN IF NOT EXISTS "replyToNoteId" TEXT,
  ADD COLUMN IF NOT EXISTS "noteType" "NoteType" NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN IF NOT EXISTS "priority" "NotePriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false;

UPDATE "LoadNote"
SET "entityType" = 'LOAD'
WHERE "entityType" IS NULL;

UPDATE "LoadNote"
SET "entityId" = COALESCE("loadId", "id")
WHERE "entityId" IS NULL;

ALTER TABLE "LoadNote" ALTER COLUMN "entityType" SET DEFAULT 'LOAD';
ALTER TABLE "LoadNote" ALTER COLUMN "entityType" SET NOT NULL;
ALTER TABLE "LoadNote" ALTER COLUMN "entityId" SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE "LoadNote" ALTER COLUMN "loadId" DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "LoadNote_orgId_entityType_entityId_createdAt_idx"
  ON "LoadNote"("orgId", "entityType", "entityId", "createdAt");

CREATE INDEX IF NOT EXISTS "LoadNote_orgId_entityType_entityId_priority_idx"
  ON "LoadNote"("orgId", "entityType", "entityId", "priority");

CREATE INDEX IF NOT EXISTS "LoadNote_orgId_stopId_createdAt_idx"
  ON "LoadNote"("orgId", "stopId", "createdAt");

CREATE INDEX IF NOT EXISTS "LoadNote_replyToNoteId_idx"
  ON "LoadNote"("replyToNoteId");

CREATE INDEX IF NOT EXISTS "LoadNote_orgId_entityType_entityId_expiresAt_idx"
  ON "LoadNote"("orgId", "entityType", "entityId", "expiresAt");

CREATE INDEX IF NOT EXISTS "LoadNote_orgId_entityType_entityId_pinned_idx"
  ON "LoadNote"("orgId", "entityType", "entityId", "pinned");

DO $$
BEGIN
  ALTER TABLE "LoadNote"
    ADD CONSTRAINT "LoadNote_stopId_fkey"
    FOREIGN KEY ("stopId") REFERENCES "Stop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "LoadNote"
    ADD CONSTRAINT "LoadNote_replyToNoteId_fkey"
    FOREIGN KEY ("replyToNoteId") REFERENCES "LoadNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "DispatchView" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "scope" "DispatchViewScope" NOT NULL,
  "userId" TEXT,
  "role" "Role",
  "isRoleDefault" BOOLEAN NOT NULL DEFAULT false,
  "configJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DispatchView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DispatchView_orgId_scope_userId_idx"
  ON "DispatchView"("orgId", "scope", "userId");

CREATE INDEX IF NOT EXISTS "DispatchView_orgId_scope_role_isRoleDefault_idx"
  ON "DispatchView"("orgId", "scope", "role", "isRoleDefault");

CREATE INDEX IF NOT EXISTS "DispatchView_orgId_createdAt_idx"
  ON "DispatchView"("orgId", "createdAt");

DO $$
BEGIN
  ALTER TABLE "DispatchView"
    ADD CONSTRAINT "DispatchView_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "DispatchException" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "loadId" TEXT NOT NULL,
  "tripId" TEXT,
  "type" VARCHAR(80) NOT NULL,
  "severity" "DispatchExceptionSeverity" NOT NULL DEFAULT 'WARNING',
  "owner" "DispatchExceptionOwner" NOT NULL DEFAULT 'DISPATCH',
  "status" "DispatchExceptionStatus" NOT NULL DEFAULT 'OPEN',
  "title" VARCHAR(180) NOT NULL,
  "detail" TEXT,
  "source" VARCHAR(80),
  "createdById" TEXT,
  "acknowledgedById" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolutionNote" VARCHAR(500),
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DispatchException_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DispatchException_orgId_status_severity_createdAt_idx"
  ON "DispatchException"("orgId", "status", "severity", "createdAt");

CREATE INDEX IF NOT EXISTS "DispatchException_orgId_loadId_status_idx"
  ON "DispatchException"("orgId", "loadId", "status");

CREATE INDEX IF NOT EXISTS "DispatchException_orgId_tripId_status_idx"
  ON "DispatchException"("orgId", "tripId", "status");

DO $$
BEGIN
  ALTER TABLE "DispatchException"
    ADD CONSTRAINT "DispatchException_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "DispatchException"
    ADD CONSTRAINT "DispatchException_loadId_fkey"
    FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "DispatchException"
    ADD CONSTRAINT "DispatchException_tripId_fkey"
    FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
