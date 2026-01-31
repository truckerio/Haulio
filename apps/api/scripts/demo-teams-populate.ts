import "../src/lib/env";
import { prisma, Prisma, LoadStatus, StopStatus, StopType, TrailerType, TrailerStatus, TruckStatus, DriverStatus, LoadType, LoadBusinessType, InvoiceStatus, DocType, DocStatus, DocSource, Role, EventType, TaskStatus, TaskPriority, TaskType, TeamEntityType } from "@truckerio/db";
import bcrypt from "bcryptjs";
import { allocateLoadAndTripNumbers } from "../src/lib/sequences";
import { ensureDefaultTeamForOrg } from "../src/lib/team-scope";

const TEAM_COUNT = 10;
const DISPATCHERS_PER_TEAM = 2;
const TRUCKS_PER_TEAM = 20;
const TRAILERS_PER_TEAM = 20;
const DRIVERS_PER_TEAM = 20;
const LOADS_PER_TEAM = 20;

const LOAD_DISTRIBUTION = {
  completed: 10,
  inTransit: 5,
  planned: 5,
};

const LOCATIONS = [
  { name: "Pacific Cold Storage", city: "Fresno", state: "CA", zip: "93722", address: "2870 W Herndon Ave" },
  { name: "Desert Distribution", city: "Phoenix", state: "AZ", zip: "85043", address: "4550 W Lower Buckeye Rd" },
  { name: "Summit Foods DC", city: "Denver", state: "CO", zip: "80216", address: "4900 E 48th Ave" },
  { name: "Lone Star Retail", city: "Dallas", state: "TX", zip: "75212", address: "3400 Singleton Blvd" },
  { name: "Heartland Produce", city: "Kansas City", state: "MO", zip: "64161", address: "1201 NW Lou Holland Dr" },
  { name: "Great Lakes Beverage", city: "Chicago", state: "IL", zip: "60616", address: "2600 S Dr Martin Luther King Jr Dr" },
  { name: "Smoky Mountain Paper", city: "Knoxville", state: "TN", zip: "37921", address: "2200 Western Ave" },
  { name: "Atlantic Importers", city: "Savannah", state: "GA", zip: "31407", address: "200 Bourne Ave" },
  { name: "Blue Ridge Medical", city: "Charlotte", state: "NC", zip: "28214", address: "5200 Wilkinson Blvd" },
  { name: "Seaboard Furniture", city: "Norfolk", state: "VA", zip: "23523", address: "1300 E Indian River Rd" },
  { name: "Garden State Grocers", city: "Newark", state: "NJ", zip: "07114", address: "1200 McCarter Hwy" },
  { name: "Tri-State Aggregates", city: "Pittsburgh", state: "PA", zip: "15219", address: "900 Liberty Ave" },
  { name: "Front Range Logistics", city: "Salt Lake City", state: "UT", zip: "84104", address: "2000 S 900 W" },
  { name: "Gulf Coast Imports", city: "Houston", state: "TX", zip: "77029", address: "8300 N Loop E" },
];

const CUSTOMER_NAMES = [
  "Horizon Foods",
  "Summit Hardware",
  "Blue Ridge Pharmaceuticals",
  "Atlantic Distribution",
  "Peak Packaging",
  "Sunset Beverages",
  "Northwind Grocery",
  "IronGate Materials",
  "Evergreen Retail",
  "Lone Star Manufacturing",
  "Coastal Imports",
  "Prairie Fresh",
  "Midwest Home Goods",
  "Southern Poultry",
  "Union Paper",
];

function pick<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function getOrg() {
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) throw new Error("No organization found.");
  return org;
}

async function ensureOrgSettings(orgId: string) {
  const existing = await prisma.orgSettings.findFirst({ where: { orgId } });
  if (existing) return existing;
  return prisma.orgSettings.create({
    data: {
      orgId,
      companyDisplayName: "Demo Transport",
      remitToAddress: "1200 Logistics Way, Dallas, TX 75247",
      currency: "USD",
      operatingMode: "CARRIER",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thank you for your business",
      invoicePrefix: "INV-",
      nextInvoiceNumber: 1001,
      podRequireSignature: true,
      podRequirePrintedName: true,
      podRequireDeliveryDate: true,
      podMinPages: 1,
      requiredDocs: ["POD"],
      requiredDriverDocs: ["CDL", "MED_CARD"],
      collectPodDueMinutes: 0,
      missingPodAfterMinutes: 0,
      reminderFrequencyMinutes: 0,
      freeStorageMinutes: 0,
      storageRatePerDay: new Prisma.Decimal(0),
      pickupFreeDetentionMinutes: 120,
      deliveryFreeDetentionMinutes: 120,
      detentionRatePerHour: null,
      driverRatePerMile: new Prisma.Decimal(0.6),
      trackingPreference: "MANUAL",
      settlementSchedule: "WEEKLY",
      timezone: "America/Chicago",
    },
  });
}

