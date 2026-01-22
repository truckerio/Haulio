-- Enable citext for case-insensitive emails
CREATE EXTENSION IF NOT EXISTS citext;

-- New enums
CREATE TYPE "TaskType" AS ENUM (
  'COLLECT_POD',
  'VERIFY_POD',
  'MISSING_DOC',
  'STOP_DELAY_FOLLOWUP',
  'INVOICE_DISPUTE',
  'PAYMENT_FOLLOWUP',
  'DRIVER_COMPLIANCE_EXPIRING',
  'CUSTOMER_CALLBACK'
);

CREATE TYPE "DocSource" AS ENUM ('DRIVER_UPLOAD', 'OPS_UPLOAD', 'EMAIL_IMPORT', 'API');

CREATE TYPE "Permission" AS ENUM (
  'LOAD_CREATE',
  'LOAD_EDIT',
  'LOAD_ASSIGN',
  'STOP_EDIT',
  'RATE_EDIT',
  'INVOICE_GENERATE',
  'INVOICE_SEND',
  'INVOICE_VOID',
  'DOC_VERIFY',
  'TASK_ASSIGN',
  'ADMIN_SETTINGS',
  'SETTLEMENT_GENERATE',
  'SETTLEMENT_FINALIZE'
);

CREATE TYPE "DriverDocType" AS ENUM ('CDL', 'MED_CARD', 'MVR', 'W9', 'INSURANCE', 'OTHER');

CREATE TYPE "StopStatus" AS ENUM ('PLANNED', 'ARRIVED', 'DEPARTED', 'SKIPPED');

CREATE TYPE "DelayReason" AS ENUM ('SHIPPER_DELAY', 'RECEIVER_DELAY', 'TRAFFIC', 'WEATHER', 'BREAKDOWN', 'OTHER');

CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH');

CREATE TYPE "NotificationEvent" AS ENUM ('TASK_ASSIGNED', 'TASK_DUE_SOON', 'LOAD_ASSIGNED', 'STOP_DELAYED', 'POD_MISSING');

CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'FINALIZED', 'PAID');

-- User changes
ALTER TABLE "User" ALTER COLUMN "email" TYPE CITEXT;
ALTER TABLE "User" ADD COLUMN "permissions" "Permission"[] NOT NULL DEFAULT '{}';
ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "timezone" TEXT;

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_email_key";
CREATE UNIQUE INDEX "User_orgId_email_key" ON "User"("orgId", "email");

-- Session changes
ALTER TABLE "Session" ADD COLUMN "lastUsedAt" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN "revokeReason" TEXT;
ALTER TABLE "Session" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "Session" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "Session" DROP COLUMN IF EXISTS "impersonatedUserId";
ALTER TABLE "Session" DROP COLUMN IF EXISTS "impersonatedById";
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- Driver changes
ALTER TABLE "Driver" ADD COLUMN "licenseState" TEXT;
ALTER TABLE "Driver" ADD COLUMN "licenseExpiresAt" TIMESTAMP(3);
ALTER TABLE "Driver" ADD COLUMN "medCardExpiresAt" TIMESTAMP(3);
ALTER TABLE "Driver" ADD COLUMN "payRatePerMile" NUMERIC(12,2);

-- Load changes
ALTER TABLE "Load" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Load" ADD COLUMN "customerRef" TEXT;
ALTER TABLE "Load" ADD COLUMN "bolNumber" TEXT;
ALTER TABLE "Load" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "Load" ALTER COLUMN "customerName" DROP NOT NULL;
ALTER TABLE "Load" ALTER COLUMN "rate" TYPE NUMERIC(12,2) USING "rate"::numeric(12,2);
ALTER TABLE "Load" DROP CONSTRAINT IF EXISTS "Load_loadNumber_key";
CREATE UNIQUE INDEX "Load_orgId_loadNumber_key" ON "Load"("orgId", "loadNumber");

