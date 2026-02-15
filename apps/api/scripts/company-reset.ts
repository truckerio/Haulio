import "dotenv/config";
import bcrypt from "bcryptjs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { prisma, Prisma, DocType, DriverDocType, OperatingEntityType, Role } from "@truckerio/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../..");

const COMPANY_NAME = process.env.COMPANY_NAME || "New Company";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@newco.test";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me";
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin";
const ADMIN_PHONE = process.env.ADMIN_PHONE || null;
const COMPANY_TIMEZONE = process.env.COMPANY_TIMEZONE || "America/Chicago";
const COMPANY_REMIT_TO = process.env.COMPANY_REMIT_TO || `${COMPANY_NAME}\n123 Main St\nYour City, ST 00000`;
const INVOICE_PREFIX = process.env.INVOICE_PREFIX || "INV-";
const RESET_UPLOADS = (process.env.RESET_UPLOADS || "true").toLowerCase() !== "false";

const DEFAULT_REQUIRED_DOCS: DocType[] = [DocType.POD];
const DEFAULT_DRIVER_DOCS: DriverDocType[] = [DriverDocType.CDL, DriverDocType.MED_CARD];

function parseEnumList<T extends string>(value: string | undefined, fallback: T[]): T[] {
  if (!value) return fallback;
  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean) as T[];
  return parsed.length > 0 ? parsed : fallback;
}

async function resetUploads() {
  if (!RESET_UPLOADS) return;
  const uploadsDir = path.join(ROOT_DIR, "uploads");
  await fs.rm(uploadsDir, { recursive: true, force: true });
  await fs.mkdir(path.join(uploadsDir, "docs"), { recursive: true });
  await fs.mkdir(path.join(uploadsDir, "invoices"), { recursive: true });
  await fs.mkdir(path.join(uploadsDir, "packets"), { recursive: true });
}

async function wipeDatabase() {
  // Keep migration history intact but clear all application data safely across schema changes.
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE
      tables text;
    BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
      INTO tables
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '_prisma_migrations';

      IF tables IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
      END IF;
    END $$;
  `);
}

async function main() {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.trim().length < 6) {
    throw new Error("ADMIN_PASSWORD must be set and at least 6 characters.");
  }

  const requiredDocs = parseEnumList<DocType>(process.env.REQUIRED_DOCS, DEFAULT_REQUIRED_DOCS);
  const requiredDriverDocs = parseEnumList<DriverDocType>(process.env.REQUIRED_DRIVER_DOCS, DEFAULT_DRIVER_DOCS);

  await wipeDatabase();
  await resetUploads();

  const org = await prisma.organization.create({ data: { name: COMPANY_NAME } });
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await prisma.user.create({
    data: {
      orgId: org.id,
      email: ADMIN_EMAIL,
      passwordHash,
      role: Role.ADMIN,
      name: ADMIN_NAME,
      phone: ADMIN_PHONE ?? undefined,
      timezone: COMPANY_TIMEZONE,
    },
  });

  await prisma.orgSettings.create({
    data: {
      orgId: org.id,
      companyDisplayName: COMPANY_NAME,
      remitToAddress: COMPANY_REMIT_TO,
      invoiceTerms: "Net 30",
      invoiceTermsDays: 30,
      invoiceFooter: "Thank you for your business.",
      invoicePrefix: INVOICE_PREFIX,
      nextInvoiceNumber: 1000,
      podRequireSignature: true,
      podRequirePrintedName: true,
      podRequireDeliveryDate: true,
      podMinPages: 1,
      requiredDocs,
      requiredDriverDocs,
      collectPodDueMinutes: 30,
      missingPodAfterMinutes: 120,
      reminderFrequencyMinutes: 20,
      timezone: COMPANY_TIMEZONE,
      freeStorageMinutes: 120,
      storageRatePerDay: new Prisma.Decimal("150.00"),
      pickupFreeDetentionMinutes: 120,
      deliveryFreeDetentionMinutes: 120,
      detentionRatePerHour: new Prisma.Decimal("75.00"),
      driverRatePerMile: new Prisma.Decimal("0.65"),
    },
  });

  await prisma.operatingEntity.create({
    data: {
      orgId: org.id,
      name: COMPANY_NAME,
      type: OperatingEntityType.CARRIER,
      addressLine1: COMPANY_REMIT_TO,
      remitToName: COMPANY_NAME,
      remitToAddressLine1: COMPANY_REMIT_TO,
      isDefault: true,
    },
  });

  const creds = `# New Company Credentials

- Company: ${COMPANY_NAME}
- Admin: ${ADMIN_EMAIL}
- Password: ${ADMIN_PASSWORD}
- Web: ${process.env.WEB_ORIGIN || "http://localhost:3000"}
- API: ${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000"}
- Uploads cleared: ${RESET_UPLOADS ? "yes" : "no"}
`;

  await fs.writeFile(path.join(ROOT_DIR, "NEW_COMPANY_CREDENTIALS.md"), creds, "utf8");
  console.log("Company reset complete.");
  console.log(creds);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
