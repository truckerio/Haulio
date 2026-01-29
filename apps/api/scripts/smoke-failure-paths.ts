import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { prisma, Prisma } from "@truckerio/db";
import { createSession } from "../src/lib/auth";
import { createCsrfToken } from "../src/lib/csrf";

const API_BASE = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

type Auth = { cookie: string; csrf: string };

async function ensureOperatingEntity(orgId: string, name: string, remitToAddress?: string) {
  const existing = await prisma.operatingEntity.findFirst({ where: { orgId, isDefault: true } });
  if (existing) return existing;
  return prisma.operatingEntity.create({
    data: {
      orgId,
      name,
      type: "CARRIER",
      addressLine1: remitToAddress ?? null,
      remitToName: name,
      remitToAddressLine1: remitToAddress ?? null,
      isDefault: true,
    },
  });
}

async function authFor(userId: string): Promise<Auth> {
  const session = await createSession({ userId });
  const csrf = createCsrfToken();
  return { cookie: `session=${session.token}; csrf=${csrf}`, csrf };
}

async function request<T>(path: string, options: RequestInit, auth: Auth, expectStatus?: number) {
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
  if (expectStatus && res.status !== expectStatus) {
    throw new Error(`Expected ${expectStatus}, got ${res.status} ${path}: ${JSON.stringify(payload)}`);
  }
  if (!expectStatus && !res.ok) {
    throw new Error(`Request failed ${res.status} ${path}: ${JSON.stringify(payload)}`);
  }
  return { status: res.status, payload } as { status: number; payload: T };
}

async function testRejectRequiresReason() {
  const orgName = "Smoke Failure Org";
  const org = (await prisma.organization.findFirst({ where: { name: orgName } })) ??
    (await prisma.organization.create({ data: { name: orgName } }));
  await prisma.orgSettings.upsert({
    where: { orgId: org.id },
    update: {},
    create: {
      orgId: org.id,
      companyDisplayName: "Failure Org",
      remitToAddress: "1 Failure Way",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thanks",
      invoicePrefix: "FAIL-",
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

  const operatingEntity = await ensureOperatingEntity(org.id, "Failure Org", "1 Failure Way");

  const billing = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: "billing@failure.test" } },
    update: { role: "BILLING", name: "Failure Billing", isActive: true },
    create: { orgId: org.id, email: "billing@failure.test", role: "BILLING", name: "Failure Billing", passwordHash: "x" },
  });
  const auth = await authFor(billing.id);

  const load = await prisma.load.create({
    data: {
      orgId: org.id,
      loadNumber: `FAIL-${Date.now()}`,
      loadType: "COMPANY",
      operatingEntityId: operatingEntity.id,
      customerName: "Failure Customer",
      rate: new Prisma.Decimal("900.00"),
      stops: {
        create: [
          { orgId: org.id, type: "PICKUP", name: "Pickup", address: "1 Fail", city: "Austin", state: "TX", zip: "78701", sequence: 1 },
          { orgId: org.id, type: "DELIVERY", name: "Delivery", address: "2 Fail", city: "Dallas", state: "TX", zip: "75201", sequence: 2 },
        ],
      },
    },
  });

  const form = new FormData();
  form.append("file", new Blob(["POD"]), "pod.txt");
  form.append("type", "POD");
  const docResp = await request<{ doc: any }>(`/loads/${load.id}/docs`, { method: "POST", body: form }, auth);
  const docId = docResp.payload.doc.id;

  await request(`/docs/${docId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }, auth, 400);

  await request(`/docs/${docId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rejectReason: "Unreadable POD" }),
  }, auth, 200);
}

