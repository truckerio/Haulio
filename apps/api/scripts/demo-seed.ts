import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { prisma, Prisma } from "@truckerio/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../..");

const ORG_A_NAME = "Demo Org A";
const ORG_B_NAME = "Demo Org B";
const PASSWORD = "demo1234";

async function findOrCreateOrg(name: string) {
  const existing = await prisma.organization.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.organization.create({ data: { name } });
}

async function upsertSettings(orgId: string) {
  return prisma.orgSettings.upsert({
    where: { orgId },
    update: {},
    create: {
      orgId,
      companyDisplayName: "Trucker.io Demo",
      remitToAddress: "123 Demo Lane\nAustin, TX 78701",
      invoiceTerms: "Net 30",
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
      missingPodAfterMinutes: 60,
      reminderFrequencyMinutes: 15,
      timezone: "America/Chicago",
      freeStorageMinutes: 120,
      storageRatePerDay: new Prisma.Decimal("150.00"),
      pickupFreeDetentionMinutes: 120,
      deliveryFreeDetentionMinutes: 120,
      detentionRatePerHour: new Prisma.Decimal("75.00"),
      invoiceTermsDays: 30,
      driverRatePerMile: new Prisma.Decimal("0.65"),
    },
  });
}

async function upsertUser(orgId: string, email: string, role: "ADMIN" | "BILLING" | "DISPATCHER" | "DRIVER", name: string, passwordHash: string) {
  return prisma.user.upsert({
    where: { orgId_email: { orgId, email } },
    update: { role, name, isActive: true },
    create: { orgId, email, role, name, passwordHash },
  });
}

async function ensureStops(loadId: string, orgId: string) {
  const existing = await prisma.stop.findMany({ where: { loadId, orgId } });
  if (existing.length >= 2) return existing;
  const now = new Date();
  const pickup = await prisma.stop.create({
    data: {
      orgId,
      loadId,
      type: "PICKUP",
      name: "Demo Shipper",
      address: "100 Market St",
      city: "Austin",
      state: "TX",
      zip: "78701",
      appointmentStart: new Date(now.getTime() + 60 * 60 * 1000),
      appointmentEnd: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      sequence: 1,
    },
  });
  const delivery = await prisma.stop.create({
    data: {
      orgId,
      loadId,
      type: "DELIVERY",
      name: "Demo Receiver",
      address: "200 Warehouse Rd",
      city: "Dallas",
      state: "TX",
      zip: "75201",
      appointmentStart: new Date(now.getTime() + 6 * 60 * 60 * 1000),
      appointmentEnd: new Date(now.getTime() + 7 * 60 * 60 * 1000),
      sequence: 2,
    },
  });
  return [pickup, delivery];
}

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const orgA = await findOrCreateOrg(ORG_A_NAME);
  const orgB = await findOrCreateOrg(ORG_B_NAME);

  await upsertSettings(orgA.id);
  await upsertSettings(orgB.id);

  const adminA = await upsertUser(orgA.id, "admin@demo.test", "ADMIN", "Demo Admin", passwordHash);
  const billingA = await upsertUser(orgA.id, "billing@demo.test", "BILLING", "Demo Billing", passwordHash);
  const dispatcherA = await upsertUser(orgA.id, "dispatch@demo.test", "DISPATCHER", "Demo Dispatch", passwordHash);
  const driverUserA = await upsertUser(orgA.id, "driver@demo.test", "DRIVER", "Demo Driver", passwordHash);

  const driverA = await prisma.driver.upsert({
    where: { userId: driverUserA.id },
    update: { name: driverUserA.name ?? "Demo Driver", orgId: orgA.id },
    create: {
      orgId: orgA.id,
      userId: driverUserA.id,
      name: driverUserA.name ?? "Demo Driver",
      license: "D1234567",
      licenseState: "TX",
      payRatePerMile: new Prisma.Decimal("0.65"),
    },
  });

  let truckA = await prisma.truck.findFirst({ where: { orgId: orgA.id, unit: "DEMO-TRUCK" } });
  if (!truckA) {
    truckA = await prisma.truck.create({ data: { orgId: orgA.id, unit: "DEMO-TRUCK", plate: "TX-DEMO-1" } });
  }

  let trailerA = await prisma.trailer.findFirst({ where: { orgId: orgA.id, unit: "DEMO-TRAILER" } });
  if (!trailerA) {
    trailerA = await prisma.trailer.create({ data: { orgId: orgA.id, unit: "DEMO-TRAILER", plate: "TX-DEMO-2" } });
  }

  const customerA = await prisma.customer.upsert({
    where: { orgId_name: { orgId: orgA.id, name: "Demo Customer" } },
    update: {},
    create: {
      orgId: orgA.id,
      name: "Demo Customer",
      billingEmail: "billing@customer.demo",
      termsDays: 30,
    },
  });

  let loadA = await prisma.load.findFirst({
    where: { orgId: orgA.id, loadNumber: "DEMO-1001" },
  });
  if (!loadA) {
    loadA = await prisma.load.create({
      data: {
        orgId: orgA.id,
        loadNumber: "DEMO-1001",
        customerId: customerA.id,
        customerName: customerA.name,
        rate: new Prisma.Decimal("1250.00"),
        miles: 450,
        assignedDriverId: driverA.id,
        truckId: truckA.id,
        trailerId: trailerA.id,
      },
    });
  }
  await ensureStops(loadA.id, orgA.id);

  await upsertUser(orgB.id, "admin@demo-b.test", "ADMIN", "Demo Admin B", passwordHash);
  await prisma.customer.upsert({
    where: { orgId_name: { orgId: orgB.id, name: "Demo Customer B" } },
    update: {},
    create: { orgId: orgB.id, name: "Demo Customer B", termsDays: 21 },
  });
  const loadB = await prisma.load.findFirst({
    where: { orgId: orgB.id, loadNumber: "DEMO-B-2001" },
  });
  if (!loadB) {
    const load = await prisma.load.create({
      data: {
        orgId: orgB.id,
        loadNumber: "DEMO-B-2001",
        customerName: "Demo Customer B",
        rate: new Prisma.Decimal("900.00"),
        miles: 300,
      },
    });
    await ensureStops(load.id, orgB.id);
  }

  const creds = `# Demo Credentials

## Org A
- Admin: admin@demo.test / ${PASSWORD}
- Billing: billing@demo.test / ${PASSWORD}
- Dispatcher: dispatch@demo.test / ${PASSWORD}
- Driver: driver@demo.test / ${PASSWORD}

## Org B
- Admin: admin@demo-b.test / ${PASSWORD}

## URLs
- Web: ${process.env.WEB_ORIGIN || "http://localhost:3000"}
- API: ${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000"}
`;

  await fs.writeFile(path.join(ROOT_DIR, "DEMO_CREDENTIALS.md"), creds, "utf8");
  console.log("Demo seed complete.");
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
