import "dotenv/config";
import { prisma, Prisma } from "@truckerio/db";
import { createSession } from "../src/lib/auth";
import { createCsrfToken } from "../src/lib/csrf";

const API_BASE = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

type Auth = { cookie: string; csrf: string };

type RequestResult<T> = {
  status: number;
  payload: T | null;
};

async function authFor(userId: string): Promise<Auth> {
  const session = await createSession({ userId });
  const csrf = createCsrfToken();
  return { cookie: `session=${session.token}; csrf=${csrf}`, csrf };
}

async function request<T>(path: string, options: RequestInit, auth: Auth): Promise<T> {
  const result = await requestRaw<T>(path, options, auth);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Request failed ${result.status} ${path}: ${JSON.stringify(result.payload)}`);
  }
  return result.payload as T;
}

async function requestRaw<T>(path: string, options: RequestInit, auth: Auth): Promise<RequestResult<T>> {
  const headers = new Headers(options.headers || {});
  headers.set("cookie", auth.cookie);
  if (options.method && options.method !== "GET") {
    headers.set("x-csrf-token", auth.csrf);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let payload: T | null = null;
  try {
    payload = text ? (JSON.parse(text) as T) : null;
  } catch {
    payload = text as unknown as T;
  }
  return { status: res.status, payload };
}

async function ensureOperationalOrg(orgId: string) {
  await prisma.onboardingState.upsert({
    where: { orgId },
    update: {
      status: "OPERATIONAL",
      completedSteps: [],
      percentComplete: 100,
      currentStep: 1,
      completedAt: new Date(),
    },
    create: {
      orgId,
      status: "OPERATIONAL",
      completedSteps: [],
      percentComplete: 100,
      currentStep: 1,
      completedAt: new Date(),
    },
  });
}

async function createOrgWithDispatcher(name: string) {
  const org = await prisma.organization.create({ data: { name } });
  await prisma.orgSettings.create({
    data: {
      orgId: org.id,
      companyDisplayName: name,
      remitToAddress: "100 Smoke Way\nAustin, TX 78701",
      invoiceTerms: "Net 30",
      invoiceFooter: "Thanks",
      invoicePrefix: "SM-",
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
  await ensureOperationalOrg(org.id);
  const dispatcher = await prisma.user.create({
    data: {
      orgId: org.id,
      email: `dispatch-${org.id}@smoke.test`,
      role: "DISPATCHER",
      name: "Sequence Dispatcher",
      passwordHash: "x",
    },
  });
  return { org, dispatcher };
}

function buildStops() {
  const now = new Date();
  const pickupStart = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const pickupEnd = new Date(now.getTime() + 90 * 60 * 1000).toISOString();
  const deliveryStart = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
  const deliveryEnd = new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString();
  return [
    {
      type: "PICKUP",
      name: "Smoke Shipper",
      address: "1 Smoke St",
      city: "Austin",
      state: "TX",
      zip: "78701",
      appointmentStart: pickupStart,
      appointmentEnd: pickupEnd,
      sequence: 1,
    },
    {
      type: "DELIVERY",
      name: "Smoke Receiver",
      address: "2 Smoke St",
      city: "Dallas",
      state: "TX",
      zip: "75201",
      appointmentStart: deliveryStart,
      appointmentEnd: deliveryEnd,
      sequence: 2,
    },
  ];
}

function extractSequence(value: string) {
  const match = value.match(/(\d+)$/);
  if (!match) return null;
  return Number(match[1]);
}

async function main() {
  const orgName = `Sequence Smoke ${Date.now()}`;
  const { org, dispatcher } = await createOrgWithDispatcher(orgName);
  const auth = await authFor(dispatcher.id);

  const createLoad = () =>
    request<{ load: any }>(
      "/loads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: "Smoke Customer",
          stops: buildStops(),
        }),
      },
      auth
    );

  const results = await Promise.all(Array.from({ length: 20 }).map(() => createLoad()));
  const loadNumbers = results.map((result) => result.load.loadNumber);
  const unique = new Set(loadNumbers);
  if (unique.size !== loadNumbers.length) {
    throw new Error(`Expected unique load numbers, got ${loadNumbers.length - unique.size} duplicates.`);
  }

  const sequences = loadNumbers
    .map((value) => extractSequence(value))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  const expected = Array.from({ length: 20 }).map((_, index) => 1001 + index);
  if (sequences.length !== expected.length || sequences.some((value, index) => value !== expected[index])) {
    throw new Error(`Expected sequential load numbers 1001-1020, got ${JSON.stringify(sequences)}.`);
  }

  const org2 = await createOrgWithDispatcher(`Sequence Smoke 2 ${Date.now()}`);
  const auth2 = await authFor(org2.dispatcher.id);
  const firstLoad = await request<{ load: any }>(
    "/loads",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Second Customer",
        stops: buildStops(),
      }),
    },
    auth2
  );
  const firstNumber = extractSequence(firstLoad.load.loadNumber);
  if (firstNumber !== 1001) {
    throw new Error(`Expected org 2 to start at 1001, got ${firstLoad.load.loadNumber}.`);
  }

  const manualLoadNumber = "MAN-1001";
  await request(
    "/loads",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loadNumber: manualLoadNumber,
        customerName: "Conflict Customer",
        stops: buildStops(),
      }),
    },
    auth
  );

  const conflict = await requestRaw<{ error?: string; suggestedLoadNumber?: string }>(
    "/loads",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loadNumber: manualLoadNumber,
        customerName: "Conflict Customer",
        stops: buildStops(),
      }),
    },
    auth
  );

  if (conflict.status !== 409) {
    throw new Error(`Expected 409 for duplicate load number, got ${conflict.status}.`);
  }
  if (!conflict.payload?.suggestedLoadNumber) {
    throw new Error("Expected suggestedLoadNumber in conflict response.");
  }

  console.log("Sequence smoke test passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
