import "dotenv/config";
import bcrypt from "bcryptjs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { prisma, Prisma, Role, DriverStatus, TruckStatus, TrailerStatus, TrailerType } from "@truckerio/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../..");

const DEMO_ORG_NAME = process.env.DEMO_ORG_NAME || "Demo Org A";
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL || "admin@demo.test";
const BILLING_EMAIL = process.env.DEMO_BILLING_EMAIL || "billing@demo.test";
const DISPATCH_EMAIL = process.env.DEMO_DISPATCH_EMAIL || "dispatch@demo.test";
const PASSWORD = process.env.DEMO_PASSWORD || "demo1234";

const DRIVER_COUNT = Number(process.env.DEMO_DRIVER_COUNT || 5);
const LOAD_COUNT = Number(process.env.DEMO_LOAD_COUNT || 5);

const VIN_POOL = [
  "1HGCM82633A004352",
  "1FTFW1EF1EFA00001",
  "1GCHK29U24E000002",
  "3C6UR5CL2FG000003",
  "2FTRX18W1XCA00004",
  "1M8GDM9AXKP042788",
  "2G1WF52E259000005",
  "1N6AD07U48C000006",
  "5FNYF4H92EB000007",
  "3D7KU28C03G000008",
];

async function ensureOrg() {
  const admin = await prisma.user.findFirst({ where: { email: ADMIN_EMAIL } });
  if (admin) {
    const org = await prisma.organization.findFirst({ where: { id: admin.orgId } });
    if (org) return { org, admin };
  }
  let org = await prisma.organization.findFirst({ where: { name: DEMO_ORG_NAME } });
  if (!org) {
    org = await prisma.organization.create({ data: { name: DEMO_ORG_NAME } });
  }
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const adminUser = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: ADMIN_EMAIL } },
    update: { role: Role.ADMIN, isActive: true },
    create: { orgId: org.id, email: ADMIN_EMAIL, role: Role.ADMIN, name: "Demo Admin", passwordHash },
  });
  return { org, admin: adminUser };
}

async function ensureCoreUsers(orgId: string, passwordHash: string) {
  await prisma.user.upsert({
    where: { orgId_email: { orgId, email: BILLING_EMAIL } },
    update: { role: Role.BILLING, isActive: true },
    create: { orgId, email: BILLING_EMAIL, role: Role.BILLING, name: "Demo Billing", passwordHash },
  });
  await prisma.user.upsert({
    where: { orgId_email: { orgId, email: DISPATCH_EMAIL } },
    update: { role: Role.DISPATCHER, isActive: true },
    create: { orgId, email: DISPATCH_EMAIL, role: Role.DISPATCHER, name: "Demo Dispatch", passwordHash },
  });
}

async function ensureSettings(orgId: string, orgName: string) {
  await prisma.orgSettings.upsert({
    where: { orgId },
    update: {},
    create: {
      orgId,
      companyDisplayName: orgName,
      remitToAddress: `${orgName}\n123 Demo Lane\nAustin, TX 78701`,
      invoiceTerms: "Net 30",
      invoiceTermsDays: 30,
      invoiceFooter: "Thanks for your business.",
      invoicePrefix: "DEMO-",
      nextInvoiceNumber: 1000,
      podRequireSignature: true,
      podRequirePrintedName: true,
      podRequireDeliveryDate: true,
      podMinPages: 1,
      requiredDocs: ["POD"],
      requiredDriverDocs: ["CDL"],
      collectPodDueMinutes: 30,
      missingPodAfterMinutes: 120,
      reminderFrequencyMinutes: 20,
      timezone: "America/Chicago",
      freeStorageMinutes: 120,
      storageRatePerDay: new Prisma.Decimal("150.00"),
      pickupFreeDetentionMinutes: 120,
      deliveryFreeDetentionMinutes: 120,
      detentionRatePerHour: new Prisma.Decimal("75.00"),
      driverRatePerMile: new Prisma.Decimal("0.65"),
    },
  });
  const existing = await prisma.operatingEntity.findFirst({ where: { orgId, isDefault: true } });
  if (!existing) {
    await prisma.operatingEntity.create({
      data: {
        orgId,
        name: orgName,
        type: "CARRIER",
        remitToName: orgName,
        remitToAddressLine1: `${orgName}\n123 Demo Lane\nAustin, TX 78701`,
        isDefault: true,
      },
    });
  }
}