async function ensureOperatingEntities(orgId: string) {
  await prisma.operatingEntity.deleteMany({ where: { orgId } });
  const carrier = await prisma.operatingEntity.create({
    data: {
      orgId,
      name: "Demo Transport LLC",
      type: "CARRIER",
      addressLine1: "1200 Logistics Way",
      city: "Dallas",
      state: "TX",
      zip: "75247",
      phone: "214-555-0110",
      email: "ops@demotransport.com",
      mcNumber: "MC123456",
      dotNumber: "DOT987654",
      remitToName: "Demo Transport LLC",
      remitToAddressLine1: "1200 Logistics Way",
      remitToCity: "Dallas",
      remitToState: "TX",
      remitToZip: "75247",
      isDefault: true,
    },
  });
  const broker = await prisma.operatingEntity.create({
    data: {
      orgId,
      name: "Demo Brokerage LLC",
      type: "BROKER",
      addressLine1: "4300 Commerce Blvd",
      city: "Dallas",
      state: "TX",
      zip: "75247",
      phone: "214-555-0199",
      email: "broker@demobrokerage.com",
      mcNumber: "MC654321",
      dotNumber: "DOT123789",
      remitToName: "Demo Brokerage LLC",
      remitToAddressLine1: "4300 Commerce Blvd",
      remitToCity: "Dallas",
      remitToState: "TX",
      remitToZip: "75247",
      isDefault: false,
    },
  });
  return { carrier, broker };
}

async function purgeOrg(orgId: string, adminId: string) {
  await prisma.$transaction([
    prisma.teamAssignment.deleteMany({ where: { orgId } }),
    prisma.teamMember.deleteMany({ where: { orgId } }),
    prisma.team.deleteMany({ where: { orgId } }),
    prisma.task.deleteMany({ where: { orgId } }),
    prisma.event.deleteMany({ where: { orgId } }),
    prisma.document.deleteMany({ where: { orgId } }),
    prisma.invoiceLineItem.deleteMany({ where: { invoice: { orgId } } }),
    prisma.invoice.deleteMany({ where: { orgId } }),
    prisma.loadCharge.deleteMany({ where: { orgId } }),
    prisma.loadLeg.deleteMany({ where: { orgId } }),
    prisma.stop.deleteMany({ where: { orgId } }),
    prisma.load.deleteMany({ where: { orgId } }),
    prisma.trailer.deleteMany({ where: { orgId } }),
    prisma.truck.deleteMany({ where: { orgId } }),
    prisma.driver.deleteMany({ where: { orgId } }),
    prisma.customer.deleteMany({ where: { orgId } }),
    prisma.user.deleteMany({ where: { orgId, id: { not: adminId } } }),
    prisma.onboardingState.deleteMany({ where: { orgId } }),
  ]);
}

async function createCustomers(orgId: string) {
  const customers: Array<{ id: string; name: string }> = [];
  for (const name of CUSTOMER_NAMES) {
    const customer = await prisma.customer.create({
      data: {
        orgId,
        name,
        billingEmail: `ap@${name.toLowerCase().replace(/\s+/g, "")}.com`,
        billingPhone: `312-555-${randomBetween(1000, 9999)}`,
        remitToAddress: `${randomBetween(100, 999)} Commerce St`,
        termsDays: 30,
      },
    });
    customers.push({ id: customer.id, name: customer.name });
  }
  return customers;
}

async function createTeams(orgId: string) {
  const teams: Array<{ id: string; name: string }> = [];
  for (let i = 1; i <= TEAM_COUNT; i += 1) {
    const team = await prisma.team.create({
      data: { orgId, name: `Team ${i}`, active: true },
    });
    teams.push({ id: team.id, name: team.name });
  }
  return teams;
}

