import "dotenv/config";
import bcrypt from "bcryptjs";
import {
  prisma,
  DriverStatus,
  LoadStatus,
  LoadType,
  OperatingEntityType,
  Role,
  StopType,
  TrailerStatus,
  TrailerType,
  TruckStatus,
  UserStatus,
} from "@truckerio/db";

const pad = (n: number) => String(n).padStart(3, "0");

function numEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
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
  if (!org) throw new Error("No organization found");
  return org;
}

async function ensureOperatingEntity(orgId: string, name: string) {
  const existing = await prisma.operatingEntity.findFirst({
    where: { orgId, isDefault: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return prisma.operatingEntity.create({
    data: { orgId, name, type: OperatingEntityType.CARRIER, isDefault: true },
  });
}

async function ensureUser(params: {
  orgId: string;
  email: string;
  role: Role;
  name: string;
  passwordHash: string;
}) {
  const { orgId, email, role, name, passwordHash } = params;
  return prisma.user.upsert({
    where: { orgId_email: { orgId, email } },
    update: { role, isActive: true, status: UserStatus.ACTIVE, name, passwordHash },
    create: { orgId, email, role, name, passwordHash, status: UserStatus.ACTIVE, isActive: true },
  });
}

async function main() {
  const org = await resolveOrg();
  const op = await ensureOperatingEntity(org.id, org.name);

  const targetTrucks = numEnv("TARGET_TRUCKS", 10);
  const targetTrailers = numEnv("TARGET_TRAILERS", 10);
  const targetDrivers = numEnv("TARGET_DRIVERS", 15);
  const targetLoads = numEnv("TARGET_LOADS", 10);
  const targetDispatchers = numEnv("TARGET_DISPATCHERS", 10);

  const userPassword = process.env.SEED_PASSWORD?.trim() || "password123";
  if (userPassword.length < 6) {
    throw new Error("SEED_PASSWORD must be at least 6 characters.");
  }
  const passwordHash = await bcrypt.hash(userPassword, 10);

  const [truckCount, trailerCount, driverCount, loadCount, dispatcherCount] = await Promise.all([
    prisma.truck.count({ where: { orgId: org.id } }),
    prisma.trailer.count({ where: { orgId: org.id } }),
    prisma.driver.count({ where: { orgId: org.id } }),
    prisma.load.count({ where: { orgId: org.id } }),
    prisma.user.count({ where: { orgId: org.id, role: Role.DISPATCHER } }),
  ]);

  for (let i = truckCount + 1; i <= targetTrucks; i++) {
    await prisma.truck.create({
      data: {
        orgId: org.id,
        unit: `WR-TRK-${pad(i)}`,
        status: TruckStatus.AVAILABLE,
        plate: `TX${1000 + i}`,
        plateState: "TX",
      },
    });
  }

  for (let i = trailerCount + 1; i <= targetTrailers; i++) {
    await prisma.trailer.create({
      data: {
        orgId: org.id,
        unit: `WR-TRL-${pad(i)}`,
        type: TrailerType.DRY_VAN,
        status: TrailerStatus.AVAILABLE,
        plate: `TXT${2000 + i}`,
        plateState: "TX",
      },
    });
  }

  // Ensure driver users exist (useful for mobile/driver workflows) and link a Driver record.
  for (let i = driverCount + 1; i <= targetDrivers; i++) {
    const email = `driver${i}@wrath.test`;
    const user = await ensureUser({
      orgId: org.id,
      email,
      role: Role.DRIVER,
      name: `Driver ${i}`,
      passwordHash,
    });
    await prisma.driver.create({
      data: {
        orgId: org.id,
        userId: user.id,
        name: `Driver ${i}`,
        status: DriverStatus.AVAILABLE,
      },
    });
  }

  for (let i = dispatcherCount + 1; i <= targetDispatchers; i++) {
    const email = `dispatch${i}@wrath.test`;
    await ensureUser({
      orgId: org.id,
      email,
      role: Role.DISPATCHER,
      name: `Dispatcher ${i}`,
      passwordHash,
    });
  }

  const [trucks, trailers, drivers] = await Promise.all([
    prisma.truck.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "asc" }, select: { id: true } }),
    prisma.trailer.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
    prisma.driver.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "asc" }, select: { id: true } }),
  ]);

  for (let i = loadCount + 1; i <= targetLoads; i++) {
    const driver = drivers[(i - 1) % Math.max(1, drivers.length)];
    const truck = trucks[(i - 1) % Math.max(1, trucks.length)];
    const trailer = trailers[(i - 1) % Math.max(1, trailers.length)];

    const load = await prisma.load.create({
      data: {
        orgId: org.id,
        operatingEntityId: op.id,
        loadNumber: `WR-LOAD-${pad(i)}`,
        status: LoadStatus.PLANNED,
        loadType: LoadType.COMPANY,
        customerName: `Customer ${i}`,
        miles: 400 + i * 10,
        rate: String(1500 + i * 50),
        assignedDriverId: driver?.id,
        truckId: truck?.id,
        trailerId: trailer?.id,
        plannedAt: new Date(),
      },
    });

    await prisma.stop.createMany({
      data: [
        {
          orgId: org.id,
          loadId: load.id,
          type: StopType.PICKUP,
          name: `Pickup ${i}`,
          address: `${100 + i} Warehouse Rd`,
          city: "Dallas",
          state: "TX",
          zip: "75001",
          sequence: 1,
        },
        {
          orgId: org.id,
          loadId: load.id,
          type: StopType.DELIVERY,
          name: `Delivery ${i}`,
          address: `${500 + i} Commerce St`,
          city: "Houston",
          state: "TX",
          zip: "77001",
          sequence: 2,
        },
      ],
    });
  }

  const [finalTrucks, finalTrailers, finalDrivers, finalLoads, finalDispatchers] = await Promise.all([
    prisma.truck.count({ where: { orgId: org.id } }),
    prisma.trailer.count({ where: { orgId: org.id } }),
    prisma.driver.count({ where: { orgId: org.id } }),
    prisma.load.count({ where: { orgId: org.id } }),
    prisma.user.count({ where: { orgId: org.id, role: Role.DISPATCHER } }),
  ]);

  console.log(
    JSON.stringify(
      {
        org: { id: org.id, name: org.name },
        targets: {
          trucks: targetTrucks,
          trailers: targetTrailers,
          drivers: targetDrivers,
          dispatchers: targetDispatchers,
          loads: targetLoads,
        },
        actual: {
          trucks: finalTrucks,
          trailers: finalTrailers,
          drivers: finalDrivers,
          dispatchers: finalDispatchers,
          loads: finalLoads,
        },
        seedPassword: userPassword,
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
