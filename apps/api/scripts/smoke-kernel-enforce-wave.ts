import "dotenv/config";
import { Prisma, prisma } from "@truckerio/db";
import { createSession } from "../src/lib/auth";
import { createCsrfToken } from "../src/lib/csrf";

const API_BASE = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const ORG_ID = process.env.ORG_ID || "";
const ORG_NAME = process.env.ORG_NAME || "";

const COMPLETED_ONBOARDING_STEPS = [
  "basics",
  "operating",
  "team",
  "drivers",
  "fleet",
  "preferences",
  "tracking",
  "finance",
] as const;

type Auth = { cookie: string; csrf: string };

async function authFor(userId: string): Promise<Auth> {
  const session = await createSession({ userId });
  const csrf = createCsrfToken();
  return { cookie: `session=${session.token}; csrf=${csrf}`, csrf };
}

async function request(path: string, options: RequestInit, auth: Auth) {
  const headers = new Headers(options.headers || {});
  headers.set("cookie", auth.cookie);
  if (options.method && options.method !== "GET") {
    headers.set("x-csrf-token", auth.csrf);
  }
  const url = `${API_BASE}${path}`;
  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (error) {
    const cause = (error as any)?.cause;
    const detail =
      cause && typeof cause === "object"
        ? JSON.stringify({
            code: cause.code ?? null,
            errno: cause.errno ?? null,
            syscall: cause.syscall ?? null,
            address: cause.address ?? null,
            port: cause.port ?? null,
          })
        : String(error);
    throw new Error(`Fetch failed for ${options.method ?? "GET"} ${url}: ${detail}`);
  }
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, payload };
}

async function ensureOperationalOrg(orgId: string) {
  await prisma.onboardingState.upsert({
    where: { orgId },
    create: {
      orgId,
      status: "OPERATIONAL",
      completedSteps: [...COMPLETED_ONBOARDING_STEPS],
      percentComplete: 100,
      currentStep: COMPLETED_ONBOARDING_STEPS.length,
      completedAt: new Date(),
    },
    update: {
      status: "OPERATIONAL",
      completedSteps: [...COMPLETED_ONBOARDING_STEPS],
      percentComplete: 100,
      currentStep: COMPLETED_ONBOARDING_STEPS.length,
      completedAt: new Date(),
    },
  });
}