async function createDispatchers(orgId: string, teams: Array<{ id: string; name: string }>) {
  const passwordHash = await bcrypt.hash("dispatch123", 10);
  const dispatchers: Array<{ id: string; teamId: string }> = [];
  let index = 0;
  for (const team of teams) {
    for (let i = 0; i < DISPATCHERS_PER_TEAM; i += 1) {
      index += 1;
      const email = `dispatch${index}@demotransport.com`;
      const user = await prisma.user.create({
        data: {
          orgId,
          email,
          name: `Dispatcher ${index}`,
          role: Role.DISPATCHER,
          passwordHash,
          defaultTeamId: team.id,
        },
      });
      await prisma.teamMember.create({
        data: {
          orgId,
          teamId: team.id,
          userId: user.id,
        },
      });
      dispatchers.push({ id: user.id, teamId: team.id });
    }
  }

  const headDispatcher = await prisma.user.create({
    data: {
      orgId,
      email: "head.dispatch@demotransport.com",
      name: "Head Dispatcher",
      role: Role.DISPATCHER,
      passwordHash,
      canSeeAllTeams: true,
    },
  });

  return { dispatchers, headDispatcher };
}

async function createDrivers(orgId: string, teamId: string, offset: number) {
  const passwordHash = await bcrypt.hash("driver123", 10);
  const drivers: Array<{ id: string; name: string }> = [];
  for (let i = 1; i <= DRIVERS_PER_TEAM; i += 1) {
    const idx = offset + i;
    const name = `Driver ${idx}`;
    const email = `driver${idx}@demotransport.com`;
    const user = await prisma.user.create({
      data: {
        orgId,
        email,
        name,
        role: Role.DRIVER,
        passwordHash,
        defaultTeamId: teamId,
      },
    });
    const driver = await prisma.driver.create({
      data: {
        orgId,
        userId: user.id,
        name,
        status: DriverStatus.AVAILABLE,
        phone: `214-555-${randomBetween(1000, 9999)}`,
        license: `TX${randomBetween(1000000, 9999999)}`,
        licenseState: "TX",
        licenseExpiresAt: daysFromNow(365 * 2),
        medCardExpiresAt: daysFromNow(365),
        payRatePerMile: new Prisma.Decimal(0.62),
      },
    });
    await prisma.teamAssignment.create({
      data: {
        orgId,
        teamId,
        entityType: TeamEntityType.DRIVER,
        entityId: driver.id,
      },
    });
    drivers.push({ id: driver.id, name: driver.name });
  }
  return drivers;
}

async function createTrucks(orgId: string, teamId: string, offset: number) {
  const trucks: Array<{ id: string; unit: string }> = [];
  for (let i = 1; i <= TRUCKS_PER_TEAM; i += 1) {
    const unit = `T${offset}-${i.toString().padStart(2, "0")}`;
    const truck = await prisma.truck.create({
      data: {
        orgId,
        unit,
        vin: `1HTMKADN${randomBetween(100000, 999999)}${offset}${i}`,
        plate: `TX${randomBetween(1000, 9999)}`,
        plateState: "TX",
        status: TruckStatus.AVAILABLE,
      },
    });
    await prisma.teamAssignment.create({
      data: {
        orgId,
        teamId,
        entityType: TeamEntityType.TRUCK,
        entityId: truck.id,
      },
    });
    trucks.push({ id: truck.id, unit: truck.unit });
  }
  return trucks;
}

async function createTrailers(orgId: string, teamId: string, offset: number) {
  const trailers: Array<{ id: string; unit: string }> = [];
  const types = [TrailerType.DRY_VAN, TrailerType.REEFER, TrailerType.FLATBED, TrailerType.OTHER];
  for (let i = 1; i <= TRAILERS_PER_TEAM; i += 1) {
    const unit = `TR${offset}-${i.toString().padStart(2, "0")}`;
    const trailer = await prisma.trailer.create({
      data: {
        orgId,
        unit,
        type: types[i % types.length],
        plate: `TX${randomBetween(1000, 9999)}`,
        plateState: "TX",
        status: TrailerStatus.AVAILABLE,
      },
    });
    await prisma.teamAssignment.create({
      data: {
        orgId,
        teamId,
        entityType: TeamEntityType.TRAILER,
        entityId: trailer.id,
      },
    });
    trailers.push({ id: trailer.id, unit: trailer.unit });
  }
  return trailers;
}