-- Stop changes
ALTER TABLE "Stop" ADD COLUMN "status" "StopStatus" NOT NULL DEFAULT 'PLANNED';
ALTER TABLE "Stop" ADD COLUMN "phone" TEXT;
ALTER TABLE "Stop" ADD COLUMN "notes" TEXT;
ALTER TABLE "Stop" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Stop" ADD COLUMN "lng" DOUBLE PRECISION;
ALTER TABLE "Stop" ADD COLUMN "delayReason" "DelayReason";
ALTER TABLE "Stop" ADD COLUMN "delayNotes" TEXT;
ALTER TABLE "Stop" ADD COLUMN "detentionMinutes" INTEGER;
ALTER TABLE "Stop" ADD COLUMN "checkInMethod" TEXT;

-- Document changes
ALTER TABLE "Document" ADD COLUMN "stopId" TEXT;
ALTER TABLE "Document" ADD COLUMN "source" "DocSource" NOT NULL DEFAULT 'DRIVER_UPLOAD';
ALTER TABLE "Document" ADD COLUMN "rejectedById" TEXT;
ALTER TABLE "Document" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN "rejectReason" TEXT;
ALTER TABLE "Document" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- Event changes
ALTER TABLE "Event" ADD COLUMN "stopId" TEXT;
ALTER TABLE "Event" ADD COLUMN "legId" TEXT;
ALTER TABLE "Event" ADD COLUMN "docId" TEXT;
ALTER TABLE "Event" ADD COLUMN "taskId" TEXT;
ALTER TABLE "Event" ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "Event" ADD COLUMN "customerId" TEXT;

-- Task changes
ALTER TABLE "Task" ADD COLUMN "stopId" TEXT;
ALTER TABLE "Task" ADD COLUMN "docId" TEXT;
ALTER TABLE "Task" ADD COLUMN "driverId" TEXT;
ALTER TABLE "Task" ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "Task" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Task" ADD COLUMN "type" "TaskType";
ALTER TABLE "Task" ADD COLUMN "assignedToId" TEXT;
ALTER TABLE "Task" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Task" ADD COLUMN "completedById" TEXT;

-- OrgSettings changes
ALTER TABLE "OrgSettings" ADD COLUMN "invoiceTermsDays" INTEGER;
ALTER TABLE "OrgSettings" ADD COLUMN "timezone" TEXT;
ALTER TABLE "OrgSettings" ADD COLUMN "pickupFreeDetentionMinutes" INTEGER NOT NULL DEFAULT 120;
ALTER TABLE "OrgSettings" ADD COLUMN "deliveryFreeDetentionMinutes" INTEGER NOT NULL DEFAULT 120;
ALTER TABLE "OrgSettings" ADD COLUMN "detentionRatePerHour" NUMERIC(12,2);
ALTER TABLE "OrgSettings" ALTER COLUMN "storageRatePerDay" TYPE NUMERIC(12,2) USING "storageRatePerDay"::numeric(12,2);
ALTER TABLE "OrgSettings" ALTER COLUMN "driverRatePerMile" TYPE NUMERIC(12,2) USING "driverRatePerMile"::numeric(12,2);

-- Convert required docs to enum arrays with mapping
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT value
    FROM "OrgSettings", unnest("requiredDocs") AS value
    WHERE upper(value::text) NOT IN ('POD', 'RATECON', 'BOL', 'LUMPER', 'SCALE', 'DETENTION')
  LOOP
    RAISE NOTICE 'Unknown requiredDocs value: %', rec.value;
  END LOOP;
END $$;

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT value
    FROM "OrgSettings", unnest("requiredDriverDocs") AS value
    WHERE upper(replace(replace(value::text, ' ', ''), '_', '')) NOT IN ('CDL', 'MEDCARD', 'MVR', 'W9', 'INSURANCE')
  LOOP
    RAISE NOTICE 'Unknown requiredDriverDocs value: %', rec.value;
  END LOOP;
END $$;

ALTER TABLE "OrgSettings" ADD COLUMN "requiredDocs_new" "DocType"[] NOT NULL DEFAULT ARRAY[]::"DocType"[];
ALTER TABLE "OrgSettings" ADD COLUMN "requiredDriverDocs_new" "DriverDocType"[] NOT NULL DEFAULT ARRAY[]::"DriverDocType"[];

