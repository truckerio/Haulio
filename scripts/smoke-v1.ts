import "dotenv/config";
import { prisma, Prisma } from "@truckerio/db";
import { createSession } from "../apps/api/src/lib/auth";
import { createCsrfToken } from "../apps/api/src/lib/csrf";

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
  const orgName = `Smoke V1 ${Date.now()}`;
  const org = await prisma.organization.create({ data: { name: orgName } });

  await prisma.orgSettings.create({
    data: {
      orgId: org.id,
      companyDisplayName: "Smoke V1",
      remitToAddress: "1 Smoke Lane\nAustin, TX 78701",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thanks",
      invoicePrefix: "SV1-",
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

  const admin = await prisma.user.create({
    data: {
      orgId: org.id,
      email: `admin+${Date.now()}@smoke.test`,
      passwordHash: "x",
      role: "ADMIN",
      name: "Smoke Admin",
    },
  });

  const driverUser = await prisma.user.create({
    data: {
      orgId: org.id,
      email: `driver+${Date.now()}@smoke.test`,
      passwordHash: "x",
      role: "DRIVER",
      name: "Smoke Driver",
    },
  });

  await prisma.driver.create({
    data: {
      orgId: org.id,
      userId: driverUser.id,
      name: "Smoke Driver",
    },
  });

  const operatingEntity = await prisma.operatingEntity.create({
    data: {
      orgId: org.id,
      name: "Smoke V1 Carrier",
      type: "CARRIER",
      addressLine1: "1 Smoke Lane",
      remitToName: "Smoke V1 Carrier",
      remitToAddressLine1: "1 Smoke Lane",
      isDefault: true,
    },
  });

  const defaultEntity = await prisma.operatingEntity.findFirst({
    where: { orgId: org.id, isDefault: true },
  });
  if (!defaultEntity) {
    throw new Error("Default operating entity missing");
  }

  const loadNumber = `SV1-${Date.now()}`;
  const load = await prisma.load.create({
    data: {
      orgId: org.id,
      loadNumber,
      loadType: "COMPANY",
      operatingEntityId: operatingEntity.id,
      customerName: "Smoke Customer",
      shipperReferenceNumber: "SHIP-REF-1",
      consigneeReferenceNumber: "CONS-REF-2",
      palletCount: 10,
      weightLbs: 42000,
      rate: new Prisma.Decimal("1500.00"),
      stops: {
        create: [
          {
            orgId: org.id,
            type: "PICKUP",
            name: "Smoke Shipper",
            address: "1 Smoke St",
            city: "Austin",
            state: "TX",
            zip: "78701",
            sequence: 1,
          },
          {
            orgId: org.id,
            type: "DELIVERY",
            name: "Smoke Consignee",
            address: "2 Smoke St",
            city: "Dallas",
            state: "TX",
            zip: "75201",
            sequence: 2,
          },
        ],
      },
    },
  });

  const reloaded = await prisma.load.findFirst({ where: { id: load.id } });
  if (!reloaded) throw new Error("Load not found after create");
  if (reloaded.shipperReferenceNumber !== "SHIP-REF-1") throw new Error("shipperReferenceNumber mismatch");
  if (reloaded.consigneeReferenceNumber !== "CONS-REF-2") throw new Error("consigneeReferenceNumber mismatch");
  if (reloaded.palletCount !== 10) throw new Error("palletCount mismatch");
  if (reloaded.weightLbs !== 42000) throw new Error("weightLbs mismatch");

  const doc = await prisma.loadConfirmationDocument.create({
    data: {
      orgId: org.id,
      uploadedByUserId: admin.id,
      filename: "smoke-confirm.pdf",
      contentType: "application/pdf",
      sizeBytes: 12,
      storageKey: `org/${org.id}/load-confirmations/${Date.now()}/smoke-confirm.pdf`,
      sha256: `smoke-${Date.now()}`,
      status: "NEEDS_REVIEW",
    },
  });

  const auth = await authFor(admin.id);
  const detail = await request<{ doc: any }>(`/api/load-confirmations/${doc.id}`, { method: "GET" }, auth);
  if (detail.doc?.id !== doc.id) throw new Error("Load confirmation detail mismatch");

  const draftPayload = {
    loadNumber: `LC-${Date.now()}`,
    shipperReferenceNumber: "SHIP-REF-9",
    consigneeReferenceNumber: "CONS-REF-9",
    palletCount: 12,
    weightLbs: 38000,
    stops: [
      {
        type: "PICKUP",
        name: "Draft Shipper",
        address1: "1 Draft St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
      {
        type: "DELIVERY",
        name: "Draft Consignee",
        address1: "2 Draft St",
        city: "Houston",
        state: "TX",
        zip: "77001",
      },
    ],
  };

  const draftResponse = await request<{ ready: boolean }>(
    `/api/load-confirmations/${doc.id}/draft`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: draftPayload }),
    },
    auth
  );
  if (!draftResponse.ready) throw new Error("Draft did not validate as ready");

  const created = await request<{ loadId: string }>(
    `/api/load-confirmations/${doc.id}/create-load`,
    { method: "POST" },
    auth
  );
  if (!created.loadId) throw new Error("Load confirmation create-load failed");

  await request(`/tracking/load/${load.id}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerType: "PHONE" }),
  }, auth);

  await request(`/tracking/load/${load.id}/ping`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lat: 30.2672,
      lng: -97.7431,
      accuracyM: 5,
      capturedAt: new Date().toISOString(),
    }),
  }, auth);

  const latest = await request<{ ping: any }>(`/tracking/load/${load.id}/latest`, { method: "GET" }, auth);
  if (!latest.ping) throw new Error("Tracking latest ping missing");

  console.log("smoke-v1: PASS");
}

main()
  .catch((error) => {
    console.error("smoke-v1: FAIL");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
