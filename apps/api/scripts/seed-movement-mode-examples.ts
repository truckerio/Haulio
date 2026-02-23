import "dotenv/config";
import {
  prisma,
  DriverStatus,
  LoadStatus,
  LoadType,
  MovementMode,
  OperatingEntityType,
  Role,
  StopType,
  TrailerStatus,
  TrailerType,
  TripStatus,
  TruckStatus,
} from "@truckerio/db";

function atHoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function resolveOrg() {
  const orgId = process.env.ORG_ID?.trim();
  const orgName = process.env.ORG_NAME?.trim();

  if (orgId) {
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new Error(`ORG_ID not found: ${orgId}`);
    return org;
  }

  if (orgName) {
    const org = await prisma.organization.findFirst({
      where: { name: { equals: orgName, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });
    if (!org) throw new Error(`ORG_NAME not found: ${orgName}`);
    return org;
  }

  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "desc" } });
  if (!org) throw new Error("No organization found.");
  return org;
}

async function ensureOperatingEntity(orgId: string, orgName: string) {
  const existing = await prisma.operatingEntity.findFirst({
    where: { orgId, isDefault: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return prisma.operatingEntity.create({
    data: {
      orgId,
      name: orgName,
      type: OperatingEntityType.CARRIER,
      isDefault: true,
    },
  });
}

async function ensureMinimumFleet(orgId: string) {
  const driverNames = ["EX MV Driver 01", "EX MV Driver 02"];
  const truckUnits = ["EX-MV-TRK-01", "EX-MV-TRK-02"];
  const trailerUnits = ["EX-MV-TRL-01", "EX-MV-TRL-02"];

  for (const [index, name] of driverNames.entries()) {
    const existing = await prisma.driver.findFirst({ where: { orgId, name }, select: { id: true } });
    if (!existing) {
      await prisma.driver.create({
        data: {
          orgId,
          name,
          status: DriverStatus.AVAILABLE,
          phone: `+15550002${index + 1}`,
        },
      });
    }
  }
  for (const [index, unit] of truckUnits.entries()) {
    const existing = await prisma.truck.findFirst({ where: { orgId, unit }, select: { id: true } });
    if (!existing) {
      await prisma.truck.create({
        data: {
          orgId,
          unit,
          status: TruckStatus.AVAILABLE,
          plate: `EXMV${610 + index}`,
          plateState: "TX",
        },
      });
    }
  }
  for (const [index, unit] of trailerUnits.entries()) {
    const existing = await prisma.trailer.findFirst({ where: { orgId, unit }, select: { id: true } });
    if (!existing) {
      await prisma.trailer.create({
        data: {
          orgId,
          unit,
          type: TrailerType.DRY_VAN,
          status: TrailerStatus.AVAILABLE,
          plate: `EXMW${710 + index}`,
          plateState: "TX",
        },
      });
    }
  }

  const drivers = await prisma.driver.findMany({
    where: { orgId, name: { in: driverNames } },
    orderBy: { name: "asc" },
  });
  const trucks = await prisma.truck.findMany({
    where: { orgId, unit: { in: truckUnits } },
    orderBy: { unit: "asc" },
  });
  const trailers = await prisma.trailer.findMany({
    where: { orgId, unit: { in: trailerUnits } },
    orderBy: { unit: "asc" },
  });

  if (drivers.length < 2 || trucks.length < 2 || trailers.length < 2) {
    throw new Error("Unable to provision dedicated movement demo fleet.");
  }

  return { drivers, trucks, trailers };
}

async function upsertLoad(params: {
  orgId: string;
  operatingEntityId: string;
  loadNumber: string;
  tripNumber: string;
  movementMode: MovementMode;
  customerName: string;
  customerRef: string;
  notes: string;
  miles: number;
  rate: number;
  driverId: string;
  truckId: string;
  trailerId: string;
  pickup: { name: string; city: string; state: string; zip: string; startH: number; endH: number };
  delivery: { name: string; city: string; state: string; zip: string; startH: number; endH: number };
}) {
  const now = new Date();
  const load = await prisma.load.upsert({
    where: { orgId_loadNumber: { orgId: params.orgId, loadNumber: params.loadNumber } },
    update: {
      status: LoadStatus.ASSIGNED,
      loadType: LoadType.COMPANY,
      movementMode: params.movementMode,
      operatingEntityId: params.operatingEntityId,
      customerName: params.customerName,
      customerRef: params.customerRef,
      tripNumber: params.tripNumber,
      notes: params.notes,
      miles: params.miles,
      rate: String(params.rate),
      assignedDriverId: params.driverId,
      truckId: params.truckId,
      trailerId: params.trailerId,
      assignedDriverAt: now,
      assignedTruckAt: now,
      assignedTrailerAt: now,
      plannedAt: now,
      deliveredAt: null,
      completedAt: null,
    },
    create: {
      orgId: params.orgId,
      loadNumber: params.loadNumber,
      status: LoadStatus.ASSIGNED,
      loadType: LoadType.COMPANY,
      movementMode: params.movementMode,
      operatingEntityId: params.operatingEntityId,
      customerName: params.customerName,
      customerRef: params.customerRef,
      tripNumber: params.tripNumber,
      notes: params.notes,
      miles: params.miles,
      rate: String(params.rate),
      assignedDriverId: params.driverId,
      truckId: params.truckId,
      trailerId: params.trailerId,
      assignedDriverAt: now,
      assignedTruckAt: now,
      assignedTrailerAt: now,
      plannedAt: now,
    },
    select: { id: true, loadNumber: true, assignedDriverId: true },
  });

  await prisma.stop.deleteMany({ where: { loadId: load.id } });
  await prisma.stop.createMany({
    data: [
      {
        orgId: params.orgId,
        loadId: load.id,
        type: StopType.PICKUP,
        name: params.pickup.name,
        address: "100 Example Pickup Rd",
        city: params.pickup.city,
        state: params.pickup.state,
        zip: params.pickup.zip,
        appointmentStart: atHoursFromNow(params.pickup.startH),
        appointmentEnd: atHoursFromNow(params.pickup.endH),
        sequence: 1,
      },
      {
        orgId: params.orgId,
        loadId: load.id,
        type: StopType.DELIVERY,
        name: params.delivery.name,
        address: "900 Example Delivery Blvd",
        city: params.delivery.city,
        state: params.delivery.state,
        zip: params.delivery.zip,
        appointmentStart: atHoursFromNow(params.delivery.startH),
        appointmentEnd: atHoursFromNow(params.delivery.endH),
        sequence: 2,
      },
    ],
  });

  return load;
}

async function upsertTrip(params: {
  orgId: string;
  tripNumber: string;
  movementMode: MovementMode;
  status: TripStatus;
  driverId: string;
  truckId: string;
  trailerId: string;
  origin: string;
  destination: string;
  loadIds: string[];
}) {
  const existing = await prisma.trip.findUnique({
    where: { orgId_tripNumber: { orgId: params.orgId, tripNumber: params.tripNumber } },
    select: { id: true },
  });

  let tripId: string;
  if (existing) {
    tripId = existing.id;
    await prisma.tripLoad.deleteMany({ where: { tripId } });
    await prisma.trip.update({
      where: { id: tripId },
      data: {
        movementMode: params.movementMode,
        status: params.status,
        driverId: params.driverId,
        truckId: params.truckId,
        trailerId: params.trailerId,
        origin: params.origin,
        destination: params.destination,
      },
    });
  } else {
    const created = await prisma.trip.create({
      data: {
        orgId: params.orgId,
        tripNumber: params.tripNumber,
        movementMode: params.movementMode,
        status: params.status,
        driverId: params.driverId,
        truckId: params.truckId,
        trailerId: params.trailerId,
        origin: params.origin,
        destination: params.destination,
      },
      select: { id: true },
    });
    tripId = created.id;
  }

  await prisma.tripLoad.createMany({
    data: params.loadIds.map((loadId, index) => ({
      orgId: params.orgId,
      tripId,
      loadId,
      sequence: index + 1,
    })),
    skipDuplicates: true,
  });

  await prisma.load.updateMany({
    where: { id: { in: params.loadIds } },
    data: {
      status: LoadStatus.ASSIGNED,
      assignedDriverId: params.driverId,
      truckId: params.truckId,
      trailerId: params.trailerId,
    },
  });

  return tripId;
}

async function ensureLoadNote(params: {
  orgId: string;
  loadId: string;
  text: string;
  createdById: string;
  source: "OPS" | "DRIVER";
  visibility: "NORMAL" | "LOCKED";
}) {
  const existing = await prisma.loadNote.findFirst({
    where: {
      orgId: params.orgId,
      loadId: params.loadId,
      text: params.text,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const note = await prisma.loadNote.create({
    data: {
      orgId: params.orgId,
      loadId: params.loadId,
      text: params.text,
      createdById: params.createdById,
      source: params.source,
      visibility: params.visibility,
    },
    select: { id: true },
  });
  return note.id;
}

async function main() {
  const org = await resolveOrg();
  const operatingEntity = await ensureOperatingEntity(org.id, org.name);
  const { drivers, trucks, trailers } = await ensureMinimumFleet(org.id);

  const [adminUser, dispatchUser] = await Promise.all([
    prisma.user.findFirst({ where: { orgId: org.id, role: Role.ADMIN }, orderBy: { createdAt: "asc" } }),
    prisma.user.findFirst({ where: { orgId: org.id, role: Role.DISPATCHER }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!adminUser) throw new Error("No ADMIN user found in org.");
  const actorUserId = dispatchUser?.id ?? adminUser.id;

  const [driverA, driverB] = drivers;
  const [truckA, truckB] = trucks;
  const [trailerA, trailerB] = trailers;

  const ftlLoad = await upsertLoad({
    orgId: org.id,
    operatingEntityId: operatingEntity.id,
    loadNumber: "EX-FTL-001",
    tripNumber: "EX-FTL-001",
    movementMode: MovementMode.FTL,
    customerName: "Example FTL Customer",
    customerRef: "EX-FTL-CUSTOMER-001",
    notes: "FTL example load for trip-based assignment.",
    miles: 540,
    rate: 2450,
    driverId: driverA.id,
    truckId: truckA.id,
    trailerId: trailerA.id,
    pickup: { name: "Chicago Pickup", city: "Chicago", state: "IL", zip: "60608", startH: 3, endH: 4 },
    delivery: { name: "Nashville Delivery", city: "Nashville", state: "TN", zip: "37211", startH: 14, endH: 16 },
  });

  const poolLoadA = await upsertLoad({
    orgId: org.id,
    operatingEntityId: operatingEntity.id,
    loadNumber: "EX-POOL-001",
    tripNumber: "EX-POOL-001",
    movementMode: MovementMode.POOL_DISTRIBUTION,
    customerName: "Example Pool Customer",
    customerRef: "EX-POOL-REGION-ATL",
    notes: "Pool distribution stop bundle - order set A.",
    miles: 205,
    rate: 980,
    driverId: driverB.id,
    truckId: truckB.id,
    trailerId: trailerB.id,
    pickup: { name: "Atlanta Hub", city: "Atlanta", state: "GA", zip: "30336", startH: 2, endH: 3 },
    delivery: { name: "Atlanta North Pool", city: "Atlanta", state: "GA", zip: "30342", startH: 8, endH: 9 },
  });

  const poolLoadB = await upsertLoad({
    orgId: org.id,
    operatingEntityId: operatingEntity.id,
    loadNumber: "EX-POOL-002",
    tripNumber: "EX-POOL-002",
    movementMode: MovementMode.POOL_DISTRIBUTION,
    customerName: "Example Pool Customer",
    customerRef: "EX-POOL-REGION-ATL",
    notes: "Pool distribution stop bundle - order set B.",
    miles: 198,
    rate: 940,
    driverId: driverB.id,
    truckId: truckB.id,
    trailerId: trailerB.id,
    pickup: { name: "Atlanta Hub", city: "Atlanta", state: "GA", zip: "30336", startH: 2, endH: 3 },
    delivery: { name: "Atlanta East Pool", city: "Atlanta", state: "GA", zip: "30345", startH: 9, endH: 10 },
  });

  const ftlTripId = await upsertTrip({
    orgId: org.id,
    tripNumber: "EX-TRIP-FTL-001",
    movementMode: MovementMode.FTL,
    status: TripStatus.ASSIGNED,
    driverId: driverA.id,
    truckId: truckA.id,
    trailerId: trailerA.id,
    origin: "Chicago, IL",
    destination: "Nashville, TN",
    loadIds: [ftlLoad.id],
  });

  const poolTripId = await upsertTrip({
    orgId: org.id,
    tripNumber: "EX-TRIP-POOL-001",
    movementMode: MovementMode.POOL_DISTRIBUTION,
    status: TripStatus.ASSIGNED,
    driverId: driverB.id,
    truckId: truckB.id,
    trailerId: trailerB.id,
    origin: "Atlanta Hub",
    destination: "Atlanta Pool Route",
    loadIds: [poolLoadA.id, poolLoadB.id],
  });

  const driverNoteUserId = driverB.userId ?? actorUserId;
  await ensureLoadNote({
    orgId: org.id,
    loadId: poolLoadA.id,
    text: "Driver note: dock 12 requested call 30 minutes prior to arrival.",
    createdById: driverNoteUserId,
    source: "DRIVER",
    visibility: "NORMAL",
  });
  await ensureLoadNote({
    orgId: org.id,
    loadId: poolLoadA.id,
    text: "Admin lock note: customer requires photo proof for final stop.",
    createdById: adminUser.id,
    source: "OPS",
    visibility: "LOCKED",
  });

  const [tripCount, poolCount, ftlCount] = await Promise.all([
    prisma.trip.count({ where: { orgId: org.id } }),
    prisma.load.count({ where: { orgId: org.id, movementMode: MovementMode.POOL_DISTRIBUTION } }),
    prisma.load.count({ where: { orgId: org.id, movementMode: MovementMode.FTL } }),
  ]);

  console.log(
    JSON.stringify(
      {
        org: { id: org.id, name: org.name },
        createdOrUpdated: {
          trips: [
            { tripNumber: "EX-TRIP-FTL-001", tripId: ftlTripId, loads: ["EX-FTL-001"] },
            { tripNumber: "EX-TRIP-POOL-001", tripId: poolTripId, loads: ["EX-POOL-001", "EX-POOL-002"] },
          ],
          loadNotes: {
            loadNumber: "EX-POOL-001",
            normalDriverNote: true,
            lockedAdminNote: true,
          },
        },
        totals: {
          totalTrips: tripCount,
          totalFtlLoads: ftlCount,
          totalPoolDistributionLoads: poolCount,
        },
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
