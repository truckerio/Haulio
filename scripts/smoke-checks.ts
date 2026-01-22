import { prisma, Prisma } from "@truckerio/db";
import bcrypt from "bcryptjs";

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const orgA = await prisma.organization.create({ data: { name: "Smoke Org A" } });
  const orgB = await prisma.organization.create({ data: { name: "Smoke Org B" } });

  const email = "ops@smoke.test";
  await prisma.user.create({
    data: { orgId: orgA.id, email, passwordHash, role: "ADMIN", name: "Ops A" },
  });
  await prisma.user.create({
    data: { orgId: orgB.id, email, passwordHash, role: "ADMIN", name: "Ops B" },
  });

  const loadNumber = "SMOKE-100";
  await prisma.load.create({
    data: {
      orgId: orgA.id,
      loadNumber,
      customerName: "Smoke Customer",
      status: "PLANNED",
      stops: {
        create: [
          {
            orgId: orgA.id,
            type: "PICKUP",
            name: "Pickup",
            address: "1 Smoke St",
            city: "Austin",
            state: "TX",
            zip: "73301",
            sequence: 1,
          },
          {
            orgId: orgA.id,
            type: "DELIVERY",
            name: "Delivery",
            address: "2 Smoke St",
            city: "Austin",
            state: "TX",
            zip: "73301",
            sequence: 2,
          },
        ],
      },
    },
  });
  await prisma.load.create({
    data: {
      orgId: orgB.id,
      loadNumber,
      customerName: "Smoke Customer",
      status: "PLANNED",
      stops: {
        create: [
          {
            orgId: orgB.id,
            type: "PICKUP",
            name: "Pickup",
            address: "1 Smoke St",
            city: "Austin",
            state: "TX",
            zip: "73301",
            sequence: 1,
          },
          {
            orgId: orgB.id,
            type: "DELIVERY",
            name: "Delivery",
            address: "2 Smoke St",
            city: "Austin",
            state: "TX",
            zip: "73301",
            sequence: 2,
          },
        ],
      },
    },
  });

  try {
    await prisma.load.create({
      data: {
        orgId: orgA.id,
        loadNumber,
        customerName: "Duplicate",
        status: "PLANNED",
        stops: {
          create: [
            {
              orgId: orgA.id,
              type: "PICKUP",
              name: "Pickup",
              address: "1 Smoke St",
              city: "Austin",
              state: "TX",
              zip: "73301",
              sequence: 1,
            },
            {
              orgId: orgA.id,
              type: "DELIVERY",
              name: "Delivery",
              address: "2 Smoke St",
              city: "Austin",
              state: "TX",
              zip: "73301",
              sequence: 2,
            },
          ],
        },
      },
    });
    throw new Error("Expected duplicate loadNumber to fail in same org");
  } catch (error) {
    // Expected unique constraint violation.
  }

  const user = await prisma.user.findFirst({ where: { orgId: orgA.id, email } });
  if (!user) {
    throw new Error("User missing");
  }
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: "revoked-test",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      revokedAt: new Date(),
    },
  });
  const activeSession = await prisma.session.findFirst({
    where: { tokenHash: session.tokenHash, revokedAt: null },
  });
  if (activeSession) {
    throw new Error("Revoked session still active");
  }

  const settings = await prisma.orgSettings.create({
    data: {
      orgId: orgA.id,
      companyDisplayName: "Smoke Co",
      remitToAddress: "1 Smoke",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thanks",
      invoicePrefix: "SMK-",
      nextInvoiceNumber: 1,
      podRequireSignature: true,
      podRequirePrintedName: true,
      podRequireDeliveryDate: true,
      podMinPages: 1,
      requiredDocs: ["POD"],
      requiredDriverDocs: ["CDL"],
      collectPodDueMinutes: 30,
      missingPodAfterMinutes: 60,
      reminderFrequencyMinutes: 10,
      freeStorageMinutes: 60,
      storageRatePerDay: new Prisma.Decimal("100.00"),
      pickupFreeDetentionMinutes: 120,
      deliveryFreeDetentionMinutes: 120,
      driverRatePerMile: new Prisma.Decimal("0.65"),
    },
  });

  const loadForInvoice = await prisma.load.create({
    data: {
      orgId: orgA.id,
      loadNumber: "SMOKE-INV-1",
      customerName: "Invoice Customer",
      status: "READY_TO_INVOICE",
      rate: new Prisma.Decimal("500.00"),
      stops: {
        create: [
          {
            orgId: orgA.id,
            type: "PICKUP",
            name: "Pickup",
            address: "1 Smoke St",
            city: "Austin",
            state: "TX",
            zip: "73301",
            sequence: 1,
          },
          {
            orgId: orgA.id,
            type: "DELIVERY",
            name: "Delivery",
            address: "2 Smoke St",
            city: "Austin",
            state: "TX",
            zip: "73301",
            sequence: 2,
          },
        ],
      },
    },
  });

  const allocateInvoice = async () =>
    prisma.$transaction(async (tx) => {
      const rows = (await tx.$queryRaw`
        SELECT "id", "invoicePrefix", "nextInvoiceNumber"
        FROM "OrgSettings"
        WHERE "orgId" = ${orgA.id}
        FOR UPDATE
      `) as { id: string; invoicePrefix: string; nextInvoiceNumber: number }[];
      const row = rows[0];
      if (!row) throw new Error("Missing settings");
      const nextNumber = row.nextInvoiceNumber;
      await tx.orgSettings.update({
        where: { orgId: orgA.id },
        data: { nextInvoiceNumber: nextNumber + 1 },
      });
      const invoiceNumber = `${row.invoicePrefix}${String(nextNumber).padStart(4, "0")}`;
      await tx.invoice.create({
        data: {
          orgId: orgA.id,
          loadId: loadForInvoice.id,
          invoiceNumber,
          totalAmount: new Prisma.Decimal("500.00"),
        },
      });
      return invoiceNumber;
    });

  const [inv1, inv2] = await Promise.all([allocateInvoice(), allocateInvoice()]);
  if (inv1 === inv2) {
    throw new Error("Invoice numbers collided under concurrency");
  }

  console.log("Smoke checks passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
