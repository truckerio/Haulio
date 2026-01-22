import "dotenv/config";
import { prisma, Prisma } from "@truckerio/db";
import { createSession } from "../src/lib/auth";
import { createCsrfToken } from "../src/lib/csrf";

const API_BASE = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

type Auth = { cookie: string; csrf: string };

async function authFor(userId: string): Promise<Auth> {
  const session = await createSession({ userId });
  const csrf = createCsrfToken();
  return { cookie: `session=${session.token}; csrf=${csrf}`, csrf };
}

async function request<T>(path: string, options: RequestInit, auth: Auth) {
  const headers = new Headers(options.headers || {});
  headers.set("cookie", auth.cookie);
  if (options.method && options.method !== "GET") {
    headers.set("x-csrf-token", auth.csrf);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!res.ok) {
    throw new Error(`Request failed ${res.status} ${path}: ${JSON.stringify(payload)}`);
  }
  return payload as T;
}

async function main() {
  const orgName = "Smoke Happy Org";
  const org = (await prisma.organization.findFirst({ where: { name: orgName } })) ??
    (await prisma.organization.create({ data: { name: orgName } }));

  await prisma.orgSettings.upsert({
    where: { orgId: org.id },
    update: {},
    create: {
      orgId: org.id,
      companyDisplayName: "Smoke Happy",
      remitToAddress: "100 Smoke Way\nAustin, TX 78701",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thanks",
      invoicePrefix: "HP-",
      nextInvoiceNumber: 1,
      podRequireSignature: true,
      podRequirePrintedName: true,
      podRequireDeliveryDate: true,
      podMinPages: 1,
      requiredDocs: ["POD"],
      requiredDriverDocs: [],
      collectPodDueMinutes: 10,
      missingPodAfterMinutes: 30,
      reminderFrequencyMinutes: 10,
      freeStorageMinutes: 60,
      storageRatePerDay: new Prisma.Decimal("100.00"),
      pickupFreeDetentionMinutes: 120,
      deliveryFreeDetentionMinutes: 120,
      driverRatePerMile: new Prisma.Decimal("0.65"),
    },
  });

  const dispatcher = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: "dispatch@happy.test" } },
    update: { role: "DISPATCHER", name: "Happy Dispatch", isActive: true },
    create: { orgId: org.id, email: "dispatch@happy.test", role: "DISPATCHER", name: "Happy Dispatch", passwordHash: "x" },
  });
  const billing = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: "billing@happy.test" } },
    update: { role: "BILLING", name: "Happy Billing", isActive: true },
    create: { orgId: org.id, email: "billing@happy.test", role: "BILLING", name: "Happy Billing", passwordHash: "x" },
  });
  const driverUser = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: "driver@happy.test" } },
    update: { role: "DRIVER", name: "Happy Driver", isActive: true },
    create: { orgId: org.id, email: "driver@happy.test", role: "DRIVER", name: "Happy Driver", passwordHash: "x" },
  });
  const driver = await prisma.driver.upsert({
    where: { userId: driverUser.id },
    update: { orgId: org.id, name: driverUser.name ?? "Happy Driver" },
    create: { orgId: org.id, userId: driverUser.id, name: driverUser.name ?? "Happy Driver" },
  });

  let truck = await prisma.truck.findFirst({ where: { orgId: org.id, unit: "HP-TRUCK" } });
  if (!truck) {
    truck = await prisma.truck.create({ data: { orgId: org.id, unit: "HP-TRUCK" } });
  }
  let trailer = await prisma.trailer.findFirst({ where: { orgId: org.id, unit: "HP-TRAILER" } });
  if (!trailer) {
    trailer = await prisma.trailer.create({ data: { orgId: org.id, unit: "HP-TRAILER" } });
  }

  const dispatcherAuth = await authFor(dispatcher.id);
  const billingAuth = await authFor(billing.id);
  const driverAuth = await authFor(driverUser.id);

  const customer = await request<{ customer: any }>(
    "/customers",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Happy Customer", termsDays: 30 }),
    },
    dispatcherAuth
  );

  const loadNumber = `HP-${Date.now()}`;
  const now = new Date();
  const stops = [
    {
      type: "PICKUP",
      name: "Happy Shipper",
      address: "1 Happy St",
      city: "Austin",
      state: "TX",
      zip: "78701",
      appointmentStart: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      appointmentEnd: new Date(now.getTime() + 90 * 60 * 1000).toISOString(),
      sequence: 1,
    },
    {
      type: "DELIVERY",
      name: "Happy Receiver",
      address: "2 Happy St",
      city: "Dallas",
      state: "TX",
      zip: "75201",
      appointmentStart: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(),
      appointmentEnd: new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString(),
      sequence: 2,
    },
  ];

  const loadResponse = await request<{ load: any }>(
    "/loads",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loadNumber,
        customerId: customer.customer.id,
        rate: "1200.00",
        miles: 420,
        stops,
      }),
    },
    dispatcherAuth
  );
  const loadId = loadResponse.load.id;

  await request(
    `/loads/${loadId}/assign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId: driver.id, truckId: truck.id, trailerId: trailer.id }),
    },
    dispatcherAuth
  );

  const loadDetail = await request<{ load: any }>(`/loads/${loadId}`, { method: "GET" }, dispatcherAuth);
  const pickupStop = loadDetail.load.stops.find((stop: any) => stop.type === "PICKUP");
  const deliveryStop = loadDetail.load.stops.find((stop: any) => stop.type === "DELIVERY");
  if (!pickupStop || !deliveryStop) {
    throw new Error("Stops not found after load creation");
  }

  await request(`/driver/stops/${pickupStop.id}/arrive`, { method: "POST" }, driverAuth);
  await request(`/driver/stops/${pickupStop.id}/depart`, { method: "POST" }, driverAuth);
  await request(`/driver/stops/${deliveryStop.id}/arrive`, { method: "POST" }, driverAuth);
  await request(`/driver/stops/${deliveryStop.id}/depart`, { method: "POST" }, driverAuth);

  const form = new FormData();
  form.append("file", new Blob(["POD"]), "pod.txt");
  form.append("loadId", loadId);
  form.append("type", "POD");
  form.append("stopId", deliveryStop.id);
  const docUpload = await request<{ doc: any }>(
    "/driver/docs",
    { method: "POST", body: form },
    driverAuth
  );

  await request(
    `/docs/${docUpload.doc.id}/verify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requireSignature: true,
        requirePrintedName: true,
        requireDeliveryDate: true,
        pages: 1,
      }),
    },
    billingAuth
  );

  const invoiceResult = await request<{ invoice: any }>(
    `/billing/invoices/${loadId}/generate`,
    { method: "POST" },
    billingAuth
  );
  const invoiceId = invoiceResult.invoice.id;

  const queue = await request<{ invoiced: any[] }>(`/billing/queue`, { method: "GET" }, billingAuth);
  const invoicedLoad = queue.invoiced.find((load: any) => load.id === loadId);
  if (!invoicedLoad) {
    throw new Error("Invoiced load not found in billing queue");
  }
  const invoice = invoicedLoad.invoices[0];
  if (!invoice || !invoice.items || invoice.items.length === 0) {
    throw new Error("Invoice line items missing");
  }
  const total = invoice.items.reduce(
    (sum: Prisma.Decimal, item: any) => sum.add(new Prisma.Decimal(item.amount)),
    new Prisma.Decimal(0)
  );
  const invoiceTotal = invoice.totalAmount ? new Prisma.Decimal(invoice.totalAmount) : new Prisma.Decimal(0);
  if (!total.eq(invoiceTotal)) {
    throw new Error(`Invoice total mismatch. items=${total.toFixed(2)} total=${invoiceTotal.toFixed(2)}`);
  }

  await request(
    `/billing/invoices/${invoiceId}/status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "SENT" }),
    },
    billingAuth
  );
  await request(
    `/billing/invoices/${invoiceId}/status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAID", paymentRef: "PAY-123" }),
    },
    billingAuth
  );

  const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const settlement = await request<{ settlement: any }>(
    "/settlements/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId: driver.id, periodStart, periodEnd }),
    },
    billingAuth
  );
  await request(`/settlements/${settlement.settlement.id}/finalize`, { method: "POST" }, billingAuth);
  await request(`/settlements/${settlement.settlement.id}/paid`, { method: "POST" }, billingAuth);

  const timeline = await request<{ timeline: any[] }>(`/loads/${loadId}/timeline`, { method: "GET" }, billingAuth);
  const types = timeline.timeline.map((item: any) => item.type);
  if (!types.includes("DOC_VERIFIED")) {
    throw new Error("Timeline missing DOC_VERIFIED");
  }
  if (!types.includes("INVOICE_GENERATED")) {
    throw new Error("Timeline missing INVOICE_GENERATED");
  }
  if (!types.some((type: string) => type.includes("PAID"))) {
    throw new Error("Timeline missing PAID entry");
  }
  if (!types.includes("SETTLEMENT_PAID")) {
    throw new Error("Timeline missing SETTLEMENT_PAID");
  }

  console.log("smoke-happy-path: PASS");
}

main()
  .catch((error) => {
    console.error("smoke-happy-path: FAIL");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
