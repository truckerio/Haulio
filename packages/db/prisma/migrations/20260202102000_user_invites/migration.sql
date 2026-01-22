ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'IMPORT_COMPLETED';

CREATE TABLE "UserInvite" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),

  CONSTRAINT "UserInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserInvite_tokenHash_key" ON "UserInvite"("tokenHash");
CREATE INDEX "UserInvite_orgId_userId_idx" ON "UserInvite"("orgId", "userId");

ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
