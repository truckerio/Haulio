-- Phase 1 final-pass role lock:
-- - Remove legacy OPS_MANAGER from canonical Role enum
-- - Preserve behavior by mapping legacy records to HEAD_DISPATCHER

UPDATE "User"
SET "role" = 'HEAD_DISPATCHER'
WHERE "role"::text = 'OPS_MANAGER';

UPDATE "UserInvite"
SET "role" = 'HEAD_DISPATCHER'
WHERE "role"::text = 'OPS_MANAGER';

DO $$
BEGIN
  IF to_regclass('"DispatchView"') IS NOT NULL THEN
    UPDATE "DispatchView"
    SET "role" = 'HEAD_DISPATCHER'
    WHERE "role"::text = 'OPS_MANAGER';
  END IF;
END $$;

UPDATE "Task"
SET "assignedRole" = 'HEAD_DISPATCHER'
WHERE "assignedRole"::text = 'OPS_MANAGER';

UPDATE "OrgSettings"
SET "overrideRoles" = (
  SELECT COALESCE(
    array_agg(
      CASE
        WHEN role_value::text = 'OPS_MANAGER' THEN 'HEAD_DISPATCHER'::"Role"
        ELSE role_value
      END
    ),
    ARRAY[]::"Role"[]
  )
  FROM unnest("overrideRoles") AS role_value
)
WHERE EXISTS (
  SELECT 1
  FROM unnest("overrideRoles") AS role_value
  WHERE role_value::text = 'OPS_MANAGER'
);

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

DO $$
BEGIN
  IF to_regclass('"DispatchView"') IS NOT NULL THEN
    EXECUTE '
      ALTER TABLE "DispatchView"
        ALTER COLUMN "role" TYPE "Role_new"
        USING (
          CASE
            WHEN "role" IS NULL THEN NULL
            ELSE "role"::text::"Role_new"
          END
        )
    ';
  END IF;
END $$;

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