UPDATE "OrgSettings"
SET "requiredDocs_new" = COALESCE((
  SELECT ARRAY_AGG(
    CASE
      WHEN upper(value) = 'POD' THEN 'POD'::"DocType"
      WHEN upper(value) = 'RATECON' THEN 'RATECON'::"DocType"
      WHEN upper(value) = 'BOL' THEN 'BOL'::"DocType"
      WHEN upper(value) = 'LUMPER' THEN 'LUMPER'::"DocType"
      WHEN upper(value) = 'SCALE' THEN 'SCALE'::"DocType"
      WHEN upper(value) = 'DETENTION' THEN 'DETENTION'::"DocType"
      ELSE 'OTHER'::"DocType"
    END
  )
  FROM unnest("requiredDocs") AS value
), ARRAY[]::"DocType"[]);

UPDATE "OrgSettings"
SET "requiredDriverDocs_new" = COALESCE((
  SELECT ARRAY_AGG(
    CASE
      WHEN upper(replace(value, ' ', '')) = 'CDL' THEN 'CDL'::"DriverDocType"
      WHEN upper(replace(value, '_', '')) = 'MEDCARD' THEN 'MED_CARD'::"DriverDocType"
      WHEN upper(replace(value, '_', '')) = 'MED_CARD' THEN 'MED_CARD'::"DriverDocType"
      WHEN upper(replace(value, ' ', '')) = 'MVR' THEN 'MVR'::"DriverDocType"
      WHEN upper(replace(value, ' ', '')) = 'W9' THEN 'W9'::"DriverDocType"
      WHEN upper(replace(value, ' ', '')) = 'INSURANCE' THEN 'INSURANCE'::"DriverDocType"
      ELSE 'OTHER'::"DriverDocType"
    END
  )
  FROM unnest("requiredDriverDocs") AS value
), ARRAY[]::"DriverDocType"[]);

ALTER TABLE "OrgSettings" DROP COLUMN "requiredDocs";
ALTER TABLE "OrgSettings" DROP COLUMN "requiredDriverDocs";
ALTER TABLE "OrgSettings" RENAME COLUMN "requiredDocs_new" TO "requiredDocs";
ALTER TABLE "OrgSettings" RENAME COLUMN "requiredDriverDocs_new" TO "requiredDriverDocs";

-- StorageRecord money types
ALTER TABLE "StorageRecord" ALTER COLUMN "ratePerDay" TYPE NUMERIC(12,2) USING "ratePerDay"::numeric(12,2);
ALTER TABLE "StorageRecord" ALTER COLUMN "suggestedCharge" TYPE NUMERIC(12,2) USING "suggestedCharge"::numeric(12,2);

-- Invoice changes
ALTER TABLE "Invoice" ALTER COLUMN "totalAmount" TYPE NUMERIC(12,2) USING "totalAmount"::numeric(12,2);
ALTER TABLE "Invoice" ADD COLUMN "disputeReason" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "disputeNotes" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "paymentRef" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "shortPaidAmount" NUMERIC(12,2);
ALTER TABLE "Invoice" ADD COLUMN "voidedAt" TIMESTAMP(3);

-- Customer table
CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "billingEmail" TEXT,
  "billingPhone" TEXT,
  "remitToAddress" TEXT,
  "termsDays" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Customer_orgId_name_key" ON "Customer"("orgId", "name");
CREATE INDEX "Customer_orgId_name_idx" ON "Customer"("orgId", "name");

-- Invoice line items
CREATE TABLE "InvoiceLineItem" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "quantity" NUMERIC(12,2),
  "rate" NUMERIC(12,2),
  "amount" NUMERIC(12,2) NOT NULL,

  CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvoiceLineItem_invoiceId_idx" ON "InvoiceLineItem"("invoiceId");

-- Settlements
CREATE TABLE "Settlement" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
  "gross" NUMERIC(12,2),
  "deductions" NUMERIC(12,2),
  "net" NUMERIC(12,2),
  "finalizedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Settlement_orgId_driverId_periodStart_periodEnd_key"
  ON "Settlement"("orgId", "driverId", "periodStart", "periodEnd");
CREATE INDEX "Settlement_orgId_periodEnd_idx" ON "Settlement"("orgId", "periodEnd");

