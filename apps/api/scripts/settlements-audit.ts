import { prisma, Prisma, SettlementStatus, toDecimal } from "@truckerio/db";

type SettlementAuditRow = {
  id: string;
  driver: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  gross: string;
  net: string;
  items: number;
  reason: string;
};

function formatIdList(ids: string[]) {
  return ids.map((id) => `'${id}'`).join(", ");
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const shouldFix = args.has("--fix");

  const settlements = await prisma.settlement.findMany({
    include: { driver: { select: { name: true } }, items: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });

  const zero = new Prisma.Decimal(0);
  const rows: SettlementAuditRow[] = [];
  const ids: string[] = [];

  for (const settlement of settlements) {
    const invalidPeriod = settlement.periodStart > settlement.periodEnd;
    const itemCount = settlement.items.length;
    const gross = toDecimal(settlement.gross ?? 0) ?? zero;
    const net = toDecimal(settlement.net ?? 0) ?? zero;
    const isZero = gross.equals(0) && net.equals(0) && itemCount === 0;

    if (!invalidPeriod && !isZero) continue;

    const reason = [invalidPeriod ? "periodStart > periodEnd" : null, isZero ? "zero gross/net and no items" : null]
      .filter(Boolean)
      .join("; ");

    ids.push(settlement.id);
    rows.push({
      id: settlement.id,
      driver: settlement.driver?.name ?? "-",
      status: settlement.status,
      periodStart: settlement.periodStart.toISOString(),
      periodEnd: settlement.periodEnd.toISOString(),
      gross: gross.toFixed(2),
      net: net.toFixed(2),
      items: itemCount,
      reason,
    });
  }

  if (rows.length === 0) {
    console.log("No invalid settlements found.");
    return;
  }

  console.table(rows);
  console.log(`Found ${rows.length} settlement(s).`);

  if (!shouldFix) return;

  const hasVoid = Object.values(SettlementStatus).includes("VOID" as SettlementStatus);
  if (hasVoid) {
    await prisma.settlement.updateMany({
      where: { id: { in: ids } },
      data: { status: SettlementStatus.VOID },
    });
    console.log(`Marked ${ids.length} settlement(s) as VOID.`);
    return;
  }

  console.log("VOID status is not available; refusing to delete automatically.");
  console.log("Manual cleanup (run in psql):");
  console.log(`delete from \"SettlementItem\" where \"settlementId\" in (${formatIdList(ids)});`);
  console.log(`delete from \"Settlement\" where id in (${formatIdList(ids)});`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
