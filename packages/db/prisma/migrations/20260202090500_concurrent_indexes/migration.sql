-- Prisma migrations run in a transaction; use non-concurrent indexes for demo setup.
CREATE INDEX IF NOT EXISTS "task_open_due_idx"
  ON "Task" ("orgId", "dueAt")
  WHERE "status" IN ('OPEN', 'IN_PROGRESS');

CREATE INDEX IF NOT EXISTS "doc_load_type_status_idx"
  ON "Document" ("loadId", "type", "status");
