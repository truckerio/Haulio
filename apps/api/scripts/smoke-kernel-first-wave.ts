import "dotenv/config";
import { Prisma, prisma } from "@truckerio/db";
import { createSession } from "../src/lib/auth";
import { createCsrfToken } from "../src/lib/csrf";

const API_BASE = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

type Auth = { cookie: string; csrf: string };

type KernelAuditAction = "STATE_KERNEL_DIVERGENCE" | "STATE_KERNEL_ENFORCE_VIOLATION" | "STATE_KERNEL_ENFORCE_BLOCKED";

const KERNEL_AUDIT_ACTIONS: KernelAuditAction[] = [
  "STATE_KERNEL_DIVERGENCE",
  "STATE_KERNEL_ENFORCE_VIOLATION",
  "STATE_KERNEL_ENFORCE_BLOCKED",
];

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

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
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
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (expectStatus && response.status !== expectStatus) {
    throw new Error(`Expected ${expectStatus}, got ${response.status} ${path}: ${JSON.stringify(payload)}`);
  }
  if (!expectStatus && !response.ok) {
    throw new Error(`Request failed ${response.status} ${path}: ${JSON.stringify(payload)}`);
  }
  return payload as T;
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

async function ensureOrgSettings(orgId: string) {
  await prisma.orgSettings.upsert({
    where: { orgId },
    update: {
      requiredDocs: ["POD"],
      requiredDriverDocs: [],
      podRequireSignature: true,
      podRequirePrintedName: true,
      podRequireDeliveryDate: true,
      podMinPages: 1,
    },
    create: {
      orgId,
      companyDisplayName: "Kernel Smoke",
      remitToAddress: "100 Kernel Way\nAustin, TX 78701",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thanks",
      invoicePrefix: "KS-",
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
      remitToAddressLine1: "100 Kernel Way",
      isDefault: true,
    },
  });
}

async function assertNoCriticalKernelAudit(orgId: string, since: Date, step: string) {
  const rows = await prisma.auditLog.findMany({
    where: {
      orgId,
      action: { in: KERNEL_AUDIT_ACTIONS },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "asc" },
    select: { action: true, summary: true, meta: true, createdAt: true },
  });

  const criticalRows = rows.filter((row) => {
    if (row.action === "STATE_KERNEL_ENFORCE_BLOCKED") return true;
    if (row.action !== "STATE_KERNEL_DIVERGENCE") return false;
    const meta = asObject(row.meta);
    return toBool(meta.hasBlockingKernelViolations);
  });

  if (criticalRows.length > 0) {
    throw new Error(`Critical kernel audit rows after ${step}: ${JSON.stringify(criticalRows, null, 2)}`);
  }
}

async function runStep(orgId: string, step: string, fn: () => Promise<void>) {
  const since = new Date();
  await fn();
  await assertNoCriticalKernelAudit(orgId, since, step);
}

