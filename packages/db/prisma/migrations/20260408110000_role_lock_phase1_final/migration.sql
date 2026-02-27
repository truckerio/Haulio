-- Phase 1 final-pass role lock:
-- - Remove legacy OPS_MANAGER from canonical Role enum
-- - Preserve behavior by mapping legacy records to HEAD_DISPATCHER

UPDATE "User"
SET "role" = 'HEAD_DISPATCHER'
WHERE "role"::text = 'OPS_MANAGER';

UPDATE "UserInvite"
SET "role" = 'HEAD_DISPATCHER'
WHERE "role"::text = 'OPS_MANAGER';

UPDATE "DispatchView"
SET "role" = 'HEAD_DISPATCHER'
WHERE "role"::text = 'OPS_MANAGER';

UPDATE "Task"
SET "assignedRole" = 'HEAD_DISPATCHER'
WHERE "assignedRole"::text = 'OPS_MANAGER';

UPDATE "OrgSettings"
SET "overrideRoles" = array_replace("overrideRoles", 'OPS_MANAGER'::"Role", 'HEAD_DISPATCHER'::"Role")
WHERE "overrideRoles" @> ARRAY['OPS_MANAGER'::"Role"];

DO $$
BEGIN
  CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'DISPATCHER', 'HEAD_DISPATCHER', 'BILLING', 'DRIVER', 'SAFETY', 'SUPPORT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "OrgSettings" ALTER COLUMN "overrideRoles" DROP DEFAULT;

ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "Role_new"
  USING ("role"::text::"Role_new");

ALTER TABLE "UserInvite"
  ALTER COLUMN "role" TYPE "Role_new"
  USING ("role"::text::"Role_new");

ALTER TABLE "DispatchView"
  ALTER COLUMN "role" TYPE "Role_new"
  USING (
    CASE
      WHEN "role" IS NULL THEN NULL
      ELSE "role"::text::"Role_new"
    END
  );

ALTER TABLE "Task"
  ALTER COLUMN "assignedRole" TYPE "Role_new"
  USING (
    CASE
      WHEN "assignedRole" IS NULL THEN NULL
      ELSE "assignedRole"::text::"Role_new"
    END
  );

ALTER TABLE "OrgSettings"
  ALTER COLUMN "overrideRoles" TYPE "Role_new"[]
  USING (
    CASE
      WHEN "overrideRoles" IS NULL THEN ARRAY[]::"Role_new"[]
      ELSE "overrideRoles"::text[]::"Role_new"[]
    END
  );

ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";

ALTER TABLE "OrgSettings" ALTER COLUMN "overrideRoles" SET DEFAULT ARRAY[]::"Role"[];
