import "dotenv/config";
import {
  prisma,
  DriverStatus,
  LoadStatus,
  LoadType,
  ManifestStatus,
  MovementMode,
  OperatingEntityType,
  StopType,
  TrailerStatus,
  TrailerType,
  TripStatus,
  TruckStatus,
} from "@truckerio/db";

const EXAMPLE_PREFIX = "EX-LTL-";

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

async function ensureFleet(orgId: string) {
  const driverNames = ["EX LTL Driver 01", "EX LTL Driver 02", "EX LTL Driver 03"];
  const truckUnits = ["EX-LTL-TRK-01", "EX-LTL-TRK-02", "EX-LTL-TRK-03"];
  const trailerUnits = ["EX-LTL-TRL-01", "EX-LTL-TRL-02", "EX-LTL-TRL-03"];

  for (const [index, name] of driverNames.entries()) {
    const existing = await prisma.driver.findFirst({
      where: { orgId, name },
      select: { id: true },
    });
    if (!existing) {
      await prisma.driver.create({
        data: {
          orgId,
          name,
          status: DriverStatus.AVAILABLE,
          phone: `+15550001${index + 1}`,
        },
      });
    }
  }

  for (const [index, unit] of truckUnits.entries()) {
    const existing = await prisma.truck.findFirst({
      where: { orgId, unit },
      select: { id: true },
    });
    if (!existing) {
      await prisma.truck.create({
        data: {
          orgId,
          unit,
          status: TruckStatus.AVAILABLE,
          plate: `EXLT${410 + index}`,
          plateState: "TX",
        },
      });
    }
  }

  for (const [index, unit] of trailerUnits.entries()) {
    const existing = await prisma.trailer.findFirst({
      where: { orgId, unit },
      select: { id: true },
    });
    if (!existing) {
      await prisma.trailer.create({
        data: {
          orgId,
          unit,
          type: TrailerType.DRY_VAN,
          status: TrailerStatus.AVAILABLE,
          plate: `EXLR${510 + index}`,
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

  return {
    drivers,
    trucks,
    trailers,
  };
}

type ExampleLoadSpec = {
  loadNumber: string;
  tripNumber: string;
  customerRef: string;
  notes: string;
  miles: number;
  rate: number;
  pickup: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    startOffsetHours: number;
    endOffsetHours: number;
  };
  delivery: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    startOffsetHours: number;
    endOffsetHours: number;
  };
};

async function upsertLtlLoad(params: {
  orgId: string;
  operatingEntityId: string;
  driverId: string;
  truckId: string;
  trailerId: string;
  spec: ExampleLoadSpec;
}) {
  const { orgId, operatingEntityId, driverId, truckId, trailerId, spec } = params;
  const now = new Date();

  const load = await prisma.load.upsert({
    where: { orgId_loadNumber: { orgId, loadNumber: spec.loadNumber } },
    update: {
      tripNumber: spec.tripNumber,
      status: LoadStatus.IN_TRANSIT,
      loadType: LoadType.COMPANY,
      movementMode: MovementMode.LTL,
      operatingEntityId,
      customerName: "Example Consolidation Customer",
      customerRef: spec.customerRef,
      notes: spec.notes,
      miles: spec.miles,
      rate: String(spec.rate),
      assignedDriverId: driverId,
      truckId,
      trailerId,
      assignedDriverAt: now,
      assignedTruckAt: now,
      assignedTrailerAt: now,
      plannedAt: now,
      deliveredAt: null,
      completedAt: null,
    },
    create: {
      orgId,
      loadNumber: spec.loadNumber,
      tripNumber: spec.tripNumber,
      status: LoadStatus.IN_TRANSIT,
      loadType: LoadType.COMPANY,
      movementMode: MovementMode.LTL,
      operatingEntityId,
      customerName: "Example Consolidation Customer",
      customerRef: spec.customerRef,
      notes: spec.notes,
      miles: spec.miles,
      rate: String(spec.rate),
      assignedDriverId: driverId,
      truckId,
      trailerId,
      assignedDriverAt: now,
      assignedTruckAt: now,
      assignedTrailerAt: now,
      plannedAt: now,
    },
    select: { id: true, loadNumber: true },
  });

  await prisma.stop.deleteMany({ where: { loadId: load.id } });
  await prisma.stop.createMany({
    data: [
      {
        orgId,
        loadId: load.id,
        type: StopType.PICKUP,
        name: spec.pickup.name,
        address: spec.pickup.address,
        city: spec.pickup.city,
        state: spec.pickup.state,
        zip: spec.pickup.zip,
        appointmentStart: atHoursFromNow(spec.pickup.startOffsetHours),
        appointmentEnd: atHoursFromNow(spec.pickup.endOffsetHours),
        sequence: 1,
      },
      {
        orgId,
        loadId: load.id,
        type: StopType.DELIVERY,
        name: spec.delivery.name,
        address: spec.delivery.address,
        city: spec.delivery.city,
        state: spec.delivery.state,
        zip: spec.delivery.zip,
        appointmentStart: atHoursFromNow(spec.delivery.startOffsetHours),
        appointmentEnd: atHoursFromNow(spec.delivery.endOffsetHours),
        sequence: 2,
      },
    ],
  });

  return load;
}

async function createManifest(params: {
  orgId: string;
  trailerId: string;
  truckId: string;
  driverId: string;
  origin: string;
  destination: string;
  itemLoadIds: string[];
  departHours: number;
  arriveHours: number;
}) {
  const manifest = await prisma.trailerManifest.create({
    data: {
      orgId: params.orgId,
      trailerId: params.trailerId,
      truckId: params.truckId,
      driverId: params.driverId,
      status: ManifestStatus.IN_TRANSIT,
      origin: params.origin,
      destination: params.destination,
      plannedDepartureAt: atHoursFromNow(params.departHours),
      plannedArrivalAt: atHoursFromNow(params.arriveHours),
    },
    select: { id: true, status: true, trailerId: true, truckId: true, driverId: true, origin: true, destination: true },
  });

  await prisma.trailerManifestItem.createMany({
    data: params.itemLoadIds.map((loadId) => ({ manifestId: manifest.id, loadId })),
  });

  return manifest;
}

async function upsertTripForLoads(params: {
  orgId: string;
  tripNumber: string;
  movementMode: MovementMode;
  status: TripStatus;
  driverId: string;
  truckId: string;
  trailerId: string;
  origin: string;
  destination: string;
  sourceManifestId?: string;
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
        sourceManifestId: params.sourceManifestId ?? null,
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
        sourceManifestId: params.sourceManifestId ?? null,
      },
      select: { id: true },
    });
    tripId = created.id;
  }

  // Keep each load attached to exactly one trip.
  await prisma.tripLoad.deleteMany({
    where: {
      orgId: params.orgId,
      loadId: { in: params.loadIds },
      tripId: { not: tripId },
    },
  });
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
      status: LoadStatus.IN_TRANSIT,
      assignedDriverId: params.driverId,
      truckId: params.truckId,
      trailerId: params.trailerId,
    },
  });

  return tripId;
}

