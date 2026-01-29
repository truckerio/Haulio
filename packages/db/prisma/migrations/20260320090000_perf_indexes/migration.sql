-- Load list filters: orgId + status + createdAt
CREATE INDEX IF NOT EXISTS "Load_orgId_status_createdAt_idx" ON "Load"("orgId", "status", "createdAt");

-- Document queue filters: orgId + type + status
CREATE INDEX IF NOT EXISTS "Document_orgId_type_status_idx" ON "Document"("orgId", "type", "status");
