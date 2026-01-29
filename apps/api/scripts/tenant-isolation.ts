import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { prisma, Prisma } from "@truckerio/db";
import { createSession } from "../src/lib/auth";
import { createCsrfToken } from "../src/lib/csrf";
import { ensureUploadDirs, resolveUploadPath } from "../src/lib/uploads";

const API_BASE = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

type Auth = { cookie: string; csrf: string };

async function authFor(userId: string): Promise<Auth> {
  const session = await createSession({ userId });
  const csrf = createCsrfToken();
  return { cookie: `session=${session.token}; csrf=${csrf}`, csrf };
}

async function request(pathname: string, options: RequestInit, auth: Auth) {
  const headers = new Headers(options.headers || {});
  headers.set("cookie", auth.cookie);
  if (options.method && options.method !== "GET") {
    headers.set("x-csrf-token", auth.csrf);
  }
  const res = await fetch(`${API_BASE}${pathname}`, { ...options, headers });
  const text = await res.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: res.status, payload };
}

async function main() {
  const orgA = await prisma.organization.create({ data: { name: "Tenant Org A" } });
  const orgB = await prisma.organization.create({ data: { name: "Tenant Org B" } });

  await prisma.orgSettings.create({
    data: {
      orgId: orgB.id,
      companyDisplayName: "Tenant Org B",
      remitToAddress: "1 Tenant Way",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thanks",
      invoicePrefix: "TN-",
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

  const operatingEntityB = await prisma.operatingEntity.create({
    data: {
      orgId: orgB.id,
      name: "Tenant Org B",
      type: "CARRIER",
      addressLine1: "1 Tenant Way",
      remitToName: "Tenant Org B",
      remitToAddressLine1: "1 Tenant Way",
      isDefault: true,
    },
  });

  const userA = await prisma.user.create({
    data: { orgId: orgA.id, email: "tenant-a@test.local", role: "ADMIN", name: "Tenant A", passwordHash: "x" },
  });
  const authA = await authFor(userA.id);

  const loadB = await prisma.load.create({
    data: {
      orgId: orgB.id,
      loadNumber: `TEN-${Date.now()}`,
      loadType: "COMPANY",
      operatingEntityId: operatingEntityB.id,
      customerName: "Tenant Customer",
      rate: new Prisma.Decimal("500.00"),
      stops: {
        create: [
          { orgId: orgB.id, type: "PICKUP", name: "Pickup", address: "1 Tenant", city: "Austin", state: "TX", zip: "78701", sequence: 1 },
          { orgId: orgB.id, type: "DELIVERY", name: "Delivery", address: "2 Tenant", city: "Dallas", state: "TX", zip: "75201", sequence: 2 },
        ],
      },
    },
  });

  await ensureUploadDirs();
  const docsDir = resolveUploadPath("docs");
  const invoiceDir = resolveUploadPath("invoices");
  await fs.mkdir(docsDir, { recursive: true });
  await fs.mkdir(invoiceDir, { recursive: true });

  const docFilename = `tenant-doc-${Date.now()}.txt`;
  await fs.writeFile(path.join(docsDir, docFilename), "tenant doc", "utf8");
  const docB = await prisma.document.create({
    data: {
      orgId: orgB.id,
      loadId: loadB.id,
      type: "POD",
      status: "UPLOADED",
      source: "OPS_UPLOAD",
      filename: docFilename,
      originalName: docFilename,
      mimeType: "text/plain",
      size: 10,
    },
  });

  const invoiceFilename = `tenant-invoice-${Date.now()}.pdf`;
  const invoiceRelPath = path.posix.join("invoices", invoiceFilename);
  await fs.writeFile(resolveUploadPath(invoiceRelPath), "tenant invoice", "utf8");
  const invoiceB = await prisma.invoice.create({
    data: {
      orgId: orgB.id,
      loadId: loadB.id,
      invoiceNumber: `TN-${Date.now()}`,
      totalAmount: new Prisma.Decimal("500.00"),
      pdfPath: invoiceRelPath,
      status: "GENERATED",
    },
  });

  const blockedLoad = await request(`/loads/${loadB.id}`, { method: "GET" }, authA);
  if (blockedLoad.status !== 404 && blockedLoad.status !== 403) {
    throw new Error(`Expected load access blocked, got ${blockedLoad.status}`);
  }

  const blockedDoc = await request(
    `/docs/${docB.id}/verify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requireSignature: true, requirePrintedName: true, requireDeliveryDate: true, pages: 1 }),
    },
    authA
  );
  if (blockedDoc.status !== 404 && blockedDoc.status !== 403) {
    throw new Error(`Expected doc verify blocked, got ${blockedDoc.status}`);
  }

  const blockedInvoice = await request(
    `/billing/invoices/${invoiceB.id}/status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "SENT" }),
    },
    authA
  );
  if (blockedInvoice.status !== 404 && blockedInvoice.status !== 403) {
    throw new Error(`Expected invoice status blocked, got ${blockedInvoice.status}`);
  }

  const blockedDocFile = await request(`/files/docs/${docFilename}`, { method: "GET" }, authA);
  if (blockedDocFile.status !== 404 && blockedDocFile.status !== 403) {
    throw new Error(`Expected doc file blocked, got ${blockedDocFile.status}`);
  }

  const blockedInvoiceFile = await request(`/files/invoices/${invoiceFilename}`, { method: "GET" }, authA);
  if (blockedInvoiceFile.status !== 404 && blockedInvoiceFile.status !== 403) {
    throw new Error(`Expected invoice file blocked, got ${blockedInvoiceFile.status}`);
  }

  console.log("tenant-isolation: PASS");
}

main()
  .catch((error) => {
    console.error("tenant-isolation: FAIL");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
