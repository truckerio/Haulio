-- Ensure existing users remain active and have a non-null password hash.
UPDATE "User" SET "status" = 'ACTIVE' WHERE "status" IS NULL;
UPDATE "User" SET "passwordHash" = '$2a$10$BrXReZNqZPWimH18IPgSUeLF1s3SXc/.CS/QL2UkFF4dIF8i2nXve' WHERE "passwordHash" IS NULL;

ALTER TABLE "User"
  ALTER COLUMN "passwordHash" SET NOT NULL,
  ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaTotpSecretEncrypted" TEXT,
  ADD COLUMN "mfaRecoveryCodesHash" TEXT,
  ADD COLUMN "mfaEnforced" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "MfaChallengePurpose" AS ENUM ('LOGIN', 'SETUP');

CREATE TABLE "MfaChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "purpose" "MfaChallengePurpose" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MfaChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MfaChallenge_tokenHash_idx" ON "MfaChallenge"("tokenHash");
CREATE INDEX "MfaChallenge_userId_idx" ON "MfaChallenge"("userId");

ALTER TABLE "MfaChallenge" ADD CONSTRAINT "MfaChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
