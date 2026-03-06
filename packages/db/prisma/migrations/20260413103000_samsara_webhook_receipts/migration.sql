CREATE TABLE IF NOT EXISTS "SamsaraWebhookReceipt" (
  "id" TEXT NOT NULL,
  "orgId" TEXT,
  "providerType" "TrackingProviderType" NOT NULL DEFAULT 'SAMSARA',
  "requestId" TEXT,
  "eventId" TEXT,
  "eventType" TEXT,
  "orgExternalId" TEXT,
  "signatureTimestamp" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "replay" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "payload" JSONB,
  "headers" JSONB,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SamsaraWebhookReceipt_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "SamsaraWebhookReceipt"
    ADD CONSTRAINT "SamsaraWebhookReceipt_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "SamsaraWebhookReceipt_orgId_providerType_requestId_key"
  ON "SamsaraWebhookReceipt"("orgId", "providerType", "requestId");
CREATE UNIQUE INDEX IF NOT EXISTS "SamsaraWebhookReceipt_orgId_providerType_eventId_key"
  ON "SamsaraWebhookReceipt"("orgId", "providerType", "eventId");
CREATE INDEX IF NOT EXISTS "SamsaraWebhookReceipt_orgId_receivedAt_idx"
  ON "SamsaraWebhookReceipt"("orgId", "receivedAt");
CREATE INDEX IF NOT EXISTS "SamsaraWebhookReceipt_providerType_receivedAt_idx"
  ON "SamsaraWebhookReceipt"("providerType", "receivedAt");
CREATE INDEX IF NOT EXISTS "SamsaraWebhookReceipt_orgId_providerType_verified_replay_receivedAt_idx"
  ON "SamsaraWebhookReceipt"("orgId", "providerType", "verified", "replay", "receivedAt");