async function clearOldExampleManifests(orgId: string) {
  const manifests = await prisma.trailerManifest.findMany({
    where: { orgId, origin: { startsWith: "EXAMPLE:" } },
    select: { id: true },
  });
  if (manifests.length === 0) return;
  const manifestIds = manifests.map((m) => m.id);
  await prisma.trailerManifestItem.deleteMany({ where: { manifestId: { in: manifestIds } } });
  await prisma.trailerManifest.deleteMany({ where: { id: { in: manifestIds } } });
}

async function main() {
  const org = await resolveOrg();
  const operatingEntity = await ensureOperatingEntity(org.id, org.name);
  const { drivers, trucks, trailers } = await ensureFleet(org.id);

  if (drivers.length < 3 || trucks.length < 3 || trailers.length < 3) {
    throw new Error("Unable to ensure at least 3 drivers, trucks, and trailers.");
  }

  await clearOldExampleManifests(org.id);

  const scenarioA = [
    {
      loadNumber: "EX-LTL-A1",
      tripNumber: "EX-TRIP-A1",
      customerRef: "EX-LTL-2IN1-A",
      notes: "LTL example: combined with EX-LTL-A2 into one trailer manifest.",
      miles: 312,
      rate: 980,
      pickup: {
        name: "LA Consolidation Yard - Dock 1",
        address: "1200 Harbor St",
        city: "Los Angeles",
        state: "CA",
        zip: "90021",
        startOffsetHours: 2,
        endOffsetHours: 3,
      },
      delivery: {
        name: "Phoenix DC",
        address: "4800 Distribution Ave",
        city: "Phoenix",
        state: "AZ",
        zip: "85043",
        startOffsetHours: 10,
        endOffsetHours: 11,
      },
    },
    {
      loadNumber: "EX-LTL-A2",
      tripNumber: "EX-TRIP-A2",
      customerRef: "EX-LTL-2IN1-A",
      notes: "LTL example: combined with EX-LTL-A1 into one trailer manifest.",
      miles: 318,
      rate: 1015,
      pickup: {
        name: "LA Consolidation Yard - Dock 2",
        address: "1200 Harbor St",
        city: "Los Angeles",
        state: "CA",
        zip: "90021",
        startOffsetHours: 2,
        endOffsetHours: 3,
      },
      delivery: {
        name: "Phoenix DC",
        address: "4800 Distribution Ave",
        city: "Phoenix",
        state: "AZ",
        zip: "85043",
        startOffsetHours: 10,
        endOffsetHours: 11,
      },
    },
  ] satisfies ExampleLoadSpec[];

  const scenarioB = [
    {
      loadNumber: "EX-LTL-B1",
      tripNumber: "EX-TRIP-B1",
      customerRef: "EX-SPLIT-4TO2-RUN1",
      notes: "Split example: part of Trailer Run 1 (B1 + B2).",
      miles: 146,
      rate: 620,
      pickup: {
        name: "Inland Crossdock",
        address: "3301 Freight Way",
        city: "Ontario",
        state: "CA",
        zip: "91761",
        startOffsetHours: 1,
        endOffsetHours: 2,
      },
      delivery: {
        name: "Dallas North Yard",
        address: "1200 Logistics Blvd",
        city: "Dallas",
        state: "TX",
        zip: "75247",
        startOffsetHours: 20,
        endOffsetHours: 21,
      },
    },
    {
      loadNumber: "EX-LTL-B2",
      tripNumber: "EX-TRIP-B2",
      customerRef: "EX-SPLIT-4TO2-RUN1",
      notes: "Split example: part of Trailer Run 1 (B1 + B2).",
      miles: 152,
      rate: 640,
      pickup: {
        name: "Inland Crossdock",
        address: "3301 Freight Way",
        city: "Ontario",
        state: "CA",
        zip: "91761",
        startOffsetHours: 1,
        endOffsetHours: 2,
      },
      delivery: {
        name: "Dallas North Yard",
        address: "1200 Logistics Blvd",
        city: "Dallas",
        state: "TX",
        zip: "75247",
        startOffsetHours: 20,
        endOffsetHours: 21,
      },
    },
    {
      loadNumber: "EX-LTL-B3",
      tripNumber: "EX-TRIP-B3",
      customerRef: "EX-SPLIT-4TO2-RUN2",
      notes: "Split example: part of Trailer Run 2 (B3 + B4).",
      miles: 159,
      rate: 680,
      pickup: {
        name: "Inland Crossdock",
        address: "3301 Freight Way",
        city: "Ontario",
        state: "CA",
        zip: "91761",
        startOffsetHours: 1,
        endOffsetHours: 2,
      },
      delivery: {
        name: "Fort Worth Yard",
        address: "8400 Intermodal Dr",
        city: "Fort Worth",
        state: "TX",
        zip: "76177",
        startOffsetHours: 20,
        endOffsetHours: 21,
      },
    },
    {
      loadNumber: "EX-LTL-B4",
      tripNumber: "EX-TRIP-B4",
      customerRef: "EX-SPLIT-4TO2-RUN2",
      notes: "Split example: part of Trailer Run 2 (B3 + B4).",
      miles: 162,
      rate: 700,
      pickup: {
        name: "Inland Crossdock",
        address: "3301 Freight Way",
        city: "Ontario",
        state: "CA",
        zip: "91761",
        startOffsetHours: 1,
        endOffsetHours: 2,
      },
      delivery: {
        name: "Fort Worth Yard",
        address: "8400 Intermodal Dr",
        city: "Fort Worth",
        state: "TX",
        zip: "76177",
        startOffsetHours: 20,
        endOffsetHours: 21,
      },
    },
  ] satisfies ExampleLoadSpec[];

  const [driver1, driver2, driver3] = drivers;
  const [truck1, truck2, truck3] = trucks;
  const [trailer1, trailer2, trailer3] = trailers;

  const [a1, a2] = await Promise.all(
    scenarioA.map((spec) =>
      upsertLtlLoad({
        orgId: org.id,
        operatingEntityId: operatingEntity.id,
        driverId: driver1.id,
        truckId: truck1.id,
        trailerId: trailer1.id,
        spec,
      })
    )
  );

  const [b1, b2] = await Promise.all(
    scenarioB.slice(0, 2).map((spec) =>
      upsertLtlLoad({
        orgId: org.id,
        operatingEntityId: operatingEntity.id,
        driverId: driver2.id,
        truckId: truck2.id,
        trailerId: trailer2.id,
        spec,
      })
    )
  );

  const [b3, b4] = await Promise.all(
    scenarioB.slice(2).map((spec) =>
      upsertLtlLoad({
        orgId: org.id,
        operatingEntityId: operatingEntity.id,
        driverId: driver3.id,
        truckId: truck3.id,
        trailerId: trailer3.id,
        spec,
      })
    )
  );

  const manifestA = await createManifest({
    orgId: org.id,
    trailerId: trailer1.id,
    truckId: truck1.id,
    driverId: driver1.id,
    origin: "EXAMPLE: LTL 2 loads -> 1 trailer",
    destination: "Phoenix DC",
    itemLoadIds: [a1.id, a2.id],
    departHours: 4,
    arriveHours: 14,
  });

  const manifestB1 = await createManifest({
    orgId: org.id,
    trailerId: trailer2.id,
    truckId: truck2.id,
    driverId: driver2.id,
    origin: "EXAMPLE: Split 4 loads -> Trailer Run 1",
    destination: "Dallas North Yard",
    itemLoadIds: [b1.id, b2.id],
    departHours: 3,
    arriveHours: 22,
  });

  const manifestB2 = await createManifest({
    orgId: org.id,
    trailerId: trailer3.id,
    truckId: truck3.id,
    driverId: driver3.id,
    origin: "EXAMPLE: Split 4 loads -> Trailer Run 2",
    destination: "Fort Worth Yard",
    itemLoadIds: [b3.id, b4.id],
    departHours: 3,
    arriveHours: 22,
  });

  const tripAId = await upsertTripForLoads({
    orgId: org.id,
    tripNumber: "EX-TRIP-LTL-A",
    movementMode: MovementMode.LTL,
    status: TripStatus.ASSIGNED,
    driverId: driver1.id,
    truckId: truck1.id,
    trailerId: trailer1.id,
    origin: "LA Consolidation Yard",
    destination: "Phoenix DC",
    sourceManifestId: manifestA.id,
    loadIds: [a1.id, a2.id],
  });
  const tripB1Id = await upsertTripForLoads({
    orgId: org.id,
    tripNumber: "EX-TRIP-LTL-B1",
    movementMode: MovementMode.LTL,
    status: TripStatus.ASSIGNED,
    driverId: driver2.id,
    truckId: truck2.id,
    trailerId: trailer2.id,
    origin: "Inland Crossdock",
    destination: "Dallas North Yard",
    sourceManifestId: manifestB1.id,
    loadIds: [b1.id, b2.id],
  });
  const tripB2Id = await upsertTripForLoads({
    orgId: org.id,
    tripNumber: "EX-TRIP-LTL-B2",
    movementMode: MovementMode.LTL,
    status: TripStatus.ASSIGNED,
    driverId: driver3.id,
    truckId: truck3.id,
    trailerId: trailer3.id,
    origin: "Inland Crossdock",
    destination: "Fort Worth Yard",
    sourceManifestId: manifestB2.id,
    loadIds: [b3.id, b4.id],
  });

  console.log(
    JSON.stringify(
      {
        org: { id: org.id, name: org.name },
        scenarioA: {
          description: "2 LTL loads consolidated onto 1 trailer dispatch",
          loads: [a1.loadNumber, a2.loadNumber],
          tripId: tripAId,
          manifestId: manifestA.id,
        },
        scenarioB: {
          description: "4 LTL loads split into 2 full trailer dispatches (2+2)",
          trailerRun1: {
            loads: [b1.loadNumber, b2.loadNumber],
            tripId: tripB1Id,
            manifestId: manifestB1.id,
          },
          trailerRun2: {
            loads: [b3.loadNumber, b4.loadNumber],
            tripId: tripB2Id,
            manifestId: manifestB2.id,
          },
        },
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
