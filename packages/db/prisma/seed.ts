import bcrypt from "bcryptjs";
import { prisma, Prisma } from "../src";

const ORG_NAME = process.env.DEMO_ORG_NAME || "Haulio Demo Logistics";
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL || "karan@admin.com";
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || "password123";

const LOAD_COUNT = Number(process.env.DEMO_LOAD_COUNT || "200");
const DRIVER_COUNT = Number(process.env.DEMO_DRIVER_COUNT || "40");
const TRUCK_COUNT = Number(process.env.DEMO_TRUCK_COUNT || "35");
const TRAILER_COUNT = Number(process.env.DEMO_TRAILER_COUNT || "35");

const TEAM_NAMES = ["Default", "Alpha", "Bravo", "Charlie", "Delta", "Echo"];

const CUSTOMER_NAMES = [
  "Blue Ridge Foods",
  "Granite Mills",
  "Freshline Produce",
  "Sunrise Paper",
  "Ironline Steel",
  "Maple Logistics",
  "Northwind Plastics",
  "Summit Retail",
];

const STOP_CITIES = [
  { city: "Dallas", state: "TX" },
  { city: "Houston", state: "TX" },
  { city: "Austin", state: "TX" },
  { city: "Memphis", state: "TN" },
  { city: "Nashville", state: "TN" },
  { city: "Atlanta", state: "GA" },
  { city: "Charlotte", state: "NC" },
  { city: "Denver", state: "CO" },
];

const LOAD_STATUSES = [
  ...Array(40).fill("PLANNED"),
  ...Array(40).fill("ASSIGNED"),
  ...Array(40).fill("IN_TRANSIT"),
  ...Array(30).fill("DELIVERED"),
  ...Array(20).fill("POD_RECEIVED"),
  ...Array(20).fill("READY_TO_INVOICE"),
  ...Array(10).fill("INVOICED"),
];

function toDecimal(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}

