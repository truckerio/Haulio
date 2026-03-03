ALTER TABLE "OrgSettings"
ADD COLUMN IF NOT EXISTS "inboundRateconEmailEnabled" BOOLEAN NOT NULL DEFAULT false;
