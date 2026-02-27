import "dotenv/config";
import { LoadChargeType, Prisma, prisma, Role } from "@truckerio/db";
import { createSession } from "../src/lib/auth";
import { createCsrfToken } from "../src/lib/csrf";

const API_BASE = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const ORG_NAME = process.env.ORG_NAME || "Smoke Role Matrix Org";

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
type CheckResult = { role: string; check: string; expected: string; status: number; pass: boolean; detail?: string };

async function authFor(userId: string): Promise<Auth> {
  const session = await createSession({ userId });
  const csrf = createCsrfToken();
  return { cookie: `session=${session.token}; csrf=${csrf}`, csrf };
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

async function ensureOperatingEntity(orgId: string, name: string, remitToAddress?: string | null) {
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

async function request(path: string, options: RequestInit, auth: Auth) {
  const headers = new Headers(options.headers || {});
  headers.set("cookie", auth.cookie);
  if (options.method && options.method !== "GET") {
    headers.set("x-csrf-token", auth.csrf);
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, payload };
}

function isAllowedStatus(status: number) {
  return status !== 401 && status !== 403;
}

function pass(role: string, check: string, expected: string, status: number, ok: boolean, detail?: string): CheckResult {
  return { role, check, expected, status, pass: ok, detail };
}

function buildDocForm() {
  const form = new FormData();
  form.append("file", new Blob(["role-smoke-doc"]), "role-smoke.txt");
  form.append("type", "BOL");
  return form;
}

async function main() {
  const org =
    (await prisma.organization.findFirst({ where: { name: ORG_NAME } })) ||
    (await prisma.organization.create({ data: { name: ORG_NAME } }));

  await ensureOperationalOrg(org.id);

  await prisma.orgSettings.upsert({
    where: { orgId: org.id },
    update: {},
    create: {
      orgId: org.id,
      companyDisplayName: ORG_NAME,
      remitToAddress: "100 Role Matrix Way\nAustin, TX 78701",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thanks",
      invoicePrefix: "RM-",
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

  await ensureOperatingEntity(org.id, ORG_NAME, "100 Role Matrix Way");

  const users = await Promise.all([
    prisma.user.upsert({
      where: { orgId_email: { orgId: org.id, email: "admin@role-smoke.test" } },
      update: { role: Role.ADMIN, name: "Role Admin", isActive: true },
      create: { orgId: org.id, email: "admin@role-smoke.test", role: Role.ADMIN, name: "Role Admin", passwordHash: "x" },
    }),
    prisma.user.upsert({
      where: { orgId_email: { orgId: org.id, email: "dispatcher@role-smoke.test" } },
      update: { role: Role.DISPATCHER, name: "Role Dispatcher", isActive: true },
      create: {
        orgId: org.id,
        email: "dispatcher@role-smoke.test",
        role: Role.DISPATCHER,
        name: "Role Dispatcher",
        passwordHash: "x",
      },
    }),
    prisma.user.upsert({
      where: { orgId_email: { orgId: org.id, email: "head-dispatcher@role-smoke.test" } },
      update: { role: Role.HEAD_DISPATCHER, name: "Role Head Dispatcher", isActive: true },
      create: {
        orgId: org.id,
        email: "head-dispatcher@role-smoke.test",
        role: Role.HEAD_DISPATCHER,
        name: "Role Head Dispatcher",
        passwordHash: "x",
      },
    }),
    prisma.user.upsert({
      where: { orgId_email: { orgId: org.id, email: "billing@role-smoke.test" } },
      update: { role: Role.BILLING, name: "Role Billing", isActive: true },
      create: {
        orgId: org.id,
        email: "billing@role-smoke.test",
        role: Role.BILLING,
        name: "Role Billing",
        passwordHash: "x",
      },
    }),
    prisma.user.upsert({
      where: { orgId_email: { orgId: org.id, email: "safety@role-smoke.test" } },
      update: { role: Role.SAFETY, name: "Role Safety", isActive: true },
      create: {
        orgId: org.id,
        email: "safety@role-smoke.test",
        role: Role.SAFETY,
        name: "Role Safety",
        passwordHash: "x",
      },
    }),
    prisma.user.upsert({
      where: { orgId_email: { orgId: org.id, email: "support@role-smoke.test" } },
      update: { role: Role.SUPPORT, name: "Role Support", isActive: true },
      create: {
        orgId: org.id,
        email: "support@role-smoke.test",
        role: Role.SUPPORT,
        name: "Role Support",
        passwordHash: "x",
      },
    }),
    prisma.user.upsert({
      where: { orgId_email: { orgId: org.id, email: "driver@role-smoke.test" } },
      update: { role: Role.DRIVER, name: "Role Driver", isActive: true },
      create: {
        orgId: org.id,
        email: "driver@role-smoke.test",
        role: Role.DRIVER,
        name: "Role Driver",
        passwordHash: "x",
      },
    }),
  ]);

  const [adminUser, dispatcherUser, headDispatcherUser, billingUser, safetyUser, supportUser, driverUser] = users;

  const driver = await prisma.driver.upsert({
    where: { userId: driverUser.id },
    update: { orgId: org.id, name: driverUser.name ?? "Role Driver", status: "AVAILABLE" },
    create: { orgId: org.id, userId: driverUser.id, name: driverUser.name ?? "Role Driver", status: "AVAILABLE" },
  });

  let truck = await prisma.truck.findFirst({ where: { orgId: org.id, unit: "RM-TRUCK" } });
  if (!truck) {
    truck = await prisma.truck.create({
      data: { orgId: org.id, unit: "RM-TRUCK", vin: "1HGCM82633A004352", status: "AVAILABLE" },
    });
  }
  let trailer = await prisma.trailer.findFirst({ where: { orgId: org.id, unit: "RM-TRAILER" } });
  if (!trailer) {
    trailer = await prisma.trailer.create({
      data: { orgId: org.id, unit: "RM-TRAILER", type: "DRY_VAN", status: "AVAILABLE" },
    });
  }

  const dispatcherAuth = await authFor(dispatcherUser.id);
  const headDispatcherAuth = await authFor(headDispatcherUser.id);
  const adminAuth = await authFor(adminUser.id);
  const billingAuth = await authFor(billingUser.id);
  const safetyAuth = await authFor(safetyUser.id);
  const supportAuth = await authFor(supportUser.id);
  const driverAuth = await authFor(driverUser.id);

  const customerResp = await request(
    "/customers",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Role Smoke Customer ${Date.now()}`, termsDays: 30 }),
    },
    dispatcherAuth
  );
  if (customerResp.status < 200 || customerResp.status >= 300) {
    throw new Error(`Unable to create customer: ${customerResp.status} ${JSON.stringify(customerResp.payload)}`);
  }

  const loadNumber = `RM-${Date.now()}`;
  const now = Date.now();
  const loadResp = await request(
    "/loads",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loadNumber,
        customerId: (customerResp.payload as any).customer.id,
        rate: "1000.00",
        miles: 300,
        stops: [
          {
            type: "PICKUP",
            name: "RM Pickup",
            address: "1 Role St",
            city: "Austin",
            state: "TX",
            zip: "78701",
            appointmentStart: new Date(now + 30 * 60 * 1000).toISOString(),
            appointmentEnd: new Date(now + 60 * 60 * 1000).toISOString(),
            sequence: 1,
          },
          {
            type: "DELIVERY",
            name: "RM Delivery",
            address: "2 Role St",
            city: "Dallas",
            state: "TX",
            zip: "75201",
            appointmentStart: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
            appointmentEnd: new Date(now + 5 * 60 * 60 * 1000).toISOString(),
            sequence: 2,
          },
        ],
      }),
    },
    dispatcherAuth
  );
  if (loadResp.status < 200 || loadResp.status >= 300) {
    throw new Error(`Unable to create load: ${loadResp.status} ${JSON.stringify(loadResp.payload)}`);
  }
  const loadId = (loadResp.payload as any).load.id as string;

  const tripResp = await request(
    "/trips",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loadNumbers: [loadNumber], movementMode: "FTL", status: "PLANNED" }),
    },
    dispatcherAuth
  );
  if (tripResp.status < 200 || tripResp.status >= 300) {
    throw new Error(`Unable to create trip: ${tripResp.status} ${JSON.stringify(tripResp.payload)}`);
  }
  const tripId = (tripResp.payload as any).trip.id as string;

  const assignSetup = await request(
    `/trips/${tripId}/assign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId: driver.id, truckId: truck.id, trailerId: trailer.id, status: "ASSIGNED" }),
    },
    dispatcherAuth
  );
  if (assignSetup.status < 200 || assignSetup.status >= 300) {
    throw new Error(`Unable to assign trip for setup: ${assignSetup.status} ${JSON.stringify(assignSetup.payload)}`);
  }

  const chargeType = Object.values(LoadChargeType)[0] as string;
  const results: CheckResult[] = [];

  const dispatcherChecks = [
    {
      check: "upload docs",
      run: () => request(`/loads/${loadId}/docs`, { method: "POST", body: buildDocForm() }, dispatcherAuth),
    },
    {
      check: "edit charges",
      run: () =>
        request(
          `/loads/${loadId}/charges`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: chargeType, amountCents: 1234, description: "role smoke" }),
          },
          dispatcherAuth
        ),
    },
    {
      check: "start tracking",
      run: () => request(`/tracking/load/${loadId}/start`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }, dispatcherAuth),
    },
    {
      check: "assign trip",
      run: () =>
        request(
          `/trips/${tripId}/assign`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "ASSIGNED" }),
          },
          dispatcherAuth
        ),
    },
  ];

  const headDispatcherChecks = [
    {
      check: "upload docs",
      run: () => request(`/loads/${loadId}/docs`, { method: "POST", body: buildDocForm() }, headDispatcherAuth),
    },
    {
      check: "edit charges",
      run: () =>
        request(
          `/loads/${loadId}/charges`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: chargeType, amountCents: 1250, description: "role smoke head" }),
          },
          headDispatcherAuth
        ),
    },
    {
      check: "start tracking",
      run: () => request(`/tracking/load/${loadId}/start`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }, headDispatcherAuth),
    },
    {
      check: "assign trip",
      run: () =>
        request(
          `/trips/${tripId}/assign`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "ASSIGNED" }),
          },
          headDispatcherAuth
        ),
    },
  ];

  for (const item of dispatcherChecks) {
    const response = await item.run();
    const ok = isAllowedStatus(response.status);
    results.push(pass("DISPATCHER", item.check, "ALLOW", response.status, ok, JSON.stringify(response.payload)));
  }

  for (const item of headDispatcherChecks) {
    const response = await item.run();
    const ok = isAllowedStatus(response.status);
    results.push(pass("HEAD_DISPATCHER", item.check, "ALLOW", response.status, ok, JSON.stringify(response.payload)));
  }

  const parityChecks = ["upload docs", "edit charges", "start tracking", "assign trip"];
  for (const check of parityChecks) {
    const left = results.find((entry) => entry.role === "DISPATCHER" && entry.check === check);
    const right = results.find((entry) => entry.role === "HEAD_DISPATCHER" && entry.check === check);
    if (!left || !right) {
      results.push(pass("PARITY", check, "MATCH", 0, false, "Missing parity rows"));
    } else {
      const same = left.pass === right.pass;
      results.push(pass("PARITY", check, "MATCH", same ? 200 : 500, same, `${left.status} vs ${right.status}`));
    }
  }

  const billingViewCharges = await request(`/loads/${loadId}/charges`, { method: "GET" }, billingAuth);
  results.push(pass("BILLING", "view charges", "ALLOW", billingViewCharges.status, isAllowedStatus(billingViewCharges.status)));
  const billingUploadDocs = await request(`/loads/${loadId}/docs`, { method: "POST", body: buildDocForm() }, billingAuth);
  results.push(pass("BILLING", "upload docs", "ALLOW", billingUploadDocs.status, isAllowedStatus(billingUploadDocs.status)));
  const billingEditCharges = await request(
    `/loads/${loadId}/charges`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: chargeType, amountCents: 1300, description: "billing try" }),
    },
    billingAuth
  );
  results.push(pass("BILLING", "edit charges", "DENY", billingEditCharges.status, billingEditCharges.status === 403));
  const billingAssignTrip = await request(
    `/trips/${tripId}/assign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ASSIGNED" }),
    },
    billingAuth
  );
  results.push(pass("BILLING", "assign trip", "DENY", billingAssignTrip.status, billingAssignTrip.status === 403));

  const safetyLoadRead = await request(`/loads/${loadId}`, { method: "GET" }, safetyAuth);
  results.push(pass("SAFETY", "read load", "ALLOW", safetyLoadRead.status, isAllowedStatus(safetyLoadRead.status)));
  const safetyUpload = await request(`/loads/${loadId}/docs`, { method: "POST", body: buildDocForm() }, safetyAuth);
  results.push(pass("SAFETY", "upload docs", "DENY", safetyUpload.status, safetyUpload.status === 403));
  const safetyEditCharges = await request(
    `/loads/${loadId}/charges`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: chargeType, amountCents: 1200 }),
    },
    safetyAuth
  );
  results.push(pass("SAFETY", "edit charges", "DENY", safetyEditCharges.status, safetyEditCharges.status === 403));

  const supportLoadRead = await request(`/loads/${loadId}`, { method: "GET" }, supportAuth);
  results.push(pass("SUPPORT", "read load", "ALLOW", supportLoadRead.status, isAllowedStatus(supportLoadRead.status)));
  const supportUpload = await request(`/loads/${loadId}/docs`, { method: "POST", body: buildDocForm() }, supportAuth);
  results.push(pass("SUPPORT", "upload docs", "DENY", supportUpload.status, supportUpload.status === 403));
  const supportAssign = await request(
    `/trips/${tripId}/assign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ASSIGNED" }),
    },
    supportAuth
  );
  results.push(pass("SUPPORT", "assign trip", "DENY", supportAssign.status, supportAssign.status === 403));

  const driverTracking = await request(
    `/tracking/load/${loadId}/start`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    driverAuth
  );
  results.push(pass("DRIVER", "start tracking", "ALLOW", driverTracking.status, isAllowedStatus(driverTracking.status)));
  const driverAssign = await request(
    `/trips/${tripId}/assign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ASSIGNED" }),
    },
    driverAuth
  );
  results.push(pass("DRIVER", "assign trip", "DENY", driverAssign.status, driverAssign.status === 403));

  const adminAssign = await request(
    `/trips/${tripId}/assign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ASSIGNED" }),
    },
    adminAuth
  );
  results.push(pass("ADMIN", "assign trip", "ALLOW", adminAssign.status, isAllowedStatus(adminAssign.status)));

  const failed = results.filter((entry) => !entry.pass);

  const grouped = results.reduce<Record<string, CheckResult[]>>((acc, row) => {
    acc[row.role] = acc[row.role] ?? [];
    acc[row.role].push(row);
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        orgId: org.id,
        orgName: org.name,
        apiBase: API_BASE,
        checksRun: results.length,
        failedChecks: failed.length,
        byRole: grouped,
      },
      null,
      2
    )
  );

  if (failed.length > 0) {
    throw new Error(`role-matrix smoke failed (${failed.length} checks)`);
  }

  console.log("smoke-role-matrix: PASS");
}

main()
  .catch((error) => {
    console.error("smoke-role-matrix: FAIL");
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