async function createLoads(params: {
  orgId: string;
  adminId: string;
  teamId: string;
  carrierEntityId: string;
  brokerEntityId: string;
  customers: Array<{ id: string; name: string }>;
  drivers: Array<{ id: string; name: string }>;
  trucks: Array<{ id: string; unit: string }>;
  trailers: Array<{ id: string; unit: string }>;
  invoiceNumberRef: { value: number };
}) {
  const { orgId, adminId, teamId, carrierEntityId, brokerEntityId, customers, drivers, trucks, trailers, invoiceNumberRef } = params;

  let driverIndex = 0;
  let truckIndex = 0;
  let trailerIndex = 0;

  const statuses: Array<{ status: LoadStatus; count: number }> = [
    { status: LoadStatus.PAID, count: LOAD_DISTRIBUTION.completed / 2 },
    { status: LoadStatus.INVOICED, count: LOAD_DISTRIBUTION.completed / 2 },
    { status: LoadStatus.IN_TRANSIT, count: LOAD_DISTRIBUTION.inTransit },
    { status: LoadStatus.PLANNED, count: LOAD_DISTRIBUTION.planned },
  ];

  for (const group of statuses) {
    for (let i = 0; i < group.count; i += 1) {
      const isBrokered = Math.random() < 0.3;
      const customer = pick(customers);
      const pickup = pick(LOCATIONS);
      const delivery = pick(LOCATIONS.filter((loc) => loc !== pickup));
      const miles = randomBetween(300, 1800);
      const linehaul = randomBetween(1400, 4200);

      const { loadNumber, tripNumber } = await allocateLoadAndTripNumbers(orgId);

      const assignedDriver = drivers[driverIndex % drivers.length];
      const assignedTruck = trucks[truckIndex % trucks.length];
      const assignedTrailer = trailers[trailerIndex % trailers.length];

      driverIndex += 1;
      truckIndex += 1;
      trailerIndex += 1;

      const plannedAt = group.status === LoadStatus.PLANNED ? daysFromNow(randomBetween(1, 7)) : daysAgo(randomBetween(1, 20));
      const pickupAppointment = new Date(plannedAt.getTime() + 4 * 60 * 60 * 1000);
      const deliveryAppointment = new Date(plannedAt.getTime() + randomBetween(24, 60) * 60 * 60 * 1000);
      const deliveredAt = group.status === LoadStatus.PAID || group.status === LoadStatus.INVOICED
        ? new Date(deliveryAppointment.getTime() + randomBetween(1, 6) * 60 * 60 * 1000)
        : null;

      const load = await prisma.load.create({
        data: {
          orgId,
          loadNumber,
          tripNumber,
          status: group.status,
          loadType: isBrokered ? LoadType.BROKERED : LoadType.COMPANY,
          businessType: isBrokered ? LoadBusinessType.BROKER : LoadBusinessType.COMPANY,
          operatingEntityId: isBrokered ? brokerEntityId : carrierEntityId,
          customerId: customer.id,
          customerName: customer.name,
          miles,
          rate: new Prisma.Decimal(linehaul),
          assignedDriverId: group.status === LoadStatus.PLANNED ? null : assignedDriver.id,
          truckId: group.status === LoadStatus.PLANNED ? null : assignedTruck.id,
          trailerId: group.status === LoadStatus.PLANNED ? null : assignedTrailer.id,
          assignedDriverAt: group.status === LoadStatus.PLANNED ? null : daysAgo(randomBetween(1, 10)),
          assignedTruckAt: group.status === LoadStatus.PLANNED ? null : daysAgo(randomBetween(1, 10)),
          assignedTrailerAt: group.status === LoadStatus.PLANNED ? null : daysAgo(randomBetween(1, 10)),
          plannedAt,
          deliveredAt: deliveredAt ?? undefined,
          podVerifiedAt: deliveredAt ? new Date(deliveredAt.getTime() + 2 * 60 * 60 * 1000) : null,
          createdById: adminId,
          notes: "Auto-generated team demo load",
        },
      });

      await prisma.teamAssignment.create({
        data: {
          orgId,
          teamId,
          entityType: TeamEntityType.LOAD,
          entityId: load.id,
        },
      });

      const pickupStop = await prisma.stop.create({
        data: {
          orgId,
          loadId: load.id,
          type: StopType.PICKUP,
          status: group.status === LoadStatus.PLANNED ? StopStatus.PLANNED : StopStatus.DEPARTED,
          name: pickup.name,
          address: pickup.address,
          city: pickup.city,
          state: pickup.state,
          zip: pickup.zip,
          appointmentStart: pickupAppointment,
          appointmentEnd: new Date(pickupAppointment.getTime() + 2 * 60 * 60 * 1000),
          arrivedAt: group.status === LoadStatus.PLANNED ? null : new Date(pickupAppointment.getTime() - 30 * 60 * 1000),
          departedAt: group.status === LoadStatus.PLANNED ? null : new Date(pickupAppointment.getTime() + 30 * 60 * 1000),
          sequence: 1,
        },
      });

      const deliveryStop = await prisma.stop.create({
        data: {
          orgId,
          loadId: load.id,
          type: StopType.DELIVERY,
          status:
            group.status === LoadStatus.PLANNED
              ? StopStatus.PLANNED
              : group.status === LoadStatus.IN_TRANSIT
                ? StopStatus.PLANNED
                : StopStatus.DEPARTED,
          name: delivery.name,
          address: delivery.address,
          city: delivery.city,
          state: delivery.state,
          zip: delivery.zip,
          appointmentStart: deliveryAppointment,
          appointmentEnd: new Date(deliveryAppointment.getTime() + 2 * 60 * 60 * 1000),
          arrivedAt: deliveredAt ? new Date(deliveryAppointment.getTime() - 20 * 60 * 1000) : null,
          departedAt: deliveredAt ? deliveredAt : null,
          sequence: 2,
        },
      });

      await prisma.loadCharge.createMany({
        data: [
          {
            orgId,
            loadId: load.id,
            type: "LINEHAUL",
            description: "Linehaul",
            amountCents: Math.round(Number(linehaul) * 100),
          },
          {
            orgId,
            loadId: load.id,
            type: "OTHER",
            description: "Fuel surcharge",
            amountCents: randomBetween(80, 240) * 100,
          },
        ],
      });

      if (isBrokered) {
        await prisma.document.create({
          data: {
            orgId,
            loadId: load.id,
            type: DocType.RATECON,
            status: DocStatus.VERIFIED,
            source: DocSource.OPS_UPLOAD,
            filename: `${loadNumber}_ratecon.pdf`,
            originalName: "ratecon.pdf",
            mimeType: "application/pdf",
            size: randomBetween(120000, 220000),
            uploadedById: adminId,
            verifiedById: adminId,
            verifiedAt: new Date(),
          },
        });
      }

      if (group.status === LoadStatus.PAID || group.status === LoadStatus.INVOICED) {
        await prisma.document.create({
          data: {
            orgId,
            loadId: load.id,
            stopId: deliveryStop.id,
            type: DocType.POD,
            status: DocStatus.VERIFIED,
            source: DocSource.DRIVER_UPLOAD,
            filename: `${loadNumber}_pod.pdf`,
            originalName: "pod.pdf",
            mimeType: "application/pdf",
            size: randomBetween(90000, 180000),
            uploadedById: adminId,
            verifiedById: adminId,
            verifiedAt: deliveredAt ?? new Date(),
          },
        });
      }

      if (group.status === LoadStatus.INVOICED || group.status === LoadStatus.PAID) {
        const invoiceNumber = invoiceNumberRef.value;
        const invoice = await prisma.invoice.create({
          data: {
            orgId,
            loadId: load.id,
            invoiceNumber: `INV-${invoiceNumber}`,
            status: group.status === LoadStatus.PAID ? InvoiceStatus.PAID : InvoiceStatus.INVOICED,
            totalAmount: new Prisma.Decimal(linehaul),
            generatedAt: deliveredAt ?? new Date(),
            sentAt: deliveredAt ? new Date(deliveredAt.getTime() + 2 * 60 * 60 * 1000) : undefined,
            paidAt: group.status === LoadStatus.PAID ? new Date() : undefined,
          },
        });

        await prisma.invoiceLineItem.createMany({
          data: [
            {
              invoiceId: invoice.id,
              code: "LINEHAUL",
              description: "Linehaul",
              quantity: new Prisma.Decimal(1),
              rate: new Prisma.Decimal(linehaul),
              amount: new Prisma.Decimal(linehaul),
            },
            {
              invoiceId: invoice.id,
              code: "FSC",
              description: "Fuel surcharge",
              quantity: new Prisma.Decimal(1),
              rate: new Prisma.Decimal(150),
              amount: new Prisma.Decimal(150),
            },
          ],
        });

        await prisma.event.create({
          data: {
            orgId,
            loadId: load.id,
            invoiceId: invoice.id,
            type: EventType.INVOICE_GENERATED,
            message: `Invoice ${invoiceNumber} generated`,
          },
        });

        invoiceNumberRef.value += 1;
      }

      if (group.status === LoadStatus.IN_TRANSIT) {
        await prisma.task.create({
          data: {
            orgId,
            loadId: load.id,
            type: TaskType.MISSING_DOC,
            title: "Check POD status",
            status: TaskStatus.OPEN,
            priority: TaskPriority.MED,
            dueAt: daysFromNow(2),
          },
        });
      }

      const events = [
        {
          orgId,
          loadId: load.id,
          type: EventType.LOAD_CREATED,
          message: `Load ${loadNumber} created`,
          userId: adminId,
        },
      ];
      if (pickupStop.status !== StopStatus.PLANNED) {
        events.push({
          orgId,
          loadId: load.id,
          stopId: pickupStop.id,
          type: pickupStop.status === StopStatus.DEPARTED ? EventType.STOP_DEPARTED : EventType.STOP_ARRIVED,
          message: `${pickupStop.name} ${pickupStop.status.toLowerCase()}`,
        });
      }
      if (deliveryStop.status !== StopStatus.PLANNED) {
        events.push({
          orgId,
          loadId: load.id,
          stopId: deliveryStop.id,
          type: deliveryStop.status === StopStatus.DEPARTED ? EventType.STOP_DEPARTED : EventType.STOP_ARRIVED,
          message: `${deliveryStop.name} ${deliveryStop.status.toLowerCase()}`,
        });
      }
      await prisma.event.createMany({ data: events });

      await prisma.auditLog.create({
        data: {
          orgId,
          userId: adminId,
          action: "LOAD_CREATED",
          entity: "Load",
          entityId: load.id,
          summary: `Created load ${loadNumber}`,
        },
      });
    }
  }
}

