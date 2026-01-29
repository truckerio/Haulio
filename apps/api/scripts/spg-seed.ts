import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { prisma, Prisma } from "@truckerio/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../..");

const ORG_NAME = "SPG Freight";
const PASSWORD = "demo1234";
const TRUCK_COUNT = 200;
const TRAILER_COUNT = 200;
const DRIVER_COUNT = 200;

const ROUTES = [
  {
    shipper: {
      name: "Fontana Yard",
      address: "14300 Slover Ave",
      city: "Fontana",
      state: "CA",
      zip: "92337",
    },
    consignee: {
      name: "Home Goods Wholesale Dock",
      address: "6020 E 82nd St",
      city: "Indianapolis",
      state: "IN",
      zip: "46250",
    },
    customerName: "Westline Retail",
  },
  {
    shipper: {
      name: "Dallas Crossdock",
      address: "4500 Irving Blvd",
      city: "Dallas",
      state: "TX",
      zip: "75247",
    },
    consignee: {
      name: "Atlanta Distribution",
      address: "4800 Fountaine Rd",
      city: "Atlanta",
      state: "GA",
      zip: "30354",
    },
    customerName: "Southeast Wholesale",
  },
];

const LOAD_PLAN = [
  { status: "PLANNED", count: 20, assign: false, pod: "none", invoiced: false },
  { status: "ASSIGNED", count: 20, assign: true, pod: "none", invoiced: false },
  { status: "IN_TRANSIT", count: 20, assign: true, pod: "none", invoiced: false },
  { status: "DELIVERED", count: 15, assign: true, pod: "none", invoiced: false },
  { status: "DELIVERED", count: 5, assign: true, pod: "rejected", invoiced: false },
  { status: "READY_TO_INVOICE", count: 20, assign: true, pod: "verified", invoiced: false },
  { status: "INVOICED", count: 20, assign: true, pod: "verified", invoiced: true },
] as const;

const EMPLOYEES = [
  { email: "admin@spg.test", role: "ADMIN", name: "SPG Admin" },
  { email: "dispatch1@spg.test", role: "DISPATCHER", name: "SPG Dispatch 1" },
  { email: "dispatch2@spg.test", role: "DISPATCHER", name: "SPG Dispatch 2" },
  { email: "dispatch3@spg.test", role: "DISPATCHER", name: "SPG Dispatch 3" },
  { email: "billing1@spg.test", role: "BILLING", name: "SPG Billing 1" },
  { email: "billing2@spg.test", role: "BILLING", name: "SPG Billing 2" },
  { email: "driver1@spg.test", role: "DRIVER", name: "Driver One" },
  { email: "driver2@spg.test", role: "DRIVER", name: "Driver Two" },
  { email: "driver3@spg.test", role: "DRIVER", name: "Driver Three" },
  { email: "driver4@spg.test", role: "DRIVER", name: "Driver Four" },
] as const;

