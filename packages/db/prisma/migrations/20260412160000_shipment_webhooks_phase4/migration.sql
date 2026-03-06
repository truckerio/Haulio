DO $$
BEGIN
  CREATE TYPE "ShipmentWebhookEventType" AS ENUM (
    'SHIPMENT_CREATED',
    'SHIPMENT_EXECUTION_UPDATED',
    'SHIPMENT_COMMERCIAL_UPDATED',
    'SHIPMENT_HANDOFF_QUEUED',
    'SHIPMENT_SPLIT',
    'SHIPMENT_MERGED',
    'SHIPMENT_TEST'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ShipmentWebhookDeliveryStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'DELIVERED',
    'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "OrgSettings"
  ADD COLUMN IF NOT EXISTS "shipmentWebhooksEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "shipmentWebhooksVersion" TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS "shipmentProjectionLagEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "shipmentProjectionLagSeconds" INTEGER NOT NULL DEFAULT 120;

CREATE TABLE IF NOT EXISTS "ShipmentWebhookSubscription" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "version" TEXT NOT NULL DEFAULT 'v1',
  "endpointUrl" TEXT NOT NULL,
  "signingSecret" TEXT NOT NULL,
  "eventTypes" "ShipmentWebhookEventType"[] NOT NULL DEFAULT ARRAY[]::"ShipmentWebhookEventType"[],
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "timeoutMs" INTEGER NOT NULL DEFAULT 8000,
  "lastError" TEXT,
  "lastDeliveryAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipmentWebhookSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ShipmentWebhookDelivery" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" "ShipmentWebhookEventType" NOT NULL,
  "eventVersion" TEXT NOT NULL DEFAULT 'v1',
  "payload" JSONB NOT NULL,
  "status" "ShipmentWebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastHttpStatus" INTEGER,
  "lastError" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipmentWebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShipmentWebhookSubscription_orgId_endpointUrl_version_key"
  ON "ShipmentWebhookSubscription"("orgId", "endpointUrl", "version");
CREATE INDEX IF NOT EXISTS "ShipmentWebhookSubscription_orgId_enabled_updatedAt_idx"
  ON "ShipmentWebhookSubscription"("orgId", "enabled", "updatedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "ShipmentWebhookDelivery_subscriptionId_eventId_key"
  ON "ShipmentWebhookDelivery"("subscriptionId", "eventId");
CREATE INDEX IF NOT EXISTS "ShipmentWebhookDelivery_status_nextAttemptAt_createdAt_idx"
  ON "ShipmentWebhookDelivery"("status", "nextAttemptAt", "createdAt");
CREATE INDEX IF NOT EXISTS "ShipmentWebhookDelivery_orgId_status_nextAttemptAt_idx"
  ON "ShipmentWebhookDelivery"("orgId", "status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "ShipmentWebhookDelivery_orgId_eventType_createdAt_idx"
  ON "ShipmentWebhookDelivery"("orgId", "eventType", "createdAt");

DO $$
BEGIN
  ALTER TABLE "ShipmentWebhookSubscription"
    ADD CONSTRAINT "ShipmentWebhookSubscription_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ShipmentWebhookDelivery"
    ADD CONSTRAINT "ShipmentWebhookDelivery_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ShipmentWebhookDelivery"
    ADD CONSTRAINT "ShipmentWebhookDelivery_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "ShipmentWebhookSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
