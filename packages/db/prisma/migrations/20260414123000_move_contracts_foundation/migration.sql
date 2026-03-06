DO $$
BEGIN
  CREATE TYPE "MoveContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "MoveContractTemplate" AS ENUM ('CPM', 'FLAT_TRIP', 'REVENUE_SHARE', 'HOURLY', 'HYBRID_BEST_OF');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "MoveContract" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "MoveContractStatus" NOT NULL DEFAULT 'DRAFT',
  "template" "MoveContractTemplate" NOT NULL,
  "description" TEXT,
  "currentVersion" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MoveContract_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MoveContractVersion" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "scopeJson" JSONB NOT NULL,
  "rulesJson" JSONB NOT NULL,
  "previewSampleJson" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MoveContractVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MoveContract_orgId_code_key"
  ON "MoveContract"("orgId", "code");
CREATE INDEX IF NOT EXISTS "MoveContract_orgId_status_template_idx"
  ON "MoveContract"("orgId", "status", "template");
CREATE INDEX IF NOT EXISTS "MoveContract_orgId_createdAt_idx"
  ON "MoveContract"("orgId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "MoveContractVersion_contractId_version_key"
  ON "MoveContractVersion"("contractId", "version");
CREATE INDEX IF NOT EXISTS "MoveContractVersion_orgId_contractId_effectiveFrom_idx"
  ON "MoveContractVersion"("orgId", "contractId", "effectiveFrom");
CREATE INDEX IF NOT EXISTS "MoveContractVersion_orgId_effectiveFrom_effectiveTo_idx"
  ON "MoveContractVersion"("orgId", "effectiveFrom", "effectiveTo");

DO $$
BEGIN
  ALTER TABLE "MoveContract"
    ADD CONSTRAINT "MoveContract_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "MoveContract"
    ADD CONSTRAINT "MoveContract_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "MoveContractVersion"
    ADD CONSTRAINT "MoveContractVersion_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "MoveContractVersion"
    ADD CONSTRAINT "MoveContractVersion_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "MoveContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "MoveContractVersion"
    ADD CONSTRAINT "MoveContractVersion_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
