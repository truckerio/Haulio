import { prisma } from "@truckerio/db";
import { createSession } from "../src/lib/auth";
import { createCsrfToken } from "../src/lib/csrf";

const API_BASE = process.env.API_BASE || "http://localhost:4000";
const PARALLEL = Number(process.env.PARALLEL || "5");

async function main() {
  const org = await prisma.organization.create({ data: { name: "Invoice Concurrency Org" } });
  await prisma.orgSettings.create({
    data: {
      orgId: org.id,
      companyDisplayName: "Concurrency Org",
      remitToAddress: "1 Concurrency Way",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thanks",
      invoicePrefix: "CC-",
      nextInvoiceNumber: 1,
      podRequireSignature: true,
      podRequirePrintedName: true,
      podRequireDeliveryDate: true,
      podMinPages: 1,
      requiredDocs: [],
      requiredDriverDocs: [],
      collectPodDueMinutes: 30,
      missingPodAfterMinutes: 60,
      reminderFrequencyMinutes: 10,
      freeStorageMinutes: 60,
      storageRatePerDay: "100.00",
      pickupFreeDetentionMinutes: 120,
      deliveryFreeDetentionMinutes: 120,
      driverRatePerMile: "0.65",
    },
  });

  const user = await prisma.user.create({
    data: {
      orgId: org.id,
      email: "concurrency@demo.test",
      passwordHash: "x",
      role: "ADMIN",
      name: "Concurrency Admin",
    },
  });

  const loads = await Promise.all(
    Array.from({ length: PARALLEL }).map((_, index) =>
      prisma.load.create({
        data: {
          orgId: org.id,
          loadNumber: `CC-${index + 1}`,
          customerName: "Concurrency Customer",
          status: "READY_TO_INVOICE",
          rate: "250.00",
          stops: {
            create: [
              {
                orgId: org.id,
                type: "PICKUP",
                name: "Pickup",
                address: "1 Concurrency Way",
                city: "Austin",
                state: "TX",
                zip: "73301",
                sequence: 1,
              },
              {
                orgId: org.id,
                type: "DELIVERY",
                name: "Delivery",
                address: "2 Concurrency Way",
                city: "Austin",
                state: "TX",
                zip: "73301",
                sequence: 2,
              },
            ],
          },
        },
      })
    )
  );

  const session = await createSession({ userId: user.id });
  const csrf = createCsrfToken();
  const cookie = `session=${session.token}; csrf=${csrf}`;

  const responses = await Promise.all(
    loads.map((load) =>
      fetch(`${API_BASE}/billing/invoices/${load.id}/generate`, {
        method: "POST",
        headers: {
          cookie,
          "x-csrf-token": csrf,
          "Content-Type": "application/json",
        },
      }).then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(`Invoice generation failed: ${res.status} ${JSON.stringify(payload)}`);
        }
        return payload.invoice.invoiceNumber as string;
      })
    )
  );

  const unique = new Set(responses);
  if (unique.size !== responses.length) {
    throw new Error("Invoice numbers collided under concurrency");
  }

  const sorted = [...responses].sort();
  if (sorted[0] !== responses[0]) {
    console.warn("Invoice numbers are unique but not sorted by request order.");
  }

  console.log("Invoice concurrency check passed", responses);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
