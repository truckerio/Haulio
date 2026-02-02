import "dotenv/config";
import { prisma, LoadStatus } from "@truckerio/db";

const COMPLETED_STATUSES = [
  LoadStatus.DELIVERED,
  LoadStatus.POD_RECEIVED,
  LoadStatus.READY_TO_INVOICE,
  LoadStatus.INVOICED,
  LoadStatus.PAID,
  LoadStatus.CANCELLED,
];

async function main() {
  const loads = await prisma.load.findMany({
    where: {
      status: { in: COMPLETED_STATUSES },
      completedAt: null,
    },
    select: {
      id: true,
      status: true,
      deliveredAt: true,
      podVerifiedAt: true,
      createdAt: true,
    },
  });

  let updated = 0;
  for (const load of loads) {
    let completedAt = load.podVerifiedAt ?? load.deliveredAt ?? null;
    if (!completedAt) {
      const lastStop = await prisma.stop.findFirst({
        where: { loadId: load.id },
        orderBy: [{ departedAt: "desc" }, { arrivedAt: "desc" }],
        select: { departedAt: true, arrivedAt: true },
      });
      completedAt = lastStop?.departedAt ?? lastStop?.arrivedAt ?? null;
    }
    if (!completedAt) {
      completedAt = load.createdAt;
    }

    await prisma.load.update({
      where: { id: load.id },
      data: { completedAt },
    });
    updated += 1;
  }

  console.log(`Backfilled completedAt on ${updated} loads.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