async function wipeOrgData(orgId: string) {
  const users = await prisma.user.findMany({ where: { orgId }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userNotificationPref.deleteMany({ where: { userId: { in: userIds } } });

  await prisma.locationPing.deleteMany({ where: { orgId } });
  await prisma.loadTrackingSession.deleteMany({ where: { orgId } });
  await prisma.truckTelematicsMapping.deleteMany({ where: { orgId } });
  await prisma.trackingIntegration.deleteMany({ where: { orgId } });
  await prisma.learningExample.deleteMany({ where: { orgId } });
  await prisma.learnedMapping.deleteMany({ where: { orgId } });
  await prisma.loadConfirmationLearningExample.deleteMany({ where: { orgId } });
  await prisma.loadConfirmationExtractEvent.deleteMany({ where: { orgId } });
  await prisma.loadConfirmationDocument.deleteMany({ where: { orgId } });
  await prisma.document.deleteMany({ where: { orgId } });
  await prisma.event.deleteMany({ where: { orgId } });
  await prisma.task.deleteMany({ where: { orgId } });
  await prisma.storageRecord.deleteMany({ where: { orgId } });
  await prisma.invoiceLineItem.deleteMany({ where: { invoice: { orgId } } });
  await prisma.invoice.deleteMany({ where: { orgId } });
  await prisma.settlementItem.deleteMany({ where: { settlement: { orgId } } });
  await prisma.settlement.deleteMany({ where: { orgId } });
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.trailerManifestItem.deleteMany({ where: { manifest: { orgId } } });
  await prisma.trailerManifest.deleteMany({ where: { orgId } });
  await prisma.loadLeg.deleteMany({ where: { orgId } });
  await prisma.stop.deleteMany({ where: { orgId } });
  await prisma.load.deleteMany({ where: { orgId } });
  await prisma.driver.deleteMany({ where: { orgId } });
  await prisma.truck.deleteMany({ where: { orgId } });
  await prisma.trailer.deleteMany({ where: { orgId } });
  await prisma.customer.deleteMany({ where: { orgId } });
  await prisma.user.deleteMany({ where: { orgId, role: Role.DRIVER } });
}

async function seedDrivers(orgId: string, passwordHash: string) {
  const drivers: Array<{ id: string; userId: string; name: string }> = [];
  for (let i = 1; i <= DRIVER_COUNT; i += 1) {
    const email = `driver${i}@demo.test`;
    const name = `Demo Driver ${i}`;
    const user = await prisma.user.upsert({
      where: { orgId_email: { orgId, email } },
      update: { role: Role.DRIVER, isActive: true, name },
      create: { orgId, email, role: Role.DRIVER, name, passwordHash },
    });
    const driver = await prisma.driver.create({
      data: {
        orgId,
        userId: user.id,
        name,
        phone: `5125550${String(i).padStart(3, "0")}`,
        license: `TXD${String(1000 + i)}`,
        licenseState: "TX",
        payRatePerMile: new Prisma.Decimal("0.65"),
        status: DriverStatus.AVAILABLE,
      },
    });
    drivers.push({ id: driver.id, userId: user.id, name });
  }
  return drivers;
}

async function seedFleet(orgId: string) {
  const trucks = [];
  const trailers = [];
  for (let i = 1; i <= DRIVER_COUNT; i += 1) {
    const truck = await prisma.truck.create({
      data: {
        orgId,
        unit: `DEMO-T${i}`,
        vin: VIN_POOL[i - 1] ?? VIN_POOL[0],
        plate: `TX-DEMO-${i}`,
        plateState: "TX",
        status: TruckStatus.AVAILABLE,
        active: true,
      },
    });
    const trailer = await prisma.trailer.create({
      data: {
        orgId,
        unit: `DEMO-TR${i}`,
        type: TrailerType.DRY_VAN,
        plate: `TX-TRL-${i}`,
        plateState: "TX",
        status: TrailerStatus.AVAILABLE,
        active: true,
      },
    });
    trucks.push(truck);
    trailers.push(trailer);
  }
  return { trucks, trailers };
}

async function seedLoads(orgId: string, operatingEntityId: string, drivers: any[], trucks: any[], trailers: any[]) {
  const customer = await prisma.customer.create({
    data: {
      orgId,
      name: "Demo Customer",
      billingEmail: "billing@customer.demo",
      termsDays: 30,
    },
  });
  const now = Date.now();
  for (let i = 0; i < LOAD_COUNT; i += 1) {
    const loadNumber = `DEMO-${2001 + i}`;
    const load = await prisma.load.create({
      data: {
        orgId,
        loadNumber,
        loadType: "COMPANY",
        operatingEntityId,
        customerId: customer.id,
        customerName: customer.name,
        rate: new Prisma.Decimal("1250.00"),
        miles: 450,
        assignedDriverId: drivers[i % drivers.length].id,
        truckId: trucks[i % trucks.length].id,
        trailerId: trailers[i % trailers.length].id,
        assignedDriverAt: new Date(),
        assignedTruckAt: new Date(),
        assignedTrailerAt: new Date(),
        status: "ASSIGNED",
      },
    });
    await prisma.stop.create({
      data: {
        orgId,
        loadId: load.id,
        type: "PICKUP",
        name: "Demo Shipper",
        address: "100 Market St",
        city: "Austin",
        state: "TX",
        zip: "78701",
        appointmentStart: new Date(now + (i + 1) * 60 * 60 * 1000),
        appointmentEnd: new Date(now + (i + 2) * 60 * 60 * 1000),
        sequence: 1,
      },
    });
    await prisma.stop.create({
      data: {
        orgId,
        loadId: load.id,
        type: "DELIVERY",
        name: "Demo Receiver",
        address: "200 Warehouse Rd",
        city: "Dallas",
        state: "TX",
        zip: "75201",
        appointmentStart: new Date(now + (i + 6) * 60 * 60 * 1000),
        appointmentEnd: new Date(now + (i + 7) * 60 * 60 * 1000),
        sequence: 2,
      },
    });
  }
}

async function main() {
  if (!PASSWORD || PASSWORD.trim().length < 6) {
    throw new Error("DEMO_PASSWORD must be set and at least 6 characters.");
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const { org, admin } = await ensureOrg();
  await ensureCoreUsers(org.id, passwordHash);
  await ensureSettings(org.id, org.name);

  await wipeOrgData(org.id);

  const operatingEntity = await prisma.operatingEntity.findFirst({ where: { orgId: org.id, isDefault: true } });
  if (!operatingEntity) {
    throw new Error("Missing operating entity");
  }

  const drivers = await seedDrivers(org.id, passwordHash);
  const { trucks, trailers } = await seedFleet(org.id);
  await seedLoads(org.id, operatingEntity.id, drivers, trucks, trailers);

  const creds = `# Demo Credentials

## Demo Org
- Admin: ${ADMIN_EMAIL} / ${PASSWORD}
- Billing: ${BILLING_EMAIL} / ${PASSWORD}
- Dispatcher: ${DISPATCH_EMAIL} / ${PASSWORD}
- Drivers: driver1@demo.test .. driver${DRIVER_COUNT}@demo.test / ${PASSWORD}

## URLs
- Web: ${process.env.WEB_ORIGIN || "http://localhost:3000"}
- API: ${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000"}
`;

  await fs.writeFile(path.join(ROOT_DIR, "DEMO_CREDENTIALS.md"), creds, "utf8");
  console.log("Demo refresh complete.");
  console.log(creds);
  console.log(`Admin org: ${admin.orgId}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
