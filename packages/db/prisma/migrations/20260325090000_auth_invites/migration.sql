-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('MICROSOFT', 'GOOGLE', 'EMAIL');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UserInvite" ADD COLUMN "email" CITEXT;
ALTER TABLE "UserInvite" ADD COLUMN "role" "Role";
ALTER TABLE "UserInvite" ADD COLUMN "acceptedAt" TIMESTAMP(3);
ALTER TABLE "UserInvite" ADD COLUMN "invitedByUserId" TEXT;

-- Backfill email/role from existing userId
UPDATE "UserInvite" AS invite
SET "email" = LOWER(u."email"), "role" = u."role"
FROM "User" AS u
WHERE invite."userId" = u."id";

-- Remove invites that could not be backfilled
DELETE FROM "UserInvite" WHERE "email" IS NULL;

-- Drop old FK + column/index
ALTER TABLE "UserInvite" DROP CONSTRAINT IF EXISTS "UserInvite_userId_fkey";
DROP INDEX IF EXISTS "UserInvite_orgId_userId_idx";
ALTER TABLE "UserInvite" DROP COLUMN "userId";

-- Enforce new constraints
ALTER TABLE "UserInvite" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "UserInvite" ALTER COLUMN "role" SET NOT NULL;

-- Create new indexes
DROP INDEX IF EXISTS "UserInvite_tokenHash_key";
CREATE INDEX "UserInvite_orgId_email_idx" ON "UserInvite"("orgId", "email");
CREATE INDEX "UserInvite_tokenHash_idx" ON "UserInvite"("tokenHash");

-- Add invitedBy FK
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_invitedByUserId_fkey"
FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "UserIdentity" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "AuthProvider" NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_provider_providerAccountId_key" ON "UserIdentity"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "UserIdentity_orgId_idx" ON "UserIdentity"("orgId");

-- CreateIndex
CREATE INDEX "UserIdentity_userId_idx" ON "UserIdentity"("userId");

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