async function finalizeOnboarding(orgId: string) {
  const completedSteps = ["basics", "operating", "team", "drivers", "fleet", "preferences", "tracking", "finance"];
  await prisma.onboardingState.upsert({
    where: { orgId },
    create: {
      orgId,
      status: "OPERATIONAL",
      completedSteps,
      percentComplete: 100,
      currentStep: completedSteps.length,
      completedAt: new Date(),
    },
    update: {
      status: "OPERATIONAL",
      completedSteps,
      percentComplete: 100,
      currentStep: completedSteps.length,
      completedAt: new Date(),
    },
  });
}

async function main() {
  const org = await getOrg();
  const admin = await prisma.user.findFirst({ where: { orgId: org.id, role: Role.ADMIN } });
  if (!admin) throw new Error("No admin user found.");

  await purgeOrg(org.id, admin.id);
  await ensureOrgSettings(org.id);
  const { carrier, broker } = await ensureOperatingEntities(org.id);

  const defaultTeam = await ensureDefaultTeamForOrg(org.id);
  await prisma.team.delete({ where: { id: defaultTeam.id } });

  const teams = await createTeams(org.id);
  await createDispatchers(org.id, teams);

  const customers = await createCustomers(org.id);
  const invoiceNumberRef = { value: 2000 };

  let teamIndex = 0;
  for (const team of teams) {
    teamIndex += 1;
    const drivers = await createDrivers(org.id, team.id, teamIndex * 100);
    const trucks = await createTrucks(org.id, team.id, teamIndex);
    const trailers = await createTrailers(org.id, team.id, teamIndex);

    await createLoads({
      orgId: org.id,
      adminId: admin.id,
      teamId: team.id,
      carrierEntityId: carrier.id,
      brokerEntityId: broker.id,
      customers,
      drivers,
      trucks,
      trailers,
      invoiceNumberRef,
    });
  }

  await finalizeOnboarding(org.id);

  console.log("Team-based demo org populated.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
