-- Add business type to loads (company vs broker)
CREATE TYPE "LoadBusinessType" AS ENUM ('COMPANY', 'BROKER');

ALTER TABLE "Load" ADD COLUMN "businessType" "LoadBusinessType";
