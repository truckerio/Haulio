import "dotenv/config";
import { prisma, Prisma } from "@truckerio/db";

const DRIVER_NAME = "billu";
const LOAD_COUNT = 5;

const ROUTES = [
  {
    shipper: { name: "Fontana Yard", address: "14300 Slover Ave", city: "Fontana", state: "CA", zip: "92337" },
    consignee: { name: "Home Goods Wholesale Dock", address: "6020 E 82nd St", city: "Indianapolis", state: "IN", zip: "46250" },
  },
  {
    shipper: { name: "Dallas Crossdock", address: "4500 Irving Blvd", city: "Dallas", state: "TX", zip: "75247" },
    consignee: { name: "Atlanta Distribution", address: "4800 Fountaine Rd", city: "Atlanta", state: "GA", zip: "30354" },
  },
];

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  if (day !== 1) {
    d.setDate(d.getDate() - (day - 1));
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

async function main() {
  const org = await prisma.organization.findFirst({
    where: { name: { contains: "SPG Freight", mode: "insensitive" } },
  });
  if (!org) {
    throw new Error("SPG Freight org not found.");
  }

  const driver = await prisma.driver.findFirst({
    where: { orgId: org.id, name: { contains: DRIVER_NAME, mode: "insensitive" } },
  });
  if (!driver) {
    throw new Error(`Driver '${DRIVER_NAME}' not found in org ${org.name}.`);
  }

  const operatingEntity =
    (await prisma.operatingEntity.findFirst({ where: { orgId: org.id, isDefault: true } })) ??
    (await prisma.operatingEntity.findFirst({ where: { orgId: org.id } }));
  if (!operatingEntity) {
    throw new Error("No operating entity found.");
  }

  const customer =
    (await prisma.customer.findFirst({ where: { orgId: org.id } })) ??
    (await prisma.customer.create({ data: { orgId: org.id, name: "SPG Demo Customer" } }));

  const adminUser = await prisma.user.findFirst({
    where: { orgId: org.id, role: "ADMIN" },
  });

  const truck = await prisma.truck.findFirst({ where: { orgId: org.id } });
  const trailer = await prisma.trailer.findFirst({ where: { orgId: org.id } });

  const now = new Date();
  const lastWeekStart = startOfWeek(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const basePickup = new Date(lastWeekStart.getTime() + 24 * 60 * 60 * 1000);
  basePickup.setHours(8, 0, 0, 0);

  const created: string[] = [];

  for (let i = 0; i < LOAD_COUNT; i += 1) {
    const route = ROUTES[i % ROUTES.length];
    const pickupStart = new Date(basePickup.getTime() + i * 6 * 60 * 60 * 1000);
    const pickupEnd = new Date(pickupStart.getTime() + 2 * 60 * 60 * 1000);
    const deliveryStart = new Date(pickupStart.getTime() + 2 * 24 * 60 * 60 * 1000);
    const deliveryEnd = new Date(deliveryStart.getTime() + 2 * 60 * 60 * 1000);

    const loadNumber = `SPG-BILLU-${Date.now().toString().slice(-6)}-${i + 1}`;

    const load = await prisma.load.create({
      data: {
        orgId: org.id,
        loadNumber,
        status: "DELIVERED",
        loadType: "COMPANY",
        operatingEntityId: operatingEntity.id,
        customerId: customer.id,
        customerName: customer.name,
        assignedDriverId: driver.id,
        truckId: truck?.id ?? null,
        trailerId: trailer?.id ?? null,
        plannedAt: pickupStart,
        deliveredAt: deliveryEnd,
        miles: 1500 + i * 40,
        rate: new Prisma.Decimal((2100 + i * 50).toFixed(2)),
        createdById: adminUser?.id ?? null,
      },
    });

    await prisma.stop.createMany({
      data: [
        {
          orgId: org.id,
          loadId: load.id,
          type: "PICKUP",
          status: "DEPARTED",
          name: route.shipper.name,
          address: route.shipper.address,
          city: route.shipper.city,
          state: route.shipper.state,
          zip: route.shipper.zip,
          appointmentStart: pickupStart,
          appointmentEnd: pickupEnd,
          arrivedAt: pickupStart,
          departedAt: pickupEnd,
          sequence: 1,
        },
        {
          orgId: org.id,
          loadId: load.id,
          type: "DELIVERY",
          status: "ARRIVED",
          name: route.consignee.name,
          address: route.consignee.address,
          city: route.consignee.city,
          state: route.consignee.state,
          zip: route.consignee.zip,
          appointmentStart: deliveryStart,
          appointmentEnd: deliveryEnd,
          arrivedAt: deliveryStart,
          departedAt: deliveryEnd,
          sequence: 2,
        },
      ],
    });

    await prisma.document.create({
      data: {
        orgId: org.id,
        loadId: load.id,
        type: "POD",
        status: "VERIFIED",
        source: "DRIVER_UPLOAD",
        filename: `pod_${loadNumber}.pdf`,
        originalName: `pod_${loadNumber}.pdf`,
        mimeType: "application/pdf",
        size: 120000,
        uploadedById: adminUser?.id ?? null,
        uploadedAt: deliveryEnd,
        verifiedAt: new Date(deliveryEnd.getTime() + 2 * 60 * 60 * 1000),
      },
    });

    created.push(loadNumber);
  }

  console.log(`Created ${created.length} delivered loads for ${driver.name}.`);
  console.log("Example load numbers:", created.slice(0, 3).join(", "));
  console.log(`Suggested settlement range: ${lastWeekStart.toISOString().slice(0, 10)} to ${new Date(lastWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
