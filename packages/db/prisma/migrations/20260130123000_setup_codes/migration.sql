-- CreateTable
CREATE TABLE "SetupCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "orgId" TEXT,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetupCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SetupCode_code_key" ON "SetupCode"("code");

-- CreateIndex
CREATE INDEX "SetupCode_consumedAt_idx" ON "SetupCode"("consumedAt");

-- AddForeignKey
ALTER TABLE "SetupCode" ADD CONSTRAINT "SetupCode_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
