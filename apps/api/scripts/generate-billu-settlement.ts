import "dotenv/config";
import { prisma, Prisma } from "@truckerio/db";

const DRIVER_NAME = "billu";
const PERIOD_START = "2026-01-12";
const PERIOD_END = "2026-01-18";

function parseDate(value: string, endOfDay = false) {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  if (endOfDay) {
    date.setUTCHours(23, 59, 59, 999);
  } else {
    date.setUTCHours(0, 0, 0, 0);
  }
  return date;
}

async function main() {
  const org = await prisma.organization.findFirst({
    where: { name: { contains: "SPG Freight", mode: "insensitive" } },
  });
  if (!org) throw new Error("SPG Freight org not found.");

  const driver = await prisma.driver.findFirst({
    where: { orgId: org.id, name: { contains: DRIVER_NAME, mode: "insensitive" } },
  });
  if (!driver) throw new Error(`Driver '${DRIVER_NAME}' not found.`);

  const periodStart = parseDate(PERIOD_START);
  const periodEnd = parseDate(PERIOD_END, true);

  const existing = await prisma.settlement.findFirst({
    where: { orgId: org.id, driverId: driver.id, periodStart, periodEnd },
  });
  if (existing) {
    console.log(`Settlement already exists: ${existing.id}`);
    return;
  }

  const settings = await prisma.orgSettings.findFirst({ where: { orgId: org.id } });
  const rate = new Prisma.Decimal(driver.payRatePerMile ?? settings?.driverRatePerMile ?? 0);

  const loads = await prisma.load.findMany({
    where: {
      orgId: org.id,
      assignedDriverId: driver.id,
      deliveredAt: { gte: periodStart, lte: periodEnd },
    },
    select: { id: true, loadNumber: true, miles: true },
  });

  if (loads.length === 0) {
    console.log("No delivered loads in range.");
    return;
  }

  let gross = new Prisma.Decimal(0);
  const items = loads.map((load) => {
    const miles = new Prisma.Decimal(load.miles ?? 0);
    const amount = miles.mul(rate);
    gross = gross.plus(amount);
    return {
      loadId: load.id,
      code: "CPM",
      description: `Miles for ${load.loadNumber ?? load.id}`,
      amount,
    };
  });

  const settlement = await prisma.settlement.create({
    data: {
      orgId: org.id,
      driverId: driver.id,
      periodStart,
      periodEnd,
      gross,
      deductions: new Prisma.Decimal(0),
      net: gross,
      status: "DRAFT",
      items: { create: items },
    },
    include: { items: true },
  });

  console.log(`Created settlement ${settlement.id} for ${driver.name}.`);
  console.log(`Loads: ${loads.length} • Net: ${gross.toFixed(2)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
