import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import {
  prisma,
  Prisma,
  DocType,
  VaultDocType,
  VaultScopeType,
  BillingStatus,
  AccessorialStatus,
  AccessorialType,
} from "../src";

const ORG_NAME = process.env.DEMO_ORG_NAME || "Haulio Demo Logistics";
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL || "karan@admin.com";
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || "password123";
const INVITE_EMAIL = process.env.DEMO_INVITE_EMAIL || "";

const LOAD_COUNT = Number(process.env.DEMO_LOAD_COUNT || "50");
const DRIVER_COUNT = Number(process.env.DEMO_DRIVER_COUNT || "55");
const TRUCK_COUNT = Number(process.env.DEMO_TRUCK_COUNT || "50");
const TRAILER_COUNT = Number(process.env.DEMO_TRAILER_COUNT || "50");

const TEAM_NAMES = ["Default", "Inbound", "Outbound"];
const INBOUND_TRUCKS = 10;
const OUTBOUND_TRUCKS = 40;

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
  ...Array(10).fill("PLANNED"),
  ...Array(10).fill("ASSIGNED"),
  ...Array(10).fill("IN_TRANSIT"),
  ...Array(8).fill("DELIVERED"),
  ...Array(5).fill("POD_RECEIVED"),
  ...Array(5).fill("READY_TO_INVOICE"),
  ...Array(2).fill("INVOICED"),
];

function toDecimal(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}

function pick<T>(list: T[], index: number) {
  return list[index % list.length];
}

function hashInviteToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function getRepoRoot() {
  let current = process.cwd();
  while (true) {
    try {
      await fs.access(path.join(current, "pnpm-workspace.yaml"));
      return current;
    } catch {
      try {
        await fs.access(path.join(current, ".git"));
        return current;
      } catch {
        const parent = path.dirname(current);
        if (parent === current) return process.cwd();
        current = parent;
      }
    }
  }
}