async function testInvoiceConcurrency() {
  const orgName = "Smoke Concurrency Org";
  const org = (await prisma.organization.findFirst({ where: { name: orgName } })) ??
    (await prisma.organization.create({ data: { name: orgName } }));
  const runSuffix = String(Date.now()).slice(-6);
  const invoicePrefix = `CON-${runSuffix}-`;
  await prisma.orgSettings.upsert({
    where: { orgId: org.id },
    update: { nextInvoiceNumber: 1, invoicePrefix },
    create: {
      orgId: org.id,
      companyDisplayName: "Concurrency Org",
      remitToAddress: "1 Concurrency Way",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thanks",
      invoicePrefix,
      nextInvoiceNumber: 1,
      podRequireSignature: true,
      podRequirePrintedName: true,
      podRequireDeliveryDate: true,
      podMinPages: 1,
      requiredDocs: [],
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

  const operatingEntity = await ensureOperatingEntity(org.id, "Concurrency Org", "1 Concurrency Way");

  const billing = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: "billing@concurrency.test" } },
    update: { role: "BILLING", name: "Concurrency Billing", isActive: true },
    create: { orgId: org.id, email: "billing@concurrency.test", role: "BILLING", name: "Concurrency Billing", passwordHash: "x" },
  });
  const auth = await authFor(billing.id);

  const loads = await Promise.all(
    Array.from({ length: 5 }).map((_, index) =>
      prisma.load.create({
        data: {
          orgId: org.id,
          loadNumber: `CON-${Date.now()}-${index}`,
          loadType: "COMPANY",
          operatingEntityId: operatingEntity.id,
          customerName: "Concurrency Customer",
          rate: new Prisma.Decimal("500.00"),
          status: "READY_TO_INVOICE",
          stops: {
            create: [
              { orgId: org.id, type: "PICKUP", name: "Pickup", address: "1 Con", city: "Austin", state: "TX", zip: "78701", sequence: 1 },
              { orgId: org.id, type: "DELIVERY", name: "Delivery", address: "2 Con", city: "Dallas", state: "TX", zip: "75201", sequence: 2 },
            ],
          },
        },
      })
    )
  );

  const results = await Promise.all(
    loads.map((load) =>
      request<{ invoice: any }>(`/billing/invoices/${load.id}/generate`, { method: "POST" }, auth)
        .then((res) => res.payload.invoice.invoiceNumber as string)
    )
  );
  const unique = new Set(results);
  if (unique.size !== results.length) {
    throw new Error(`Invoice numbers collided: ${results.join(", ")}`);
  }
  const numeric = results.map((value) => Number(value.replace(invoicePrefix, ""))).sort((a, b) => a - b);
  for (let i = 1; i < numeric.length; i += 1) {
    if (numeric[i] !== numeric[i - 1] + 1) {
      throw new Error(`Invoice numbers not monotonic: ${numeric.join(", ")}`);
    }
  }
}

async function testTaskDedupe() {
  const orgName = "Smoke Dedupe Org";
  const org = (await prisma.organization.findFirst({ where: { name: orgName } })) ??
    (await prisma.organization.create({ data: { name: orgName } }));
  await prisma.orgSettings.upsert({
    where: { orgId: org.id },
    update: { invoicePrefix: "DD-" },
    create: {
      orgId: org.id,
      companyDisplayName: "Dedupe Org",
      remitToAddress: "1 Dedupe Way",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thanks",
      invoicePrefix: "DD-",
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

  const operatingEntity = await ensureOperatingEntity(org.id, "Dedupe Org", "1 Dedupe Way");

  const billing = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: "billing@dedupe.test" } },
    update: { role: "BILLING", name: "Dedupe Billing", isActive: true },
    create: { orgId: org.id, email: "billing@dedupe.test", role: "BILLING", name: "Dedupe Billing", passwordHash: "x" },
  });
  const auth = await authFor(billing.id);

  const load = await prisma.load.create({
    data: {
      orgId: org.id,
      loadNumber: `DD-${Date.now()}`,
      loadType: "COMPANY",
      operatingEntityId: operatingEntity.id,
      customerName: "Dedupe Customer",
      rate: new Prisma.Decimal("800.00"),
      stops: {
        create: [
          { orgId: org.id, type: "PICKUP", name: "Pickup", address: "1 DD", city: "Austin", state: "TX", zip: "78701", sequence: 1 },
          { orgId: org.id, type: "DELIVERY", name: "Delivery", address: "2 DD", city: "Dallas", state: "TX", zip: "75201", sequence: 2 },
        ],
      },
    },
  });

  await request(`/billing/invoices/${load.id}/generate`, { method: "POST" }, auth, 400);
  await request(`/billing/invoices/${load.id}/generate`, { method: "POST" }, auth, 400);

  const dedupeKey = `MISSING_DOC:POD:load:${load.id}`;
  const count = await prisma.task.count({
    where: { orgId: org.id, dedupeKey, status: { in: ["OPEN", "IN_PROGRESS"] } },
  });
  if (count !== 1) {
    throw new Error(`Expected 1 deduped task, got ${count}`);
  }
}

async function main() {
  await testRejectRequiresReason();
  await testInvoiceConcurrency();
  await testTaskDedupe();
  console.log("smoke-failure-paths: PASS");
}

main()
  .catch((error) => {
    console.error("smoke-failure-paths: FAIL");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