CREATE TABLE "SettlementItem" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "loadId" TEXT,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "amount" NUMERIC(12,2) NOT NULL,

  CONSTRAINT "SettlementItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SettlementItem_settlementId_idx" ON "SettlementItem"("settlementId");

-- Notification prefs
CREATE TABLE "UserNotificationPref" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "event" "NotificationEvent" NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT "UserNotificationPref_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserNotificationPref_userId_event_channel_key" ON "UserNotificationPref"("userId", "event", "channel");
CREATE INDEX "UserNotificationPref_userId_idx" ON "UserNotificationPref"("userId");

-- Backfill stop status from timestamps
UPDATE "Stop"
SET "status" = CASE
  WHEN "departedAt" IS NOT NULL THEN 'DEPARTED'::"StopStatus"
  WHEN "arrivedAt" IS NOT NULL THEN 'ARRIVED'::"StopStatus"
  ELSE 'PLANNED'::"StopStatus"
END;

-- Backfill document source
UPDATE "Document" d
SET "source" = CASE
  WHEN d."uploadedById" IS NULL THEN 'EMAIL_IMPORT'::"DocSource"
  WHEN EXISTS (SELECT 1 FROM "Driver" dr WHERE dr."userId" = d."uploadedById") THEN 'DRIVER_UPLOAD'::"DocSource"
  WHEN EXISTS (SELECT 1 FROM "User" u WHERE u."id" = d."uploadedById" AND u."role" = 'DRIVER') THEN 'DRIVER_UPLOAD'::"DocSource"
  ELSE 'OPS_UPLOAD'::"DocSource"
END;

-- Backfill task type from title
UPDATE "Task"
SET "type" = CASE
  WHEN "title" ILIKE '%collect%' AND "title" ILIKE '%pod%' THEN 'COLLECT_POD'::"TaskType"
  WHEN "title" ILIKE '%verify%' AND "title" ILIKE '%pod%' THEN 'VERIFY_POD'::"TaskType"
  WHEN "title" ILIKE '%missing%' AND "title" ILIKE '%pod%' THEN 'MISSING_DOC'::"TaskType"
  WHEN "title" ILIKE '%pod%' THEN 'COLLECT_POD'::"TaskType"
  ELSE 'CUSTOMER_CALLBACK'::"TaskType"
END;

-- Customer backfill from load customerName
INSERT INTO "Customer" ("id", "orgId", "name", "createdAt")
SELECT DISTINCT
  concat('cust_', md5(random()::text || clock_timestamp()::text)),
  "orgId",
  "customerName",
  CURRENT_TIMESTAMP
FROM "Load"
WHERE "customerName" IS NOT NULL
ON CONFLICT ("orgId", "name") DO NOTHING;

UPDATE "Load" l
SET "customerId" = c."id"
FROM "Customer" c
WHERE l."customerId" IS NULL
  AND l."customerName" IS NOT NULL
  AND c."orgId" = l."orgId"
  AND c."name" = l."customerName";

-- Lock invoiced loads
UPDATE "Load"
SET "lockedAt" = NOW()
WHERE "status" = 'INVOICED' AND "lockedAt" IS NULL;

-- Enforce NOT NULL on task type
ALTER TABLE "Task" ALTER COLUMN "type" SET NOT NULL;

-- Indexes for query patterns
CREATE INDEX "Task_orgId_status_dueAt_idx" ON "Task"("orgId", "status", "dueAt");
CREATE INDEX "Task_orgId_type_idx" ON "Task"("orgId", "type");
CREATE INDEX "Document_stopId_idx" ON "Document"("stopId");
CREATE INDEX "Event_loadId_createdAt_idx" ON "Event"("loadId", "createdAt");
CREATE INDEX "Event_stopId_createdAt_idx" ON "Event"("stopId", "createdAt");

-- Foreign keys for new relations
ALTER TABLE "Load" ADD CONSTRAINT "Load_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Document" ADD CONSTRAINT "Document_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Event" ADD CONSTRAINT "Event_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_legId_fkey" FOREIGN KEY ("legId") REFERENCES "LoadLeg"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Task" ADD CONSTRAINT "Task_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserNotificationPref" ADD CONSTRAINT "UserNotificationPref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