async function ensureOrgSettings(orgId: string, orgName: string) {
  await prisma.orgSettings.upsert({
    where: { orgId },
    update: {},
    create: {
      orgId,
      companyDisplayName: orgName,
      remitToAddress: "100 Kernel Enforce Way\nAustin, TX 78701",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thanks",
      invoicePrefix: "KE-",
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
}

async function ensureOperatingEntity(orgId: string, name: string) {
  const existing = await prisma.operatingEntity.findFirst({ where: { orgId, isDefault: true } });
  if (existing) return existing;
  return prisma.operatingEntity.create({
    data: {
      orgId,
      name,
      type: "CARRIER",
      remitToName: name,
      remitToAddressLine1: "100 Kernel Enforce Way",
      isDefault: true,
    },
  });
}

async function resolveOrg() {
  if (ORG_ID) {
    const org = await prisma.organization.findFirst({ where: { id: ORG_ID } });
    if (!org) throw new Error(`ORG_ID not found: ${ORG_ID}`);
    return org;
  }
  if (ORG_NAME) {
    const org = await prisma.organization.findFirst({ where: { name: ORG_NAME } });
    if (!org) throw new Error(`ORG_NAME not found: ${ORG_NAME}`);
    return org;
  }
  throw new Error("Set ORG_ID (recommended) or ORG_NAME for enforce-wave smoke");
}

async function main() {
  const org = await resolveOrg();
  const runId = Date.now();
  await ensureOperationalOrg(org.id);
  await ensureOrgSettings(org.id, org.name);
  const operatingEntity = await ensureOperatingEntity(org.id, org.name);

  const dispatcher = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: `dispatch+ke-${runId}@test.local` } },
    update: { role: "DISPATCHER", name: "Kernel Enforce Dispatch", isActive: true },
    create: {
      orgId: org.id,
      email: `dispatch+ke-${runId}@test.local`,
      role: "DISPATCHER",
      name: "Kernel Enforce Dispatch",
      passwordHash: "x",
      isActive: true,
    },
  });

  const dispatcherAuth = await authFor(dispatcher.id);

  const driverUser = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: `driver+ke-${runId}@test.local` } },
    update: { role: "DRIVER", name: "Kernel Enforce Driver", isActive: true },
    create: {
      orgId: org.id,
      email: `driver+ke-${runId}@test.local`,
      role: "DRIVER",
      name: "Kernel Enforce Driver",
      passwordHash: "x",
      isActive: true,
    },
  });
  const driver = await prisma.driver.upsert({
    where: { userId: driverUser.id },
    update: { orgId: org.id, name: driverUser.name ?? "Kernel Enforce Driver", status: "AVAILABLE" },
    create: { orgId: org.id, userId: driverUser.id, name: driverUser.name ?? "Kernel Enforce Driver", status: "AVAILABLE" },
  });
  const truck = await prisma.truck.upsert({
    where: { orgId_unit: { orgId: org.id, unit: `KE-TRK-${runId}` } },
    update: { status: "AVAILABLE" },
    create: {
      orgId: org.id,
      unit: `KE-TRK-${runId}`,
      vin: `1HGCM82633${String(runId).slice(-6)}`,
      status: "AVAILABLE",
    },
  });
  const trailer = await prisma.trailer.upsert({
    where: { orgId_unit: { orgId: org.id, unit: `KE-TRL-${runId}` } },
    update: { status: "AVAILABLE" },
    create: {
      orgId: org.id,
      unit: `KE-TRL-${runId}`,
      type: "DRY_VAN",
      status: "AVAILABLE",
    },
  });

  const customerResp = await request(
    "/customers",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Kernel Enforce Customer ${runId}`, termsDays: 30 }),
    },
    dispatcherAuth
  );
  if (customerResp.status < 200 || customerResp.status >= 300) {
    throw new Error(`Failed to create customer: ${customerResp.status} ${JSON.stringify(customerResp.payload)}`);
  }
  const customerId = (customerResp.payload as any).customer.id as string;

  const loadNumber = `KE-${runId}`;
  const now = new Date();
  const loadResp = await request(
    "/loads",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loadNumber,
        customerId,
        operatingEntityId: operatingEntity.id,
        rate: "1500.00",
        miles: 200,
        stops: [
          {
            type: "PICKUP",
            name: "KE Pickup",
            address: "1 KE St",
            city: "Austin",
            state: "TX",
            zip: "78701",
            appointmentStart: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
            appointmentEnd: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
            sequence: 1,
          },
          {
            type: "DELIVERY",
            name: "KE Delivery",
            address: "2 KE St",
            city: "Dallas",
            state: "TX",
            zip: "75201",
            appointmentStart: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(),
            appointmentEnd: new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString(),
            sequence: 2,
          },
        ],
      }),
    },
    dispatcherAuth
  );
  if (loadResp.status < 200 || loadResp.status >= 300) {
    throw new Error(`Failed to create load: ${loadResp.status} ${JSON.stringify(loadResp.payload)}`);
  }
  const loadId = (loadResp.payload as any).load.id as string;

  const tripResp = await request(
    "/trips",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loadNumbers: [loadNumber], status: "ASSIGNED", movementMode: "FTL" }),
    },
    dispatcherAuth
  );
  if (tripResp.status < 200 || tripResp.status >= 300) {
    throw new Error(`Failed to create trip: ${tripResp.status} ${JSON.stringify(tripResp.payload)}`);
  }
  const tripId = (tripResp.payload as any).trip.id as string;

  const assignResp = await request(
    `/trips/${tripId}/assign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driverId: driver.id,
        truckId: truck.id,
        trailerId: trailer.id,
        status: "ASSIGNED",
      }),
    },
    dispatcherAuth
  );
  if (assignResp.status < 200 || assignResp.status >= 300) {
    throw new Error(`Failed to assign trip before enforce check: ${assignResp.status} ${JSON.stringify(assignResp.payload)}`);
  }

  // Force load into DRAFT so trip mirror to IN_TRANSIT is an invalid kernel transition (DRAFT -> IN_TRANSIT).
  await prisma.load.update({
    where: { id: loadId },
    data: { status: "DRAFT", billingStatus: "BLOCKED", podVerifiedAt: null, invoicedAt: null },
  });

  const since = new Date();
  const statusResp = await request(
    `/trips/${tripId}/status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "IN_TRANSIT" }),
    },
    dispatcherAuth
  );

  if (statusResp.status < 400) {
    throw new Error(
      `Expected enforced block when mirroring DRAFT load to IN_TRANSIT; got ${statusResp.status}`
    );
  }

  const blockedRows = await prisma.auditLog.findMany({
    where: {
      orgId: org.id,
      action: "STATE_KERNEL_ENFORCE_BLOCKED",
      entity: "Load",
      entityId: loadId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const routeMatch = blockedRows.find((row) => {
    const meta = row.meta as Record<string, unknown> | null;
    const route = meta && typeof meta === "object" ? (meta.route as string | undefined) : undefined;
    return route === "/trips/:id/status";
  });

  if (!routeMatch) {
    throw new Error(
      `No STATE_KERNEL_ENFORCE_BLOCKED audit row for /trips/:id/status after enforce attempt. status=${statusResp.status}`
    );
  }

  console.log(
    JSON.stringify(
      {
        orgId: org.id,
        loadId,
        tripId,
        blockedStatusCode: statusResp.status,
        blockedAuditCount: blockedRows.length,
      },
      null,
      2
    )
  );
  console.log("smoke-kernel-enforce-wave: PASS");
}

main()
  .catch((error) => {
    console.error("smoke-kernel-enforce-wave: FAIL");
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
