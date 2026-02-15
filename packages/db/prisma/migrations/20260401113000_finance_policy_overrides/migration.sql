ALTER TABLE "OrgSettings"
  ADD COLUMN "requireInvoiceBeforeReady" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowReadinessOverride" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "overrideRoles" "Role"[] NOT NULL DEFAULT ARRAY[]::"Role"[],
  ADD COLUMN "defaultPaymentTermsDays" INTEGER;

UPDATE "OrgSettings"
SET "requireInvoiceBeforeReady" = COALESCE("requireInvoiceBeforeSend", true)
WHERE "requireInvoiceBeforeReady" IS DISTINCT FROM COALESCE("requireInvoiceBeforeSend", true);
