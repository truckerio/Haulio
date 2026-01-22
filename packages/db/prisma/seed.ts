import bcrypt from "bcryptjs";
import { prisma, Prisma } from "../src";

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.event.deleteMany();
  await prisma.document.deleteMany();
  await prisma.task.deleteMany();
  await prisma.storageRecord.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.stop.deleteMany();
  await prisma.load.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.truck.deleteMany();
  await prisma.trailer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.orgSettings.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({
    data: { name: "Demo Transport" },
  });

  const passwordHash = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.create({
    data: {
      orgId: org.id,
      email: "admin@demo.com",
      passwordHash,
      role: "ADMIN",
      name: "Ari Admin",
    },
  });

  const dispatch = await prisma.user.create({
    data: {
      orgId: org.id,
      email: "dispatch@demo.com",
      passwordHash,
      role: "DISPATCHER",
      name: "Drew Dispatch",
    },
  });

  const billing = await prisma.user.create({
    data: {
      orgId: org.id,
      email: "billing@demo.com",
      passwordHash,
      role: "BILLING",
      name: "Bill Billing",
    },
  });

  const driverUser = await prisma.user.create({
    data: {
      orgId: org.id,
      email: "driver@demo.com",
      passwordHash,
      role: "DRIVER",
      name: "Dani Driver",
    },
  });

  const driver = await prisma.driver.create({
    data: {
      orgId: org.id,
      userId: driverUser.id,
      name: "Dani Driver",
      phone: "(555) 010-2000",
      license: "D-1234567",
      licenseState: "TX",
      licenseExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      medCardExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180),
      payRatePerMile: new Prisma.Decimal("0.68"),
    },
  });

  const truck1 = await prisma.truck.create({
    data: { orgId: org.id, unit: "T-101", plate: "ABC-123" },
  });
  const truck2 = await prisma.truck.create({
    data: { orgId: org.id, unit: "T-102", plate: "DEF-456" },
  });

  const trailer1 = await prisma.trailer.create({
    data: { orgId: org.id, unit: "TR-201", plate: "TR-201" },
  });
  const trailer2 = await prisma.trailer.create({
    data: { orgId: org.id, unit: "TR-202", plate: "TR-202" },
  });

  await prisma.orgSettings.create({
    data: {
      orgId: org.id,
      companyDisplayName: "Demo Transport LLC",
      remitToAddress: "Demo Transport LLC\n123 Freight Ave\nDallas, TX 75201",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thank you for your business.",
      invoicePrefix: "INV-",
      nextInvoiceNumber: 1001,
      podRequireSignature: true,
      podRequirePrintedName: true,
      podRequireDeliveryDate: true,
      podMinPages: 1,
      requiredDocs: ["POD"],
      requiredDriverDocs: ["CDL", "MED_CARD"],
      collectPodDueMinutes: 30,
      missingPodAfterMinutes: 120,
      reminderFrequencyMinutes: 20,
      timezone: "America/Chicago",
      freeStorageMinutes: 120,
      storageRatePerDay: new Prisma.Decimal("150.00"),
      pickupFreeDetentionMinutes: 120,
      deliveryFreeDetentionMinutes: 120,
      detentionRatePerHour: new Prisma.Decimal("75.00"),
      invoiceTermsDays: 30,
      driverRatePerMile: new Prisma.Decimal("0.65"),
    },
  });

  const customerA = await prisma.customer.create({
    data: {
      orgId: org.id,
      name: "Blue Ridge Foods",
      billingEmail: "ap@blueridge.test",
      billingPhone: "(555) 101-0909",
      termsDays: 30,
    },
  });
  const customerB = await prisma.customer.create({
    data: {
      orgId: org.id,
      name: "Granite Mills",
      billingEmail: "billing@granite.test",
      termsDays: 21,
    },
  });
  const customerC = await prisma.customer.create({
    data: {
      orgId: org.id,
      name: "Freshline Produce",
      billingEmail: "billing@freshline.test",
      termsDays: 14,
    },
  });
  const customerD = await prisma.customer.create({
    data: {
      orgId: org.id,
      name: "Sunrise Paper",
      billingEmail: "billing@sunrise.test",
      termsDays: 30,
    },
  });
  const customerE = await prisma.customer.create({
    data: {
      orgId: org.id,
      name: "Ironline Steel",
      billingEmail: "billing@ironline.test",
      termsDays: 45,
    },
  });

  const load1 = await prisma.load.create({
    data: {
      orgId: org.id,
      loadNumber: "LD-1001",
      status: "ASSIGNED",
      customerId: customerA.id,
      customerName: "Blue Ridge Foods",
      miles: 280,
      assignedDriverId: driver.id,
      truckId: truck1.id,
      trailerId: trailer1.id,
      rate: new Prisma.Decimal("1400.00"),
      customerRef: "PO-4491",
      bolNumber: "BOL-1001",
      createdById: dispatch.id,
      stops: {
        create: [
          {
            orgId: org.id,
            type: "PICKUP",
            status: "PLANNED",
            name: "BRF Warehouse",
            address: "1200 Maple St",
            city: "Memphis",
            state: "TN",
            zip: "38103",
            appointmentStart: new Date(Date.now() + 60 * 60 * 1000),
            appointmentEnd: new Date(Date.now() + 2 * 60 * 60 * 1000),
            sequence: 1,
          },
          {
            orgId: org.id,
            type: "DELIVERY",
            status: "PLANNED",
            name: "Grove Market DC",
            address: "8801 Commerce Rd",
            city: "Nashville",
            state: "TN",
            zip: "37209",
            appointmentStart: new Date(Date.now() + 6 * 60 * 60 * 1000),
            appointmentEnd: new Date(Date.now() + 7 * 60 * 60 * 1000),
            sequence: 2,
          },
        ],
      },
    },
  });

  const load2 = await prisma.load.create({
    data: {
      orgId: org.id,
      loadNumber: "LD-1002",
      status: "IN_TRANSIT",
      customerId: customerB.id,
      customerName: "Granite Mills",
      miles: 210,
      assignedDriverId: driver.id,
      truckId: truck2.id,
      trailerId: trailer2.id,
      rate: new Prisma.Decimal("1150.00"),
      customerRef: "PO-7781",
      createdById: dispatch.id,
      stops: {
        create: [
          {
            orgId: org.id,
            type: "PICKUP",
            status: "DEPARTED",
            name: "Granite Mills Plant",
            address: "45 Quarry Rd",
            city: "Birmingham",
            state: "AL",
            zip: "35203",
            arrivedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
            departedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
            sequence: 1,
          },
          {
            orgId: org.id,
            type: "DELIVERY",
            status: "PLANNED",
            name: "Southline Retail",
            address: "990 Market St",
            city: "Atlanta",
            state: "GA",
            zip: "30303",
            sequence: 2,
          },
        ],
      },
    },
  });

  const load3 = await prisma.load.create({
    data: {
      orgId: org.id,
      loadNumber: "LD-1003",
      status: "DELIVERED",
      customerId: customerC.id,
      customerName: "Freshline Produce",
      miles: 165,
      rate: new Prisma.Decimal("980.00"),
      assignedDriverId: driver.id,
      createdById: dispatch.id,
      deliveredAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      stops: {
        create: [
          {
            orgId: org.id,
            type: "PICKUP",
            status: "DEPARTED",
            name: "Freshline Yard",
            address: "330 Orchard Ln",
            city: "Austin",
            state: "TX",
            zip: "73301",
            arrivedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
            departedAt: new Date(Date.now() - 11 * 60 * 60 * 1000),
            sequence: 1,
          },
          {
            orgId: org.id,
            type: "DELIVERY",
            status: "ARRIVED",
            name: "Harbor Foods",
            address: "1600 Dock St",
            city: "Houston",
            state: "TX",
            zip: "77002",
            arrivedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
            sequence: 2,
          },
        ],
      },
    },
  });

  const load4 = await prisma.load.create({
    data: {
      orgId: org.id,
      loadNumber: "LD-1004",
      status: "READY_TO_INVOICE",
      customerId: customerD.id,
      customerName: "Sunrise Paper",
      miles: 310,
      rate: new Prisma.Decimal("1550.00"),
      assignedDriverId: driver.id,
      createdById: dispatch.id,
      deliveredAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      podVerifiedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      stops: {
        create: [
          {
            orgId: org.id,
            type: "PICKUP",
            status: "DEPARTED",
            name: "Sunrise Paper Mill",
            address: "12 Mill Rd",
            city: "Shreveport",
            state: "LA",
            zip: "71101",
            arrivedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
            departedAt: new Date(Date.now() - 23 * 60 * 60 * 1000),
            sequence: 1,
          },
          {
            orgId: org.id,
            type: "DELIVERY",
            status: "DEPARTED",
            name: "City Print House",
            address: "88 Press Ave",
            city: "Little Rock",
            state: "AR",
            zip: "72201",
            arrivedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
            departedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
            sequence: 2,
          },
        ],
      },
    },
  });

  const load5 = await prisma.load.create({
    data: {
      orgId: org.id,
      loadNumber: "LD-1005",
      status: "INVOICED",
      lockedAt: new Date(),
      customerId: customerE.id,
      customerName: "Ironline Steel",
      miles: 445,
      rate: new Prisma.Decimal("1850.00"),
      assignedDriverId: driver.id,
      createdById: dispatch.id,
      deliveredAt: new Date(Date.now() - 60 * 60 * 1000 * 40),
      podVerifiedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      stops: {
        create: [
          {
            orgId: org.id,
            type: "PICKUP",
            status: "DEPARTED",
            name: "Ironline Plant",
            address: "900 Forge Dr",
            city: "Tulsa",
            state: "OK",
            zip: "74103",
            arrivedAt: new Date(Date.now() - 60 * 60 * 1000 * 48),
            departedAt: new Date(Date.now() - 60 * 60 * 1000 * 47),
            sequence: 1,
          },
          {
            orgId: org.id,
            type: "DELIVERY",
            status: "DEPARTED",
            name: "Metro Steelworks",
            address: "700 Foundry Blvd",
            city: "Kansas City",
            state: "MO",
            zip: "64101",
            arrivedAt: new Date(Date.now() - 60 * 60 * 1000 * 40),
            departedAt: new Date(Date.now() - 60 * 60 * 1000 * 39),
            sequence: 2,
          },
        ],
      },
    },
  });

  await prisma.document.create({
    data: {
      orgId: org.id,
      loadId: load4.id,
      type: "POD",
      status: "VERIFIED",
      filename: "pod_ld-1004_demo.pdf",
      originalName: "POD.pdf",
      mimeType: "application/pdf",
      size: 12345,
      uploadedById: driverUser.id,
      verifiedById: billing.id,
      verifiedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  });

  await prisma.document.create({
    data: {
      orgId: org.id,
      loadId: load5.id,
      type: "POD",
      status: "VERIFIED",
      filename: "pod_ld-1005_demo.pdf",
      originalName: "POD.pdf",
      mimeType: "application/pdf",
      size: 12345,
      uploadedById: driverUser.id,
      verifiedById: billing.id,
      verifiedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    },
  });

  await prisma.invoice.create({
    data: {
      orgId: org.id,
      loadId: load5.id,
      invoiceNumber: "INV-1000",
      status: "SENT",
      totalAmount: new Prisma.Decimal("1850.00"),
      sentAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      pdfPath: "uploads/invoices/INV-1000.pdf",
      packetPath: "uploads/packets/INV-1000.zip",
      items: {
        create: [
          {
            code: "LINEHAUL",
            description: "Linehaul",
            quantity: new Prisma.Decimal("1.00"),
            rate: new Prisma.Decimal("1850.00"),
            amount: new Prisma.Decimal("1850.00"),
          },
        ],
      },
    },
  });

  await prisma.task.create({
    data: {
      orgId: org.id,
      loadId: load3.id,
      type: "COLLECT_POD",
      title: "Collect POD",
      priority: "HIGH",
      assignedRole: "BILLING",
      createdById: dispatch.id,
      dueAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });

  await prisma.task.create({
    data: {
      orgId: org.id,
      loadId: load1.id,
      type: "CUSTOMER_CALLBACK",
      title: "Dispatch check-in",
      priority: "MED",
      assignedRole: "DISPATCHER",
      createdById: dispatch.id,
    },
  });

  await prisma.event.createMany({
    data: [
      {
        orgId: org.id,
        loadId: load1.id,
        userId: dispatch.id,
        type: "LOAD_CREATED",
        message: "Load created",
      },
      {
        orgId: org.id,
        loadId: load1.id,
        userId: dispatch.id,
        type: "LOAD_ASSIGNED",
        message: "Driver assigned",
      },
    ],
  });

  await prisma.auditLog.create({
    data: {
      orgId: org.id,
      userId: dispatch.id,
      action: "LOAD_ASSIGNED",
      entity: "Load",
      entityId: load1.id,
      summary: "Assigned Dani Driver to LD-1001",
    },
  });

  console.log("Seed complete");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
