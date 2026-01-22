ALTER TABLE "Task" ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "Task_orgId_dedupeKey_key" ON "Task"("orgId", "dedupeKey");