function range(count: number) {
  return Array.from({ length: count }, (_, idx) => idx + 1);
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const org = await prisma.organization.create({ data: { name: ORG_NAME } });

  const settings = await prisma.orgSettings.create({
    data: {
      orgId: org.id,
      companyDisplayName: "SPG Freight",
      remitToAddress: "SPG Freight\n500 Logistics Pkwy\nRiverside, CA 92507",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thanks for your business.",
      invoicePrefix: "SPG-",
      nextInvoiceNumber: 5000,
      podRequireSignature: true,
      podRequirePrintedName: true,
      podRequireDeliveryDate: true,
      podMinPages: 1,
      requiredDocs: ["POD"],
      requiredDriverDocs: ["CDL"],
      collectPodDueMinutes: 30,
      missingPodAfterMinutes: 60,
      reminderFrequencyMinutes: 15,
      timezone: "America/Los_Angeles",
      freeStorageMinutes: 120,
      storageRatePerDay: new Prisma.Decimal("150.00"),
      pickupFreeDetentionMinutes: 120,
      deliveryFreeDetentionMinutes: 120,
      detentionRatePerHour: new Prisma.Decimal("75.00"),
      invoiceTermsDays: 30,
      driverRatePerMile: new Prisma.Decimal("0.65"),
    },
  });

  const operatingEntity = await prisma.operatingEntity.create({
    data: {
      orgId: org.id,
      name: settings.companyDisplayName,
      type: "CARRIER",
      addressLine1: settings.remitToAddress,
      city: "Riverside",
      state: "CA",
      zip: "92507",
      phone: "(909) 555-0199",
      email: "ops@spgfreight.demo",
      mcNumber: "MC123456",
      dotNumber: "DOT987654",
      remitToName: settings.companyDisplayName,
      remitToAddressLine1: settings.remitToAddress,
      remitToCity: "Riverside",
      remitToState: "CA",
      remitToZip: "92507",
      isDefault: true,
    },
  });

  const users = await Promise.all(
    EMPLOYEES.map((employee) =>
      prisma.user.create({
        data: {
          orgId: org.id,
          email: employee.email,
          role: employee.role,
          name: employee.name,
          passwordHash,
          isActive: true,
        },
      })
    )
  );

  const driverUsers = users.filter((user) => user.role === "DRIVER");

  await prisma.driver.createMany({
    data: driverUsers.map((user, index) => ({
      orgId: org.id,
      userId: user.id,
      name: user.name ?? `Driver ${index + 1}`,
      phone: `+1-555-30${String(index + 1).padStart(2, "0")}`,
      license: `C${100000 + index}`,
      licenseState: "CA",
      licenseExpiresAt: daysFromNow(180 + index),
      medCardExpiresAt: daysFromNow(120 + index),
      payRatePerMile: new Prisma.Decimal("0.70"),
    })),
  });

  const extraDrivers = range(DRIVER_COUNT - driverUsers.length).map((idx) => ({
    orgId: org.id,
    name: `SPG Driver ${String(idx + driverUsers.length).padStart(3, "0")}`,
    phone: `+1-555-40${String(idx).padStart(2, "0")}`,
    license: `C${200000 + idx}`,
    licenseState: "TX",
    licenseExpiresAt: daysFromNow(90 + idx),
    medCardExpiresAt: daysFromNow(60 + idx),
    payRatePerMile: new Prisma.Decimal("0.68"),
  }));

  for (let i = 0; i < extraDrivers.length; i += 100) {
    await prisma.driver.createMany({ data: extraDrivers.slice(i, i + 100) });
  }

  const trucks = range(TRUCK_COUNT).map((idx) => ({
    orgId: org.id,
    unit: `SPG-TRK-${String(idx).padStart(3, "0")}`,
    plate: `CA-${String(1000 + idx)}`,
    active: true,
  }));
  for (let i = 0; i < trucks.length; i += 200) {
    await prisma.truck.createMany({ data: trucks.slice(i, i + 200) });
  }

  const trailers = range(TRAILER_COUNT).map((idx) => ({
    orgId: org.id,
    unit: `SPG-TRL-${String(idx).padStart(3, "0")}`,
    plate: `TX-${String(2000 + idx)}`,
    active: true,
  }));
  for (let i = 0; i < trailers.length; i += 200) {
    await prisma.trailer.createMany({ data: trailers.slice(i, i + 200) });
  }

  const driverList = await prisma.driver.findMany({ where: { orgId: org.id }, orderBy: { name: "asc" } });
  const truckList = await prisma.truck.findMany({ where: { orgId: org.id }, orderBy: { unit: "asc" } });
  const trailerList = await prisma.trailer.findMany({ where: { orgId: org.id }, orderBy: { unit: "asc" } });

  const customers = await Promise.all(
    ROUTES.map((route) =>
      prisma.customer.create({
        data: {
          orgId: org.id,
          name: route.customerName,
          billingEmail: `billing@${route.customerName.toLowerCase().replace(/\s+/g, "")}.demo`,
          termsDays: 30,
        },
      })
    )
  );

  let loadNumberCounter = 1001;
  let invoiceNumberCounter = settings.nextInvoiceNumber;

  const createdLoads: { id: string; driverId?: string | null; status: string }[] = [];

  for (const plan of LOAD_PLAN) {
    for (let i = 0; i < plan.count; i += 1) {
      const route = ROUTES[(loadNumberCounter - 1001) % ROUTES.length];
      const customer = customers[(loadNumberCounter - 1001) % customers.length];
      const driver = plan.assign ? driverList[(loadNumberCounter - 1001) % driverList.length] : null;
      const truck = plan.assign ? truckList[(loadNumberCounter - 1001) % truckList.length] : null;
      const trailer = plan.assign ? trailerList[(loadNumberCounter - 1001) % trailerList.length] : null;

      const pickupStart = daysFromNow(Math.floor(loadNumberCounter / 4));
      pickupStart.setHours(8, 0, 0, 0);
      const pickupEnd = new Date(pickupStart.getTime() + 2 * 60 * 60 * 1000);
      const deliveryStart = new Date(pickupStart.getTime() + 2 * 24 * 60 * 60 * 1000);
      const deliveryEnd = new Date(deliveryStart.getTime() + 2 * 60 * 60 * 1000);

      const load = await prisma.load.create({
        data: {
          orgId: org.id,
          loadNumber: `SPG-${loadNumberCounter}`,
          status: plan.status,
          loadType: "COMPANY",
          operatingEntityId: operatingEntity.id,
          customerId: customer.id,
          customerName: customer.name,
          shipperReferenceNumber: `SREF-${loadNumberCounter}`,
          consigneeReferenceNumber: `CREF-${loadNumberCounter}`,
          palletCount: 22 + (loadNumberCounter % 6),
          weightLbs: 36000 + (loadNumberCounter % 5000),
          miles: 1500 + (loadNumberCounter % 300),
          rate: new Prisma.Decimal((1800 + (loadNumberCounter % 800)).toFixed(2)),
          assignedDriverId: driver?.id ?? null,
          truckId: truck?.id ?? null,
          trailerId: trailer?.id ?? null,
          plannedAt: pickupStart,
          deliveredAt:
            plan.status === "DELIVERED" || plan.status === "READY_TO_INVOICE" || plan.status === "INVOICED"
              ? deliveryEnd
              : null,
          podVerifiedAt: plan.pod === "verified" ? deliveryEnd : null,
          createdById: users[0]?.id ?? null,
        },
      });

      await prisma.stop.createMany({
        data: [
          {
            orgId: org.id,
            loadId: load.id,
            type: "PICKUP",
            status: plan.status === "PLANNED" ? "PLANNED" : "DEPARTED",
            name: route.shipper.name,
            address: route.shipper.address,
            city: route.shipper.city,
            state: route.shipper.state,
            zip: route.shipper.zip,
            appointmentStart: pickupStart,
            appointmentEnd: pickupEnd,
            arrivedAt: plan.status === "PLANNED" ? null : pickupStart,
            departedAt: plan.status === "PLANNED" ? null : pickupEnd,
            sequence: 1,
          },
          {
            orgId: org.id,
            loadId: load.id,
            type: "DELIVERY",
            status: plan.status === "PLANNED" ? "PLANNED" : plan.status === "DELIVERED" || plan.status === "READY_TO_INVOICE" || plan.status === "INVOICED" ? "ARRIVED" : "PLANNED",
            name: route.consignee.name,
            address: route.consignee.address,
            city: route.consignee.city,
            state: route.consignee.state,
            zip: route.consignee.zip,
            appointmentStart: deliveryStart,
            appointmentEnd: deliveryEnd,
            arrivedAt:
              plan.status === "DELIVERED" || plan.status === "READY_TO_INVOICE" || plan.status === "INVOICED"
                ? deliveryStart
                : null,
            departedAt:
              plan.status === "DELIVERED" || plan.status === "READY_TO_INVOICE" || plan.status === "INVOICED"
                ? deliveryEnd
                : null,
            sequence: 2,
          },
        ],
      });

      if (plan.pod === "verified" || plan.pod === "rejected") {
        await prisma.document.create({
          data: {
            orgId: org.id,
            loadId: load.id,
            type: "POD",
            status: plan.pod === "verified" ? "VERIFIED" : "REJECTED",
            source: "DRIVER_UPLOAD",
            filename: `pod_${load.loadNumber}.pdf`,
            originalName: `pod_${load.loadNumber}.pdf`,
            mimeType: "application/pdf",
            size: 120000,
            uploadedById: driver?.userId ?? users[0]?.id ?? null,
            uploadedAt: deliveryEnd,
            verifiedAt: plan.pod === "verified" ? new Date(deliveryEnd.getTime() + 2 * 60 * 60 * 1000) : null,
            rejectedAt: plan.pod === "rejected" ? new Date(deliveryEnd.getTime() + 2 * 60 * 60 * 1000) : null,
            rejectReason: plan.pod === "rejected" ? "Missing receiver signature" : null,
          },
        });
      }

      if (plan.status === "IN_TRANSIT") {
        await prisma.loadTrackingSession.create({
          data: {
            orgId: org.id,
            loadId: load.id,
            providerType: "PHONE",
            status: "ON",
            startedAt: pickupStart,
            startedByUserId: users[1]?.id ?? users[0]?.id ?? null,
          },
        });
        await prisma.locationPing.create({
          data: {
            orgId: org.id,
            loadId: load.id,
            driverId: driver?.id ?? null,
            truckId: truck?.id ?? null,
            providerType: "PHONE",
            lat: new Prisma.Decimal("34.0922"),
            lng: new Prisma.Decimal("-118.3584"),
            accuracyM: 15,
            speedMph: 55,
            capturedAt: new Date(pickupStart.getTime() + 60 * 60 * 1000),
          },
        });
      }

      if (plan.invoiced) {
        const invoiceNumber = `${settings.invoicePrefix}${invoiceNumberCounter}`;
        invoiceNumberCounter += 1;
        const invoice = await prisma.invoice.create({
          data: {
            orgId: org.id,
            loadId: load.id,
            invoiceNumber,
            status: "GENERATED",
            totalAmount: load.rate ?? new Prisma.Decimal("0"),
            generatedAt: new Date(),
          },
        });
        await prisma.invoiceLineItem.create({
          data: {
            invoiceId: invoice.id,
            code: "LINEHAUL",
            description: "Linehaul",
            quantity: new Prisma.Decimal("1"),
            rate: load.rate ?? new Prisma.Decimal("0"),
            amount: load.rate ?? new Prisma.Decimal("0"),
          },
        });
      }

      createdLoads.push({ id: load.id, driverId: driver?.id ?? null, status: plan.status });
      loadNumberCounter += 1;
    }
  }

  await prisma.orgSettings.update({
    where: { orgId: org.id },
    data: { nextInvoiceNumber: invoiceNumberCounter },
  });

  const driverWithLoads = driverList.filter((driver) => createdLoads.some((load) => load.driverId === driver.id));
  const settlementDrivers = driverWithLoads.slice(0, 4);
  const now = new Date();
  const lastWeekStart = new Date(now);
  lastWeekStart.setDate(now.getDate() - 7);
  lastWeekStart.setHours(0, 0, 0, 0);
  const lastWeekEnd = new Date(lastWeekStart);
  lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
  lastWeekEnd.setHours(23, 59, 59, 0);

  for (const [index, driver] of settlementDrivers.entries()) {
    const driverLoads = createdLoads.filter((load) => load.driverId === driver.id).slice(0, 5);
    if (driverLoads.length === 0) continue;
    let gross = new Prisma.Decimal(0);
    for (const load of driverLoads) {
      const loadRecord = await prisma.load.findUnique({ where: { id: load.id } });
      const rate = loadRecord?.rate ?? new Prisma.Decimal("0");
      gross = gross.plus(rate);
    }
    const deductions = gross.mul(new Prisma.Decimal("0.1"));
    const net = gross.minus(deductions);

    const settlement = await prisma.settlement.create({
      data: {
        orgId: org.id,
        driverId: driver.id,
        periodStart: lastWeekStart,
        periodEnd: lastWeekEnd,
        status: index % 2 === 0 ? "FINALIZED" : "PAID",
        gross,
        deductions,
        net,
        finalizedAt: new Date(lastWeekEnd.getTime() + 2 * 60 * 60 * 1000),
        paidAt: index % 2 === 0 ? null : new Date(lastWeekEnd.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    for (const load of driverLoads) {
      const loadRecord = await prisma.load.findUnique({ where: { id: load.id } });
      await prisma.settlementItem.create({
        data: {
          settlementId: settlement.id,
          loadId: load.id,
          code: "LINEHAUL",
          description: loadRecord?.loadNumber ?? "Load",
          amount: loadRecord?.rate ?? new Prisma.Decimal("0"),
        },
      });
    }
  }

  const creds = `# SPG Freight Demo Credentials

- Admin: admin@spg.test / ${PASSWORD}
- Dispatcher 1: dispatch1@spg.test / ${PASSWORD}
- Dispatcher 2: dispatch2@spg.test / ${PASSWORD}
- Dispatcher 3: dispatch3@spg.test / ${PASSWORD}
- Billing 1: billing1@spg.test / ${PASSWORD}
- Billing 2: billing2@spg.test / ${PASSWORD}
- Driver 1: driver1@spg.test / ${PASSWORD}
- Driver 2: driver2@spg.test / ${PASSWORD}
- Driver 3: driver3@spg.test / ${PASSWORD}
- Driver 4: driver4@spg.test / ${PASSWORD}

## URLs
- Web: ${process.env.WEB_ORIGIN || "http://localhost:3000"}
- API: ${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000"}
`;

  await fs.writeFile(path.join(ROOT_DIR, "DEMO_CREDENTIALS.md"), creds, "utf8");
  console.log("SPG Freight seed complete.");
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
