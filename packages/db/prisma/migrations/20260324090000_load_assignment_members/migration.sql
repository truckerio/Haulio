-- CreateEnum
CREATE TYPE "LoadAssignmentRole" AS ENUM ('PRIMARY', 'CO_DRIVER');

-- CreateTable
CREATE TABLE "LoadAssignmentMember" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "role" "LoadAssignmentRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoadAssignmentMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoadAssignmentMember_loadId_role_key" ON "LoadAssignmentMember"("loadId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "LoadAssignmentMember_loadId_driverId_key" ON "LoadAssignmentMember"("loadId", "driverId");

-- CreateIndex
CREATE INDEX "LoadAssignmentMember_driverId_idx" ON "LoadAssignmentMember"("driverId");

-- AddForeignKey
ALTER TABLE "LoadAssignmentMember" ADD CONSTRAINT "LoadAssignmentMember_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadAssignmentMember" ADD CONSTRAINT "LoadAssignmentMember_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
