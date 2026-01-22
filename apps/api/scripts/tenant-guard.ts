import { prisma } from "@truckerio/db";
import { createSession } from "../src/lib/auth";
import { createCsrfToken } from "../src/lib/csrf";

const API_BASE = process.env.API_BASE || "http://localhost:4000";

async function main() {
  const orgA = await prisma.organization.create({ data: { name: "Tenant Guard A" } });
  const orgB = await prisma.organization.create({ data: { name: "Tenant Guard B" } });

  const userA = await prisma.user.create({
    data: {
      orgId: orgA.id,
      email: "guard-a@demo.test",
      passwordHash: "x",
      role: "ADMIN",
      name: "Guard A",
    },
  });

  const loadB = await prisma.load.create({
    data: {
      orgId: orgB.id,
      loadNumber: "GUARD-100",
      customerName: "Other Org",
      status: "PLANNED",
      stops: {
        create: [
          {
            orgId: orgB.id,
            type: "PICKUP",
            name: "Pickup",
            address: "1 Guard St",
            city: "Austin",
            state: "TX",
            zip: "73301",
            sequence: 1,
          },
          {
            orgId: orgB.id,
            type: "DELIVERY",
            name: "Delivery",
            address: "2 Guard St",
            city: "Austin",
            state: "TX",
            zip: "73301",
            sequence: 2,
          },
        ],
      },
    },
  });

  const docB = await prisma.document.create({
    data: {
      orgId: orgB.id,
      loadId: loadB.id,
      type: "POD",
      status: "UPLOADED",
      source: "OPS_UPLOAD",
      filename: "guard-doc.pdf",
      originalName: "guard-doc.pdf",
      mimeType: "application/pdf",
      size: 10,
    },
  });

  const session = await createSession({ userId: userA.id });
  const csrf = createCsrfToken();
  const cookie = `session=${session.token}; csrf=${csrf}`;

  const res = await fetch(`${API_BASE}/loads/${loadB.id}`, {
    method: "GET",
    headers: { cookie },
  });

  if (res.status !== 404 && res.status !== 403) {
    throw new Error(`Expected tenant guard to block access, got ${res.status}`);
  }

  const docRes = await fetch(`${API_BASE}/docs/${docB.id}/verify`, {
    method: "POST",
    headers: { cookie, "x-csrf-token": csrf, "Content-Type": "application/json" },
    body: JSON.stringify({
      requireSignature: true,
      requirePrintedName: true,
      requireDeliveryDate: true,
      pages: 1,
    }),
  });
  if (docRes.status !== 404 && docRes.status !== 403) {
    throw new Error(`Expected doc guard to block access, got ${docRes.status}`);
  }

  console.log("Tenant guard check passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
