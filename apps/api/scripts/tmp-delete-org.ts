import { prisma } from "@truckerio/db";
import { deleteOrganizationData } from "../src/lib/org-delete";

async function main() {
  const target = "ab trans";

  const org = await prisma.organization.findFirst({
    where: { name: { equals: target, mode: "insensitive" } },
    select: { id: true, name: true },
  });

  if (!org) {
    console.log(`Org not found: ${target}`);
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      await deleteOrganizationData(tx, org.id);
    },
    { timeout: 60000 }
  );

  console.log(`Deleted org: ${org.name} (${org.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
