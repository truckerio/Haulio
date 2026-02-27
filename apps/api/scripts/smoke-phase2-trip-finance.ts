import "dotenv/config";
import assert from "node:assert/strict";
import { prisma, Prisma } from "@truckerio/db";
import { createSession } from "../src/lib/auth";
import { createCsrfToken } from "../src/lib/csrf";

const API_BASE = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

type Auth = { cookie: string; csrf: string };

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

async function main() {
  const suffix = Date.now();
  const org = await prisma.organization.create({
    data: { name: `Phase2 Smoke Org ${suffix}` },
  });
  await ensureOperationalOrg(org.id);

  await prisma.orgSettings.create({
    data: {
      orgId: org.id,
      companyDisplayName: "Phase2 Smoke",
      remitToAddress: "1 Phase2 Way",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thanks",
      invoicePrefix: `P2-${String(suffix).slice(-5)}-`,
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

  const users = await Promise.all(
    [
      { role: "ADMIN", email: `admin+${suffix}@phase2.test`, name: "P2 Admin" },
      { role: "DISPATCHER", email: `dispatch+${suffix}@phase2.test`, name: "P2 Dispatch" },
      { role: "HEAD_DISPATCHER", email: `head+${suffix}@phase2.test`, name: "P2 Head Dispatch" },
      { role: "BILLING", email: `billing+${suffix}@phase2.test`, name: "P2 Billing" },
      { role: "SAFETY", email: `safety+${suffix}@phase2.test`, name: "P2 Safety" },
      { role: "SUPPORT", email: `support+${suffix}@phase2.test`, name: "P2 Support" },
      { role: "DRIVER", email: `driver+${suffix}@phase2.test`, name: "P2 Driver" },
    ].map((entry) =>
      prisma.user.create({
        data: {
          orgId: org.id,
          email: entry.email,
          role: entry.role as any,
          name: entry.name,
          passwordHash: "x",
        },
      })
    )
  );

  const byRole = Object.fromEntries(users.map((user) => [user.role, user]));
  await prisma.driver.create({
    data: {
      orgId: org.id,
      userId: byRole.DRIVER.id,
      name: byRole.DRIVER.name ?? "P2 Driver",
    },
  });

  const operatingEntity = await prisma.operatingEntity.create({
    data: {
      orgId: org.id,
      name: "P2 Carrier",
      type: "CARRIER",
      isDefault: true,
    },
  });

  const makeStops = () => [
    {
      orgId: org.id,
      type: "PICKUP" as const,
      name: "Pickup",
      address: "1 P2 St",
      city: "Austin",
      state: "TX",
      zip: "78701",
      sequence: 1,
    },
    {
      orgId: org.id,
      type: "DELIVERY" as const,
      name: "Delivery",
      address: "2 P2 St",
      city: "Dallas",
      state: "TX",
      zip: "75201",
      sequence: 2,
    },
  ];

  const loadOne = await prisma.load.create({
    data: {
      orgId: org.id,
      loadNumber: `P2-LD-${suffix}-1`,
      loadType: "COMPANY",
      operatingEntityId: operatingEntity.id,
      customerName: "Phase2 Customer A",
      miles: 120,
      paidMiles: new Prisma.Decimal("130"),
      paidMilesSource: "MANUAL_OVERRIDE",
      palletCount: 10,
      weightLbs: 10000,
      stops: { create: makeStops() },
    },
  });
  const loadTwo = await prisma.load.create({
    data: {
      orgId: org.id,
      loadNumber: `P2-LD-${suffix}-2`,
      loadType: "COMPANY",
      operatingEntityId: operatingEntity.id,
      customerName: "Phase2 Customer B",
      miles: 80,
      paidMiles: new Prisma.Decimal("70"),
      paidMilesSource: "PLANNED",
      palletCount: 5,
      weightLbs: 6000,
      stops: { create: makeStops() },
    },
  });

  const trip = await prisma.trip.create({
    data: {
      orgId: org.id,
      tripNumber: `P2-TR-${suffix}`,
      movementMode: "LTL",
      status: "PLANNED",
      loads: {
        create: [
          { orgId: org.id, loadId: loadOne.id, sequence: 1 },
          { orgId: org.id, loadId: loadTwo.id, sequence: 2 },
        ],
      },
    },
  });

  await prisma.accessorial.createMany({
    data: [
      {
        orgId: org.id,
        loadId: loadOne.id,
        type: "DETENTION",
        amount: new Prisma.Decimal("25.50"),
      },
      {
        orgId: org.id,
        loadId: loadTwo.id,
        type: "LUMPER",
        amount: new Prisma.Decimal("4.50"),
      },
    ],
  });

  const payableRun = await prisma.payableRun.create({
    data: {
      orgId: org.id,
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEnd: new Date("2026-02-07T23:59:59.999Z"),
      createdById: byRole.ADMIN.id,
    },
  });
  await prisma.payableLineItem.createMany({
    data: [
      {
        orgId: org.id,
        runId: payableRun.id,
        partyType: "DRIVER",
        partyId: byRole.DRIVER.id,
        loadId: loadOne.id,
        type: "EARNING",
        amountCents: 100_000,
      },
      {
        orgId: org.id,
        runId: payableRun.id,
        partyType: "DRIVER",
        partyId: byRole.DRIVER.id,
        loadId: loadTwo.id,
        type: "REIMBURSEMENT",
        amountCents: 5_000,
      },
      {
        orgId: org.id,
        runId: payableRun.id,
        partyType: "DRIVER",
        partyId: byRole.DRIVER.id,
        loadId: loadTwo.id,
        type: "DEDUCTION",
        amountCents: -3_000,
      },
    ],
  });

  const allowedRoles = ["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"] as const;
  const deniedRoles = ["SAFETY", "SUPPORT", "DRIVER"] as const;

  for (const role of allowedRoles) {
    const auth = await authFor(byRole[role].id);
    const response = await request<{ preview: any }>(
      `/trips/${trip.id}/settlement-preview`,
      { method: "GET" },
      auth
    );
    const preview = response.payload.preview;
    assert.equal(preview.tripId, trip.id);
    assert.equal(preview.plannedMiles, 200);
    assert.equal(preview.paidMiles, 200);
    assert.equal(preview.milesVariance, 0);
    assert.equal(preview.milesSource, "MIXED");
    assert.equal(preview.totalPallets, 15);
    assert.equal(preview.totalWeightLbs, 16000);
    assert.equal(preview.accessorialTotalCents, 3000);
    assert.equal(preview.deductionsTotalCents, 3000);
    assert.equal(preview.netPayPreviewCents, 102000);
  }

  for (const role of deniedRoles) {
    const auth = await authFor(byRole[role].id);
    await request(`/trips/${trip.id}/settlement-preview`, { method: "GET" }, auth, 403);
  }

  const safetyAuth = await authFor(byRole.SAFETY.id);
  const supportAuth = await authFor(byRole.SUPPORT.id);
  await request(`/trips/${trip.id}`, { method: "GET" }, safetyAuth);
  await request(`/trips/${trip.id}`, { method: "GET" }, supportAuth);

  console.log("smoke-phase2-trip-finance: PASS");
}

main()
  .catch((error) => {
    console.error("smoke-phase2-trip-finance: FAIL");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