function pick<T>(list: T[], index: number) {
  return list[index % list.length];
}

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Organization" CASCADE');

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const org = await prisma.organization.create({
    data: { name: ORG_NAME },
  });

  const admin = await prisma.user.create({
    data: {
      orgId: org.id,
      email: ADMIN_EMAIL,
      passwordHash,
      role: "ADMIN",
      name: "Karan Admin",
      canSeeAllTeams: true,
    },
  });

  const headDispatcher = await prisma.user.create({
    data: {
      orgId: org.id,
      email: "head.dispatch@demo.com",
      passwordHash,
      role: "HEAD_DISPATCHER",
      name: "Harper Head",
      canSeeAllTeams: true,
    },
  });

  const dispatchers = await Promise.all(
    ["dispatch1@demo.com", "dispatch2@demo.com"].map((email, index) =>
      prisma.user.create({
        data: {
          orgId: org.id,
          email,
          passwordHash,
          role: "DISPATCHER",
          name: `Dispatch ${index + 1}`,
        },
      })
    )
  );

  const billingUsers = await Promise.all(
    ["billing1@demo.com", "billing2@demo.com"].map((email, index) =>
      prisma.user.create({
        data: {
          orgId: org.id,
          email,
          passwordHash,
          role: "BILLING",
          name: `Billing ${index + 1}`,
        },
      })
    )
  );

  const driverUsers = await Promise.all(
    Array.from({ length: Math.min(DRIVER_COUNT, 10) }).map((_, index) =>
      prisma.user.create({
        data: {
          orgId: org.id,
          email: `driver${index + 1}@demo.com`,
          passwordHash,
          role: "DRIVER",
          name: `Driver ${index + 1}`,
        },
      })
    )
  );

  const teams = await Promise.all(
    TEAM_NAMES.map((name) =>
      prisma.team.create({
        data: { orgId: org.id, name, active: true },
      })
    )
  );
  const defaultTeam = teams.find((team) => team.name === "Default") ?? teams[0];
  const otherTeams = teams.filter((team) => team.id !== defaultTeam.id);

  const allUsers = [admin, headDispatcher, ...dispatchers, ...billingUsers, ...driverUsers];
  await prisma.user.updateMany({
    where: { orgId: org.id },
    data: { defaultTeamId: defaultTeam.id },
  });
  await prisma.teamMember.createMany({
    data: allUsers.map((user) => ({
      orgId: org.id,
      teamId: defaultTeam.id,
      userId: user.id,
    })),
    skipDuplicates: true,
  });

  for (const [index, user] of dispatchers.entries()) {
    const team = pick(otherTeams, index);
    if (!team) continue;
    await prisma.teamMember.create({
      data: { orgId: org.id, teamId: team.id, userId: user.id },
    });
  }

  const drivers = await Promise.all(
    Array.from({ length: DRIVER_COUNT }).map((_, index) =>
      prisma.driver.create({
        data: {
          orgId: org.id,
          userId: driverUsers[index]?.id ?? null,
          name: driverUsers[index]?.name ?? `Driver ${index + 1}`,
          status: index % 3 === 0 ? "ON_LOAD" : index % 3 === 1 ? "AVAILABLE" : "UNAVAILABLE",
          phone: `(555) 010-${(2000 + index).toString().slice(-4)}`,
          license: `D-${100000 + index}`,
          licenseState: "TX",
          licenseExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
          medCardExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180),
          payRatePerMile: toDecimal(0.62 + (index % 5) * 0.02),
        },
      })
    )
  );

  const trucks = await Promise.all(
    Array.from({ length: TRUCK_COUNT }).map((_, index) =>
      prisma.truck.create({
        data: {
          orgId: org.id,
          unit: `T-${100 + index}`,
          vin: `VIN${100000 + index}`,
          plate: `TRK-${100 + index}`,
          plateState: "TX",
          status: index % 4 === 0 ? "MAINTENANCE" : "AVAILABLE",
        },
      })
    )
  );

  const trailers = await Promise.all(
    Array.from({ length: TRAILER_COUNT }).map((_, index) =>
      prisma.trailer.create({
        data: {
          orgId: org.id,
          unit: `TR-${200 + index}`,
          type: index % 3 === 0 ? "REEFER" : index % 3 === 1 ? "FLATBED" : "DRY_VAN",
          plate: `TRL-${200 + index}`,
          plateState: "TX",
          status: index % 4 === 0 ? "MAINTENANCE" : "AVAILABLE",
        },
      })
    )
  );

  await prisma.orgSettings.create({
    data: {
      orgId: org.id,
      companyDisplayName: "Haulio Demo Logistics",
      remitToAddress: "Haulio Demo Logistics\n123 Freight Ave\nDallas, TX 75201",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thank you for your business.",
      invoicePrefix: "INV-",
      nextInvoiceNumber: 1200,
      currency: "USD",
      operatingMode: "CARRIER",
      requireRateConBeforeDispatch: false,
      trackingPreference: "MANUAL",
      settlementSchedule: "WEEKLY",
      settlementTemplate: { includeLinehaul: true, includeFuelSurcharge: false, includeAccessorials: false },
      podRequireSignature: true,
      podRequirePrintedName: true,
      podRequireDeliveryDate: true,
      podMinPages: 1,
      requiredDocs: ["POD"],
      requiredDriverDocs: ["CDL", "MED_CARD"],
      collectPodDueMinutes: 30,
      missingPodAfterMinutes: 120,
      reminderFrequencyMinutes: 20,
      timezone: "America/Chicago",
      freeStorageMinutes: 120,
      storageRatePerDay: toDecimal(150),
      pickupFreeDetentionMinutes: 120,
      deliveryFreeDetentionMinutes: 120,
      detentionRatePerHour: toDecimal(75),
      invoiceTermsDays: 30,
      driverRatePerMile: toDecimal(0.65),
    },
  });

  const operatingEntity = await prisma.operatingEntity.create({
    data: {
      orgId: org.id,
      name: "Haulio Demo Logistics",
      type: "CARRIER",
      addressLine1: "Haulio Demo Logistics\n123 Freight Ave\nDallas, TX 75201",
      remitToName: "Haulio Demo Logistics",
      remitToAddressLine1: "Haulio Demo Logistics\n123 Freight Ave\nDallas, TX 75201",
      isDefault: true,
    },
  });

  const customers = await Promise.all(
    CUSTOMER_NAMES.map((name, index) =>
      prisma.customer.create({
        data: {
          orgId: org.id,
          name,
          billingEmail: `ap${index + 1}@demo.com`,
          billingPhone: `(555) 100-${(3000 + index).toString().slice(-4)}`,
          termsDays: 14 + (index % 4) * 7,
        },
      })
    )
  );

  const assignableTeams = otherTeams.length > 0 ? otherTeams : [defaultTeam];
  const createdBy = dispatchers[0] ?? admin;
  const loads: Array<{ id: string; status: string }> = [];

  for (const [index, status] of LOAD_STATUSES.slice(0, LOAD_COUNT).entries()) {
    const customer = pick(customers, index);
    const driver = pick(drivers, index);
    const truck = pick(trucks, index);
    const trailer = pick(trailers, index);
    const team = pick(assignableTeams, index);

    const loadType = index % 7 === 0 ? "BROKERED" : "COMPANY";
    const shouldAssign = status !== "PLANNED" && !(status === "ASSIGNED" && index % 4 === 0);
    const assignedDriverId = shouldAssign ? driver.id : null;
    const assignedTruckId = shouldAssign ? truck.id : null;
    const assignedTrailerId = shouldAssign ? trailer.id : null;

    const baseTime = new Date(Date.now() - (index % 12) * 6 * 60 * 60 * 1000);
    const pickupCity = pick(STOP_CITIES, index);
    const dropCity = pick(STOP_CITIES, index + 3);

    const pickupStatus =
      status === "IN_TRANSIT" ||
      status === "DELIVERED" ||
      status === "POD_RECEIVED" ||
      status === "READY_TO_INVOICE" ||
      status === "INVOICED"
        ? "DEPARTED"
        : status === "ASSIGNED"
          ? "PLANNED"
          : "PLANNED";
    const dropStatus =
      status === "DELIVERED" ||
      status === "POD_RECEIVED" ||
      status === "READY_TO_INVOICE" ||
      status === "INVOICED"
        ? "ARRIVED"
        : "PLANNED";

    const load = await prisma.load.create({
      data: {
        orgId: org.id,
        loadNumber: `LD-${2000 + index}`,
        status: status as any,
        loadType: loadType as any,
        operatingEntityId: operatingEntity.id,
        customerId: customer.id,
        customerName: customer.name,
        miles: 120 + (index % 10) * 30,
        rate: toDecimal(1200 + (index % 25) * 40),
        customerRef: `PO-${7000 + index}`,
        bolNumber: `BOL-${2000 + index}`,
        assignedDriverId,
        truckId: assignedTruckId,
        trailerId: assignedTrailerId,
        assignedDriverAt: assignedDriverId ? baseTime : null,
        assignedTruckAt: assignedTruckId ? baseTime : null,
        assignedTrailerAt: assignedTrailerId ? baseTime : null,
        deliveredAt:
          status === "DELIVERED" ||
          status === "POD_RECEIVED" ||
          status === "READY_TO_INVOICE" ||
          status === "INVOICED"
            ? new Date(baseTime.getTime() + 6 * 60 * 60 * 1000)
            : null,
        podVerifiedAt: status === "READY_TO_INVOICE" || status === "INVOICED" ? new Date() : null,
        createdById: createdBy.id,
        stops: {
          create: [
            {
              orgId: org.id,
              type: "PICKUP",
              status: pickupStatus as any,
              name: `${customer.name} Pickup`,
              address: `${100 + (index % 80)} Main St`,
              city: pickupCity.city,
              state: pickupCity.state,
              zip: `75${(200 + index).toString().slice(-3)}`,
              appointmentStart: new Date(baseTime.getTime() + 60 * 60 * 1000),
              appointmentEnd: new Date(baseTime.getTime() + 2 * 60 * 60 * 1000),
              arrivedAt: pickupStatus !== "PLANNED" ? new Date(baseTime.getTime() + 60 * 60 * 1000) : null,
              departedAt: pickupStatus === "DEPARTED" ? new Date(baseTime.getTime() + 2 * 60 * 60 * 1000) : null,
              sequence: 1,
            },
            {
              orgId: org.id,
              type: "DELIVERY",
              status: dropStatus as any,
              name: `${customer.name} Delivery`,
              address: `${600 + (index % 80)} Market Ave`,
              city: dropCity.city,
              state: dropCity.state,
              zip: `76${(300 + index).toString().slice(-3)}`,
              appointmentStart: new Date(baseTime.getTime() + 6 * 60 * 60 * 1000),
              appointmentEnd: new Date(baseTime.getTime() + 7 * 60 * 60 * 1000),
              arrivedAt: dropStatus !== "PLANNED" ? new Date(baseTime.getTime() + 6 * 60 * 60 * 1000) : null,
              departedAt:
                dropStatus === "ARRIVED" && status === "INVOICED"
                  ? new Date(baseTime.getTime() + 7 * 60 * 60 * 1000)
                  : null,
              sequence: 2,
            },
          ],
        },
      },
    });

    loads.push({ id: load.id, status });

    await prisma.teamAssignment.create({
      data: {
        orgId: org.id,
        teamId: team.id,
        entityType: "LOAD",
        entityId: load.id,
      },
    });
  }

  const podUploader = driverUsers[0] ?? admin;
  const billingUser = billingUsers[0] ?? admin;
  const invoicedLoads = loads.filter((load) => load.status === "INVOICED").slice(0, 5);
  const deliveredLoads = loads.filter((load) => load.status === "DELIVERED").slice(0, 10);

  for (const load of deliveredLoads) {
    await prisma.document.create({
      data: {
        orgId: org.id,
        loadId: load.id,
        type: "POD",
        status: "UPLOADED",
        filename: `pod_${load.id}.pdf`,
        originalName: "POD.pdf",
        mimeType: "application/pdf",
        size: 12345,
        uploadedById: podUploader.id,
      },
    });
  }

  for (const load of invoicedLoads) {
    await prisma.document.create({
      data: {
        orgId: org.id,
        loadId: load.id,
        type: "POD",
        status: "VERIFIED",
        filename: `pod_${load.id}.pdf`,
        originalName: "POD.pdf",
        mimeType: "application/pdf",
        size: 12345,
        uploadedById: podUploader.id,
        verifiedById: billingUser.id,
        verifiedAt: new Date(),
      },
    });
    await prisma.invoice.create({
      data: {
        orgId: org.id,
        loadId: load.id,
        invoiceNumber: `INV-${1500 + Math.floor(Math.random() * 1000)}`,
        status: "SENT",
        totalAmount: toDecimal(1500 + Math.floor(Math.random() * 500)),
        sentAt: new Date(),
        pdfPath: `uploads/invoices/INV-${load.id}.pdf`,
        packetPath: `uploads/packets/INV-${load.id}.zip`,
        items: {
          create: [
            {
              code: "LINEHAUL",
              description: "Linehaul",
              quantity: toDecimal(1),
              rate: toDecimal(1500),
              amount: toDecimal(1500),
            },
          ],
        },
      },
    });
  }

  await prisma.task.createMany({
    data: [
      {
        orgId: org.id,
        type: "COLLECT_POD",
        title: "Collect POD",
        priority: "HIGH",
        assignedRole: "BILLING",
        createdById: billingUser.id,
        dueAt: new Date(Date.now() + 30 * 60 * 1000),
      },
      {
        orgId: org.id,
        type: "CUSTOMER_CALLBACK",
        title: "Dispatch check-in",
        priority: "MED",
        assignedRole: "DISPATCHER",
        createdById: createdBy.id,
      },
    ],
  });

  console.log("Seed complete.");
  console.log(`Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`Loads: ${LOAD_COUNT} | Drivers: ${DRIVER_COUNT} | Teams: ${TEAM_NAMES.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
