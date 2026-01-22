import "dotenv/config";
import { prisma } from "@truckerio/db";

const targetName = process.env.DEMO_ORG_NAME || process.argv.slice(2).join(" ") || "Demo Org A";

async function main() {
  const org = await prisma.organization.findFirst({ where: { name: targetName } });
  if (!org) {
    console.log(`Org not found: ${targetName}`);
    return;
  }

  const users = await prisma.user.findMany({ where: { orgId: org.id }, select: { id: true } });
  const userIds = users.map((user) => user.id);

  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userNotificationPref.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
  await prisma.event.deleteMany({ where: { orgId: org.id } });
  await prisma.task.deleteMany({ where: { orgId: org.id } });
  await prisma.document.deleteMany({ where: { orgId: org.id } });
  await prisma.invoiceLineItem.deleteMany({ where: { invoice: { orgId: org.id } } });
  await prisma.invoice.deleteMany({ where: { orgId: org.id } });
  await prisma.settlementItem.deleteMany({ where: { settlement: { orgId: org.id } } });
  await prisma.settlement.deleteMany({ where: { orgId: org.id } });
  await prisma.storageRecord.deleteMany({ where: { orgId: org.id } });
  await prisma.loadLeg.deleteMany({ where: { orgId: org.id } });
  await prisma.trailerManifestItem.deleteMany({ where: { manifest: { orgId: org.id } } });
  await prisma.trailerManifest.deleteMany({ where: { orgId: org.id } });
  await prisma.stop.deleteMany({ where: { orgId: org.id } });
  await prisma.load.deleteMany({ where: { orgId: org.id } });
  await prisma.driver.deleteMany({ where: { orgId: org.id } });
  await prisma.truck.deleteMany({ where: { orgId: org.id } });
  await prisma.trailer.deleteMany({ where: { orgId: org.id } });
  await prisma.customer.deleteMany({ where: { orgId: org.id } });
  await prisma.orgSettings.deleteMany({ where: { orgId: org.id } });
  await prisma.user.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });

  console.log(`Reset complete for org: ${targetName}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
