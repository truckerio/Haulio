-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_ACTIVATED', 'OPERATIONAL');

-- AlterTable
ALTER TABLE IF EXISTS "OnboardingState"
ADD COLUMN IF NOT EXISTS "status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_ACTIVATED';