async function main() {
  const runId = Date.now();
  const org = await prisma.organization.create({
    data: { name: `Kernel First Wave Smoke ${runId}` },
  });
  await ensureOperationalOrg(org.id);
  await ensureOrgSettings(org.id);
  const operatingEntity = await ensureOperatingEntity(org.id, `Kernel Ops ${runId}`);

  const dispatcher = await prisma.user.create({
    data: {
      orgId: org.id,
      email: `dispatch+kernel-${runId}@test.local`,
      role: "DISPATCHER",
      name: "Kernel Dispatch",
      passwordHash: "x",
      isActive: true,
    },
  });
  const billing = await prisma.user.create({
    data: {
      orgId: org.id,
      email: `billing+kernel-${runId}@test.local`,
      role: "BILLING",
      name: "Kernel Billing",
      passwordHash: "x",
      isActive: true,
    },
  });

  const driverUser = await prisma.user.create({
    data: {
      orgId: org.id,
      email: `driver+kernel-${runId}@test.local`,
      role: "DRIVER",
      name: "Kernel Driver",
      passwordHash: "x",
      isActive: true,
    },
  });

  const driver = await prisma.driver.create({
    data: { orgId: org.id, userId: driverUser.id, name: "Kernel Driver", status: "AVAILABLE" },
  });
  const truck = await prisma.truck.create({
    data: {
      orgId: org.id,
      unit: `KS-TRK-${runId}`,
      vin: `1HGCM82633${String(runId).slice(-6)}`,
      status: "AVAILABLE",
    },
  });
  const trailer = await prisma.trailer.create({
    data: {
      orgId: org.id,
      unit: `KS-TRL-${runId}`,
      type: "DRY_VAN",
      status: "AVAILABLE",
    },
  });

  const dispatcherAuth = await authFor(dispatcher.id);
  const billingAuth = await authFor(billing.id);

  const customer = await request<{ customer: { id: string } }>(
    "/customers",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Kernel Customer ${runId}`, termsDays: 30 }),
    },
    dispatcherAuth
  );

  const now = new Date();
  const loadNumber = `KS-${runId}`;
  let loadId = "";
  let tripId = "";
  let deliveryStopId = "";
  let chargeId = "";
  let docId = "";

  await runStep(org.id, "create-load", async () => {
    const payload = await request<{ load: { id: string } }>(
      "/loads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loadNumber,
          customerId: customer.customer.id,
          operatingEntityId: operatingEntity.id,
          rate: "1400.00",
          miles: 300,
          stops: [
            {
              type: "PICKUP",
              name: "Kernel Pickup",
              address: "1 Kernel St",
              city: "Austin",
              state: "TX",
              zip: "78701",
              appointmentStart: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
              appointmentEnd: new Date(now.getTime() + 90 * 60 * 1000).toISOString(),
              sequence: 1,
            },
            {
              type: "DELIVERY",
              name: "Kernel Delivery",
              address: "2 Kernel St",
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
    loadId = payload.load.id;
  });

  await runStep(org.id, "create-trip", async () => {
    const payload = await request<{ trip: { id: string } }>(
      "/trips",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loadNumbers: [loadNumber] }),
      },
      dispatcherAuth
    );
    tripId = payload.trip.id;
  });

  await runStep(org.id, "trip-assign", async () => {
    await request(
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
  });

  await runStep(org.id, "charge-create", async () => {
    const payload = await request<{ charge: { id: string } }>(
      `/loads/${loadId}/charges`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "DETENTION", description: "Detention test", amountCents: 15000 }),
      },
      dispatcherAuth
    );
    chargeId = payload.charge.id;
  });

  await runStep(org.id, "charge-update", async () => {
    await request(
      `/loads/${loadId}/charges/${chargeId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: 16000 }),
      },
      dispatcherAuth
    );
  });

  await runStep(org.id, "charge-delete", async () => {
    await request(
      `/loads/${loadId}/charges/${chargeId}`,
      {
        method: "DELETE",
      },
      dispatcherAuth
    );
  });

  await runStep(org.id, "tracking-start", async () => {
    await request(`/tracking/load/${loadId}/start`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }, dispatcherAuth);
  });

  await runStep(org.id, "tracking-stop", async () => {
    await request(`/tracking/load/${loadId}/stop`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }, dispatcherAuth);
  });

  const loadDetail = await request<{ load: { stops: Array<{ id: string; type: "PICKUP" | "DELIVERY" }> } }>(
    `/loads/${loadId}`,
    { method: "GET" },
    dispatcherAuth
  );
  const pickupStop = loadDetail.load.stops.find((stop) => stop.type === "PICKUP");
  const deliveryStop = loadDetail.load.stops.find((stop) => stop.type === "DELIVERY");
  if (!pickupStop || !deliveryStop) {
    throw new Error("Expected pickup + delivery stops");
  }
  deliveryStopId = deliveryStop.id;

  await runStep(org.id, "pickup-arrive", async () => {
    await request(`/loads/${loadId}/stops/${pickupStop.id}/arrive`, { method: "POST" }, dispatcherAuth);
  });

  await runStep(org.id, "pickup-depart", async () => {
    await request(`/loads/${loadId}/stops/${pickupStop.id}/depart`, { method: "POST" }, dispatcherAuth);
  });

  await runStep(org.id, "delivery-arrive", async () => {
    await request(`/loads/${loadId}/stops/${deliveryStop.id}/arrive`, { method: "POST" }, dispatcherAuth);
  });

  await runStep(org.id, "delivery-depart", async () => {
    await request(`/loads/${loadId}/stops/${deliveryStop.id}/depart`, { method: "POST" }, dispatcherAuth);
  });

  await runStep(org.id, "docs-upload", async () => {
    const form = new FormData();
    form.append("file", new Blob(["pod"]), "pod.txt");
    form.append("type", "POD");
    form.append("stopId", deliveryStopId);
    const payload = await request<{ doc: { id: string } }>(
      `/loads/${loadId}/docs`,
      {
        method: "POST",
        body: form,
      },
      dispatcherAuth
    );
    docId = payload.doc.id;
  });

  await runStep(org.id, "docs-verify", async () => {
    await request(
      `/docs/${docId}/verify`,
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
  });

  const summaryRows = await prisma.auditLog.findMany({
    where: {
      orgId: org.id,
      action: { in: KERNEL_AUDIT_ACTIONS },
    },
    select: { action: true, meta: true },
  });

  const blocking = summaryRows.filter((row) => {
    if (row.action === "STATE_KERNEL_ENFORCE_BLOCKED") return true;
    const meta = asObject(row.meta);
    return row.action === "STATE_KERNEL_DIVERGENCE" && toBool(meta.hasBlockingKernelViolations);
  }).length;

  console.log(
    JSON.stringify(
      {
        orgId: org.id,
        totalKernelAuditRows: summaryRows.length,
        blockingRows: blocking,
      },
      null,
      2
    )
  );
  console.log("smoke-kernel-first-wave: PASS");
}

main()
  .catch((error) => {
    console.error("smoke-kernel-first-wave: FAIL");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
