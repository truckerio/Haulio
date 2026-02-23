import "dotenv/config";
import { prisma, LoadStatus, MovementMode, TripStatus } from "@truckerio/db";

const TEST_TRIP_NUMBER = process.env.TEST_TRIP_NUMBER?.trim() || "TRIP-E2E-TEST";
const TEST_LOAD_NUMBERS = (process.env.TEST_LOAD_NUMBERS?.trim() || "EX-LTL-A1,EX-LTL-A2")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

async function resolveOrg() {
  const orgName = process.env.ORG_NAME?.trim();
  if (orgName) {
    const org = await prisma.organization.findFirst({
      where: { name: { equals: orgName, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });
    if (org) return org;
  }
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "desc" } });
  if (!org) throw new Error("No organization found");
  return org;
}

async function main() {
  const org = await resolveOrg();
  const [driver, truck, trailer, requestedLoads] = await Promise.all([
    prisma.driver.findFirst({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } }),
    prisma.truck.findFirst({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } }),
    prisma.trailer.findFirst({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } }),
    prisma.load.findMany({
      where: {
        orgId: org.id,
        loadNumber: { in: TEST_LOAD_NUMBERS },
      },
      select: { id: true, loadNumber: true },
      orderBy: { loadNumber: "asc" },
    }),
  ]);

  if (!driver || !truck || !trailer) {
    throw new Error("Missing required fleet records (driver/truck/trailer)");
  }

  let loads = requestedLoads;
  if (loads.length !== TEST_LOAD_NUMBERS.length) {
    const fallbackLoads = await prisma.load.findMany({
      where: {
        orgId: org.id,
        loadNumber: { startsWith: "EX-LTL-" },
      },
      select: { id: true, loadNumber: true },
      orderBy: { loadNumber: "asc" },
      take: 2,
    });

    if (fallbackLoads.length === 2) {
      loads = fallbackLoads;
      console.warn(
        `Requested loads not fully found. Falling back to: ${fallbackLoads.map((load) => load.loadNumber).join(", ")}`
      );
    } else {
      const found = new Set(requestedLoads.map((load) => load.loadNumber));
      const missing = TEST_LOAD_NUMBERS.filter((number) => !found.has(number));
      throw new Error(`Missing loads for test: ${missing.join(", ")}`);
    }
  }

  // Ensure each target load can be re-attached to this verification trip.
  await prisma.tripLoad.deleteMany({
    where: {
      orgId: org.id,
      loadId: { in: loads.map((load) => load.id) },
    },
  });

  const existing = await prisma.trip.findFirst({
    where: { orgId: org.id, tripNumber: TEST_TRIP_NUMBER },
    select: { id: true },
  });
  if (existing) {
    await prisma.tripLoad.deleteMany({ where: { tripId: existing.id } });
    await prisma.trip.delete({ where: { id: existing.id } });
  }

  const trip = await prisma.trip.create({
    data: {
      orgId: org.id,
      tripNumber: TEST_TRIP_NUMBER,
      status: TripStatus.ASSIGNED,
      movementMode: MovementMode.LTL,
      driverId: driver.id,
      truckId: truck.id,
      trailerId: trailer.id,
      origin: "Trip E2E Origin",
      destination: "Trip E2E Destination",
      loads: {
        create: loads.map((load, index) => ({
          orgId: org.id,
          loadId: load.id,
          sequence: index + 1,
        })),
      },
    },
    include: {
      loads: { include: { load: { select: { id: true, loadNumber: true } } }, orderBy: { sequence: "asc" } },
    },
  });

  await prisma.load.updateMany({
    where: { id: { in: loads.map((load) => load.id) } },
    data: {
      assignedDriverId: driver.id,
      truckId: truck.id,
      trailerId: trailer.id,
      status: LoadStatus.ASSIGNED,
    },
  });

  const verifyLoads = await prisma.load.findMany({
    where: { id: { in: loads.map((load) => load.id) } },
    select: {
      loadNumber: true,
      status: true,
      assignedDriverId: true,
      truckId: true,
      trailerId: true,
    },
    orderBy: { loadNumber: "asc" },
  });

  const ok = verifyLoads.every(
    (load) =>
      load.status === LoadStatus.ASSIGNED &&
      load.assignedDriverId === driver.id &&
      load.truckId === truck.id &&
      load.trailerId === trailer.id
  );

  console.log(
    JSON.stringify(
      {
        org: { id: org.id, name: org.name },
        testTripNumber: TEST_TRIP_NUMBER,
        testLoadNumbersUsed: loads.map((load) => load.loadNumber),
        createdTrip: {
          id: trip.id,
          status: trip.status,
          movementMode: trip.movementMode,
          loadNumbers: trip.loads.map((item) => item.load.loadNumber),
        },
        verification: {
          ok,
          loads: verifyLoads,
        },
      },
      null,
      2
    )
  );

  if (!ok) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