async function writeVaultFile(orgId: string, docId: string, filename: string, content: string) {
  const root = await getRepoRoot();
  const base = path.join(root, "uploads");
  const target = path.join(base, "org", orgId, "vault", docId, filename);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
  return path
    .relative(base, target)
    .replace(/\\/g, "/");
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

  const admin2 = await prisma.user.create({
    data: {
      orgId: org.id,
      email: "admin2@demo.com",
      passwordHash,
      role: "ADMIN",
      name: "Riley Admin",
      canSeeAllTeams: true,
    },
  });

  if (INVITE_EMAIL) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.userInvite.create({
      data: {
        orgId: org.id,
        email: INVITE_EMAIL.toLowerCase(),
        role: "DISPATCHER",
        tokenHash,
        expiresAt,
        invitedByUserId: admin.id,
      },
    });
  }

  const headDispatchers = await Promise.all(
    ["head.dispatch1@demo.com", "head.dispatch2@demo.com"].map((email, index) =>
      prisma.user.create({
        data: {
          orgId: org.id,
          email,
          passwordHash,
          role: "HEAD_DISPATCHER",
          name: `Head Dispatcher ${index + 1}`,
          canSeeAllTeams: true,
        },
      })
    )
  );

  const dispatchers = await Promise.all(
    Array.from({ length: 8 }).map((_, index) =>
      prisma.user.create({
        data: {
          orgId: org.id,
          email: `dispatch${index + 1}@demo.com`,
          passwordHash,
          role: "DISPATCHER",
          name: `Dispatch ${index + 1}`,
        },
      })
    )
  );

  const billingUsers = await Promise.all(
    ["billing1@demo.com", "billing2@demo.com", "billing3@demo.com"].map((email, index) =>
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
  const inboundTeam = teams.find((team) => team.name === "Inbound") ?? teams[0];
  const outboundTeam = teams.find((team) => team.name === "Outbound") ?? teams[0];

  const allUsers = [admin, admin2, ...headDispatchers, ...dispatchers, ...billingUsers, ...driverUsers];
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

  const inboundDispatchers = dispatchers.slice(0, 2);
  const outboundDispatchers = dispatchers.slice(2);
  for (const user of inboundDispatchers) {
    await prisma.teamMember.create({
      data: { orgId: org.id, teamId: inboundTeam.id, userId: user.id },
    });
  }
  for (const user of outboundDispatchers) {
    await prisma.teamMember.create({
      data: { orgId: org.id, teamId: outboundTeam.id, userId: user.id },
    });
  }
  for (const head of headDispatchers) {
    const team = head.email.includes("1") ? inboundTeam : outboundTeam;
    await prisma.teamMember.create({
      data: { orgId: org.id, teamId: team.id, userId: head.id },
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

  const inboundDrivers = drivers.slice(0, INBOUND_TRUCKS);
  const outboundDrivers = drivers.slice(INBOUND_TRUCKS, INBOUND_TRUCKS + OUTBOUND_TRUCKS);
  const unassignedDrivers = drivers.slice(INBOUND_TRUCKS + OUTBOUND_TRUCKS);
  await prisma.teamAssignment.createMany({
    data: inboundDrivers.map((driver) => ({
      orgId: org.id,
      teamId: inboundTeam.id,
      entityType: "DRIVER",
      entityId: driver.id,
    })),
    skipDuplicates: true,
  });
  await prisma.teamAssignment.createMany({
    data: outboundDrivers.map((driver) => ({
      orgId: org.id,
      teamId: outboundTeam.id,
      entityType: "DRIVER",
      entityId: driver.id,
    })),
    skipDuplicates: true,
  });
  if (unassignedDrivers.length > 0) {
    await prisma.teamAssignment.createMany({
      data: unassignedDrivers.map((driver) => ({
        orgId: org.id,
        teamId: defaultTeam.id,
        entityType: "DRIVER",
        entityId: driver.id,
      })),
      skipDuplicates: true,
    });
  }

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

  const inboundTrucks = trucks.slice(0, INBOUND_TRUCKS);
  const outboundTrucks = trucks.slice(INBOUND_TRUCKS, INBOUND_TRUCKS + OUTBOUND_TRUCKS);
  await prisma.teamAssignment.createMany({
    data: inboundTrucks.map((truck) => ({
      orgId: org.id,
      teamId: inboundTeam.id,
      entityType: "TRUCK",
      entityId: truck.id,
    })),
    skipDuplicates: true,
  });
  await prisma.teamAssignment.createMany({
    data: outboundTrucks.map((truck) => ({
      orgId: org.id,
      teamId: outboundTeam.id,
      entityType: "TRUCK",
      entityId: truck.id,
    })),
    skipDuplicates: true,
  });

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
      companyDisplayName: ORG_NAME,
      remitToAddress: `${ORG_NAME}\n123 Freight Ave\nDallas, TX 75201`,
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
      requiredDocs: ["POD", "RATECON", "BOL", "LUMPER", "SCALE", "DETENTION", "OTHER"],
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
      name: ORG_NAME,
      type: "CARRIER",
      addressLine1: `${ORG_NAME}\n123 Freight Ave\nDallas, TX 75201`,
      remitToName: ORG_NAME,
      remitToAddressLine1: `${ORG_NAME}\n123 Freight Ave\nDallas, TX 75201`,
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

  const createdBy = dispatchers[0] ?? admin;
  const loads: Array<{ id: string; status: string }> = [];

  for (const [index, status] of LOAD_STATUSES.slice(0, LOAD_COUNT).entries()) {
    const customer = pick(customers, index);
    const driver = pick(drivers, index);
    const truck = pick(trucks, index);
    const trailer = pick(trailers, index);
    const team = index < INBOUND_TRUCKS ? inboundTeam : outboundTeam;

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
  const missingPodLoad = deliveredLoads[0];
  const missingRateConLoad = deliveredLoads[1];
  const accessorialLoad = deliveredLoads[2];
  const readyLoad = deliveredLoads[3];

  for (const load of deliveredLoads) {
    if (missingPodLoad && load.id === missingPodLoad.id) continue;
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

  for (const load of [readyLoad, accessorialLoad].filter(Boolean) as { id: string }[]) {
    await prisma.document.create({
      data: {
        orgId: org.id,
        loadId: load.id,
        type: "RATECON",
        status: "UPLOADED",
        filename: `ratecon_${load.id}.pdf`,
        originalName: "RateCon.pdf",
        mimeType: "application/pdf",
        size: 9823,
        uploadedById: createdBy.id,
      },
    });
  }

  if (accessorialLoad) {
    await prisma.accessorial.create({
      data: {
        orgId: org.id,
        loadId: accessorialLoad.id,
        type: AccessorialType.LUMPER,
        amount: toDecimal(250),
        requiresProof: true,
        status: AccessorialStatus.NEEDS_PROOF,
        notes: "Lumper fee pending receipt",
        createdById: createdBy.id,
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
    await prisma.document.create({
      data: {
        orgId: org.id,
        loadId: load.id,
        type: "RATECON",
        status: "UPLOADED",
        filename: `ratecon_${load.id}.pdf`,
        originalName: "RateCon.pdf",
        mimeType: "application/pdf",
        size: 9823,
        uploadedById: createdBy.id,
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

  if (invoicedLoads.length > 0) {
    await prisma.load.updateMany({
      where: { id: { in: invoicedLoads.map((load) => load.id) } },
      data: { billingStatus: BillingStatus.INVOICED, billingBlockingReasons: [], invoicedAt: new Date() },
    });
  }

  if (readyLoad) {
    await prisma.load.update({
      where: { id: readyLoad.id },
      data: { billingStatus: BillingStatus.READY, billingBlockingReasons: [] },
    });
  }
  if (missingPodLoad) {
    await prisma.load.update({
      where: { id: missingPodLoad.id },
      data: { billingStatus: BillingStatus.BLOCKED, billingBlockingReasons: ["Missing POD"] },
    });
  }
  if (missingRateConLoad) {
    await prisma.load.update({
      where: { id: missingRateConLoad.id },
      data: { billingStatus: BillingStatus.BLOCKED, billingBlockingReasons: ["Missing Rate Confirmation"] },
    });
  }
  if (accessorialLoad) {
    await prisma.load.update({
      where: { id: accessorialLoad.id },
      data: {
        billingStatus: BillingStatus.BLOCKED,
        billingBlockingReasons: ["Accessorial missing proof", "Accessorial pending resolution"],
      },
    });
  }

  const extraDocTypes: DocType[] = [DocType.BOL, DocType.LUMPER, DocType.SCALE, DocType.DETENTION, DocType.OTHER];
  for (const [index, docType] of extraDocTypes.entries()) {
    const load = loads[index];
    if (!load) continue;
    await prisma.document.create({
      data: {
        orgId: org.id,
        loadId: load.id,
        type: docType,
        status: "UPLOADED",
        filename: `${docType.toLowerCase()}_${load.id}.pdf`,
        originalName: `${docType}.pdf`,
        mimeType: "application/pdf",
        size: 8456,
        uploadedById: createdBy.id,
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

  const now = new Date();
  const expiringSoon = new Date(Date.now() + 1000 * 60 * 60 * 24 * 21);
  const expired = new Date(Date.now() - 1000 * 60 * 60 * 24 * 14);
  const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 180);

  const vaultDocs: Array<{
    docType: VaultDocType;
    scopeType: VaultScopeType;
    scopeId?: string | null;
    expiresAt?: Date | null;
    referenceNumber?: string | null;
    notes?: string | null;
    label: string;
  }> = [
    { docType: VaultDocType.INSURANCE, scopeType: VaultScopeType.ORG, expiresAt: expiringSoon, referenceNumber: "POL-1001", label: "Company insurance" },
    { docType: VaultDocType.CARGO_INSURANCE, scopeType: VaultScopeType.ORG, expiresAt: null, referenceNumber: "CARGO-9921", label: "Cargo insurance (needs details)" },
    { docType: VaultDocType.LIABILITY, scopeType: VaultScopeType.ORG, expiresAt: farFuture, label: "Liability policy" },
    { docType: VaultDocType.IFTA, scopeType: VaultScopeType.ORG, expiresAt: farFuture, label: "IFTA filing" },
    { docType: VaultDocType.OTHER, scopeType: VaultScopeType.ORG, expiresAt: null, label: "Safety checklist" },
  ];

  const inboundTruck = inboundTrucks[0];
  const outboundTruck = outboundTrucks[0];
  if (inboundTruck) {
    vaultDocs.push({
      docType: VaultDocType.REGISTRATION,
      scopeType: VaultScopeType.TRUCK,
      scopeId: inboundTruck.id,
      expiresAt: expired,
      label: `Inbound truck registration ${inboundTruck.unit}`,
    });
    vaultDocs.push({
      docType: VaultDocType.TITLE,
      scopeType: VaultScopeType.TRUCK,
      scopeId: inboundTruck.id,
      expiresAt: farFuture,
      label: `Inbound truck title ${inboundTruck.unit}`,
    });
  }
  if (outboundTruck) {
    vaultDocs.push({
      docType: VaultDocType.PERMIT,
      scopeType: VaultScopeType.TRUCK,
      scopeId: outboundTruck.id,
      expiresAt: expiringSoon,
      label: `Outbound truck permit ${outboundTruck.unit}`,
    });
  }

  const inboundDriver = drivers[0];
  const outboundDriver = drivers[INBOUND_TRUCKS] ?? drivers[1];
  if (inboundDriver) {
    vaultDocs.push({
      docType: VaultDocType.PERMIT,
      scopeType: VaultScopeType.DRIVER,
      scopeId: inboundDriver.id,
      expiresAt: expiringSoon,
      label: `Inbound driver permit ${inboundDriver.name}`,
    });
  }
  if (outboundDriver) {
    vaultDocs.push({
      docType: VaultDocType.OTHER,
      scopeType: VaultScopeType.DRIVER,
      scopeId: outboundDriver.id,
      expiresAt: null,
      label: `Outbound driver document ${outboundDriver.name}`,
      notes: "Demo document",
    });
  }

  for (const doc of vaultDocs) {
    const id = crypto.randomUUID();
    const filename = `${doc.docType.toLowerCase()}-${id.slice(0, 8)}.txt`;
    const storageKey = await writeVaultFile(
      org.id,
      id,
      filename,
      `Vault document\nType: ${doc.docType}\nLabel: ${doc.label}\n`
    );
    await prisma.vaultDocument.create({
      data: {
        id,
        orgId: org.id,
        scopeType: doc.scopeType,
        scopeId: doc.scopeId ?? null,
        docType: doc.docType,
        filename,
        originalName: filename,
        mimeType: "text/plain",
        size: 120,
        storageKey,
        expiresAt: doc.expiresAt ?? null,
        referenceNumber: doc.referenceNumber ?? null,
        notes: doc.notes ?? null,
        uploadedById: admin.id,
      },
    });
  }

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
